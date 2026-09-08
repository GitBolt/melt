import { errorMessage } from "./errors.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { randomUUID, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { createTask, type Task } from "../../../packages/shared/src/index.js";
import { db, digest, get, list, save, event, serial } from "./store.js";
import {
  local,
  chain,
  operator,
  fixture,
  initialize,
  deployTask,
  refreshBalance,
  reconcile,
  demoOwner,
  client,
} from "./chain.js";
import { authenticate } from "./auth.js";
import {
  start,
  pause,
  finish,
  observe,
  doAction,
  snapshot,
  checkURL,
  shutdownBrowsers,
  actionSchema,
  verifyBrowserRuntime,
} from "./browser.js";
import { startFixtures, registerFixtures } from "./fixtures.js";
import { uniswapQuote, prepareSwap, checkApproval } from "./uniswap.js";
let browserAvailable = false;
let lastBrowserCheck = 0;
let browserCheck: Promise<void> | undefined;
async function checkBrowserRuntime() {
  if (!browserCheck) {
    browserCheck = verifyBrowserRuntime()
      .then(
        () => {
          browserAvailable = true;
        },
        () => {
          browserAvailable = false;
        },
      )
      .finally(() => {
        lastBrowserCheck = Date.now();
        browserCheck = undefined;
      });
  }
  await browserCheck;
}
await checkBrowserRuntime();
await initialize();
const fixtureServer = local ? await startFixtures() : undefined;
const app = Fastify({
  logger: { redact: ["req.headers.authorization", "req.headers.cookie"] },
  bodyLimit: 64000,
});
await app.register(cookie);
await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
if (!local && process.env.ENABLE_TEST_FIXTURES === "true")
  registerFixtures(app, "/demo");
const fixtureOrigin =
  process.env.FIXTURE_ORIGIN ||
  (local ? "http://127.0.0.1:8788" : `${process.env.APP_ORIGIN}/demo`);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
app.addHook("onRequest", async (req, reply) => {
  reply
    .header("Cache-Control", "no-store")
    .header("X-Content-Type-Options", "nosniff")
    .header("Referrer-Policy", "no-referrer");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !req.headers.authorization
  ) {
    if (req.headers.origin !== origin)
      throw Object.assign(Error("Origin not allowed"), { statusCode: 403 });
  }
});
app.setErrorHandler((error: any, _req, reply) => {
  const code = error instanceof z.ZodError ? 400 : error.statusCode || 400;
  reply
    .code(code)
    .send({ error: code === 500 ? "Request failed" : errorMessage(error) });
});
app.get("/api/health", async () => ({
  ok: true,
  browser: browserAvailable
    ? process.env.BROWSERLESS_TOKEN
      ? "remote-browser"
      : "sandboxed-chromium"
    : "unavailable",
  mode: local ? "local" : "configured",
  chainId: await client.getChainId(),
}));
app.get("/api/config", async () => ({
  mode: local ? "local" : "configured",
  chain: {
    id: chain.id,
    name: chain.name,
    symbol: chain.nativeCurrency.symbol,
    explorer: process.env.EXPLORER_URL,
  },
  privyAppId: local ? undefined : process.env.PRIVY_APP_ID,
  browserAvailable,
  modelConfigured: !!(process.env.AI_API_KEY && process.env.AI_MODEL),
  swapsConfigured: !!process.env.UNISWAP_API_KEY,
  publicRpcUrl: process.env.VITE_RPC_URL,
  fixture: {
    available:
      local ||
      (process.env.ENABLE_TEST_FIXTURES === "true" &&
        fixture !== "0x0000000000000000000000000000000000000000"),
    url: `${fixtureOrigin}/studio`,
    alternateUrl: `${fixtureOrigin}/print-shop`,
    target: fixture,
    selector: "0x1249c58b",
    price: "0.0001",
  },
  operator,
}));
app.post(
  "/api/auth/local",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (_req, reply) => {
    if (!local)
      throw Object.assign(Error("Local sign-in is disabled"), {
        statusCode: 404,
      });
    const token = randomBytes(32).toString("hex"),
      id = "local:" + randomUUID();
    db.prepare("INSERT INTO auth_sessions VALUES(?,?,?,?)").run(
      digest(token),
      id,
      demoOwner.address,
      Date.now() + 7 * 86400000,
    );
    reply.setCookie("melt_session", token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 604800,
    });
    return { id, owner: demoOwner.address };
  },
);
app.get("/api/me", async (req) => authenticate(req));
app.post("/api/auth/logout", async (req, reply) => {
  const token = req.cookies.melt_session;
  if (token)
    db.prepare("DELETE FROM auth_sessions WHERE hash=?").run(digest(token));
  reply.clearCookie("melt_session", { path: "/" });
  return { ok: true };
});
async function owned(req: any) {
  const user = await authenticate(req);
  const task = get(req.params.id);
  if (task.userId !== user.id)
    throw Object.assign(Error("Session not found"), { statusCode: 404 });
  return { task, user };
}
app.get("/api/sessions", async (req) => {
  const user = await authenticate(req);
  return list(user.id);
});
app.post(
  "/api/sessions",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (req, reply) => {
    const user = await authenticate(req);
    if (user.apiKey)
      throw Object.assign(
        Error("Only the owner can authorize a new allowance"),
        { statusCode: 403 },
      );
    const input = createTask.parse(req.body);
    if (input.recovery.toLowerCase() !== user.owner.toLowerCase())
      throw Error("Recovery must be your authenticated wallet");
    if (
      [
        "0x095ea7b3",
        "0xa22cb465",
        "0xd505accf",
        "0x23b872dd",
        "0xa9059cbb",
      ].includes(input.selector.toLowerCase())
    )
      throw Error("Token approvals and arbitrary transfers are not supported");

    await checkURL(input.url);
    const raw = req.headers["idempotency-key"];
    if (typeof raw !== "string" || raw.length < 8 || raw.length > 128)
      throw Error("Provide an Idempotency-Key header (8–128 characters)");
    const key = user.id + ":" + raw;
    return serial("create:" + user.id, async () => {
      const previous = db
        .prepare("SELECT task_id FROM idempotency WHERE key=?")
        .get(key);
      if (previous) {
        const prior = get(previous.task_id as string);
        if (JSON.stringify(createTask.parse(prior)) !== JSON.stringify(input))
          throw Object.assign(
            Error("This Idempotency-Key belongs to a different request"),
            { statusCode: 409 },
          );
        return prior;
      }
      await requireBrowser();
      if (list(user.id).filter((t) => t.status !== "closed").length >= 10)
        throw Error("Close an existing session before creating another");
      const task: Task = {
        ...input,
        id: randomUUID(),
        userId: user.id,
        vault: "",
        createdAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + input.durationMinutes * 60,
        status: "funding",
        spent: "0",
        balance: "0",
        returned: "0",
        events: [],
        transactions: [],
        assets: [],
        agentMode:
          process.env.AI_API_KEY && process.env.AI_MODEL ? "model" : "manual",
        outcome: "pending",
      };
      save(task);
      db.prepare("INSERT INTO idempotency VALUES(?,?)").run(key, task.id);
      event(task, "info", "Spending limit set");
      try {
        await deployTask(task);
      } catch (e) {
        task.status = "attention";
        task.error = errorMessage(e);
        event(task, "error", task.error);
      }
      reply.code(201);
      return task;
    });
  },
);
app.get("/api/sessions/:id", async (req) => (await owned(req)).task);
async function requireBrowser() {
  if (!browserAvailable && Date.now() - lastBrowserCheck > 60000)
    await checkBrowserRuntime();
  if (!browserAvailable)
    throw Object.assign(
      Error(
        "Browser service is unavailable. Existing wallets can still be closed and recovered.",
      ),
      { statusCode: 503 },
    );
}
app.post("/api/sessions/:id/start", async (req) => {
  const { task } = await owned(req);
  const { manual } = z
    .object({ manual: z.boolean().default(false) })
    .parse(req.body || {});
  await requireBrowser();
  await start(task.id, manual);
  return task;
});
app.post("/api/sessions/:id/pause", async (req) => {
  const { task } = await owned(req);
  if (task.status !== "running") throw Error("Session is not running");
  pause(task.id);
  return task;
});
app.post("/api/sessions/:id/close", async (req) => {
  const { task } = await owned(req);
  await finish(task.id);
  return task;
});
app.post("/api/sessions/:id/recover", async (req) => {
  const { task, user } = await owned(req);
  if (user.apiKey)
    throw Object.assign(Error("Owner sign-in required"), { statusCode: 403 });
  if (!["closed", "attention"].includes(task.status))
    throw Error("End the session before adding a recovery asset");
  const input = z
    .object({
      kind: z.enum(["erc20", "erc721"]),
      token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      tokenId: z.string().regex(/^\d+$/).max(78).optional(),
    })
    .parse(req.body);
  if (input.kind === "erc721" && !input.tokenId)
    throw Error("A collectible token ID is required");
  if (input.kind === "erc20") delete input.tokenId;
  const existing = task.assets.find(
    (a) =>
      a.token.toLowerCase() === input.token.toLowerCase() &&
      a.tokenId === input.tokenId,
  );
  if (existing) existing.recovered = false;
  else task.assets.push({ ...input, recovered: false });
  save(task);
  await finish(task.id);
  return task;
});
app.post("/api/sessions/:id/funding", async (req) => {
  const { task, user } = await owned(req);
  if (user.apiKey)
    throw Object.assign(Error("Owner sign-in required"), { statusCode: 403 });
  const { hash } = z
    .object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })
    .parse(req.body);
  const transaction = await client.getTransaction({
    hash: hash as `0x${string}`,
  });
  if (
    transaction.from.toLowerCase() !== user.owner.toLowerCase() ||
    transaction.to?.toLowerCase() !== task.vault.toLowerCase() ||
    transaction.value <= 0n
  )
    throw Error("Transaction is not owner funding for this task");
  const receipt = await client.getTransactionReceipt({
    hash: hash as `0x${string}`,
  });
  if (receipt.status !== "success") throw Error("Funding transaction reverted");
  if (!task.transactions.some((t) => t.hash === hash)) {
    task.transactions.push({
      hash,
      kind: "Owner funded task wallet",
      status: "success",
      gasWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    event(task, "success", "Funds added to your task wallet", hash);
  }
  await refreshBalance(task);
  if (task.status === "funding" && Number(task.balance) > 0)
    task.status = "ready";
  save(task);
  return task;
});
app.post("/api/sessions/:id/refresh", async (req) => {
  const { task } = await owned(req);
  return serial(task.id, async () => {
    await reconcile(task);
    await refreshBalance(task);
    if (task.status === "funding" && Number(task.balance) > 0) {
      task.status = "ready";
      save(task);
    }
    return task;
  });
});
app.get("/api/sessions/:id/browser", async (req) => {
  const { task } = await owned(req);
  return observe(task.id);
});
app.get("/api/sessions/:id/screenshot", async (req, reply) => {
  const { task } = await owned(req);
  return reply.type("image/jpeg").send(await snapshot(task.id));
});
app.post("/api/sessions/:id/action", async (req) => {
  const { task } = await owned(req);
  if (task.status !== "paused")
    throw Error("Take control before interacting with the page");
  await doAction(task.id, actionSchema.parse(req.body));
  return task;
});
app.get("/api/sessions/:id/receipt", async (req, reply) => {
  const { task } = await owned(req);
  return reply
    .header(
      "Content-Disposition",
      `attachment; filename="melt-${task.id}.json"`,
    )
    .send({
      ...task,
      schemaVersion: 1,
      chainId: chain.id,
      network: chain.name,
    });
});
app.get("/api/keys", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  return db
    .prepare(
      "SELECT rowid AS id,name,created,revoked FROM tokens WHERE user_id=?",
    )
    .all(user.id);
});
app.post("/api/keys", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  const { name } = z
    .object({ name: z.string().trim().min(1).max(80) })
    .parse(req.body);
  const token = "melt_" + randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO tokens(hash,user_id,name,created) VALUES(?,?,?,?)",
  ).run(digest(token), user.id, name, new Date().toISOString());
  return { token, scopes: ["sessions:read", "sessions:run", "sessions:close"] };
});
app.delete("/api/keys/:id", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  db.prepare("UPDATE tokens SET revoked=1 WHERE rowid=? AND user_id=?").run(
    (req.params as any).id,
    user.id,
  );
  return { ok: true };
});
app.post("/api/uniswap/quote", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  return uniswapQuote(req.body, user.owner);
});
app.post("/api/uniswap/approval", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  return checkApproval(req.body, user.owner);
});
app.post("/api/uniswap/swap", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  return prepareSwap(req.body, user.owner);
});
for (const [route, file, type] of [
  [
    "/api/client.mjs",
    "packages/sdk/client.mjs",
    "text/javascript; charset=utf-8",
  ],
  [
    "/api/client.d.mts",
    "packages/sdk/client.d.mts",
    "text/plain; charset=utf-8",
  ],
] as const) {
  app.get(route, async (_req, reply) =>
    reply
      .type(type)
      .header(
        "Content-Disposition",
        `attachment; filename="melt-${file.split("/").pop()}"`,
      )
      .send(readFileSync(file, "utf8")),
  );
}
app.get("/api/openapi.json", async () =>
  JSON.parse(readFileSync("docs/openapi.json", "utf8")),
);
if (existsSync("dist/index.html")) {
  await app.register(staticFiles, { root: resolve("dist"), wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found" })
      : reply.sendFile("index.html"),
  );
}
// A restarted worker never resumes financial work silently.
for (const task of list()) {
  if (["running", "paused", "closing"].includes(task.status)) {
    task.status = task.status === "closing" ? "attention" : "paused";
    event(
      task,
      "info",
      "Session paused by a restart. Review its transactions before resuming, or return your funds.",
    );
  }
}
const timer = setInterval(() => {
  for (const task of list())
    if (
      ["ready", "running", "paused", "funding"].includes(task.status) &&
      task.vault &&
      task.expiresAt * 1000 <= Date.now()
    )
      void finish(task.id);
}, 10000);
app.addHook("onClose", async () => {
  clearInterval(timer);
  await shutdownBrowsers();
  await fixtureServer?.close();
});
await app.listen({
  host: local ? "127.0.0.1" : process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 8787),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
