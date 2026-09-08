import { errorMessage } from "./errors.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { randomUUID, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { toFunctionSelector, parseEther, formatEther } from "viem";
import {
  createTask,
  createEnvelope,
  type Task,
} from "../../../packages/shared/src/index.js";
import { forbiddenSelectors } from "./policy.js";
import {
  db,
  digest,
  get,
  getByReceiptToken,
  list,
  save,
  event,
  serial,
} from "./store.js";
import {
  local,
  chain,
  operator,
  fixture,
  tipJar,
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
import { hasModelConfiguration } from "./agent.js";
import { startFixtures, registerFixtures } from "./fixtures.js";
import { uniswapQuote, prepareSwap, checkApproval } from "./uniswap.js";
import {
  swapAvailable,
  quoteSwap,
  resolveToken,
  UNISWAP,
  TOKENS,
  SWAP_SELECTOR,
} from "./swap.js";
import { parseSwapIntent } from "./intent.js";
import { address } from "../../../packages/shared/src/index.js";
import { publicReceipt } from "./receipt.js";
import {
  canAccessEnvelope,
  createFundedEnvelope,
  findEnvelopeOptions,
  getEnvelope,
  listEnvelopes,
  proposePurchase,
  redeemQuote,
  redemptionStatus,
} from "./envelopes.js";
import {
  WEBHOOK_TYPES,
  createWebhook,
  deleteWebhook,
  emit,
  listEvents,
  listWebhooks,
  pingWebhook,
  type WebhookType,
} from "./webhooks.js";
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
// A slow mainnet-fork RPC read should never take the whole process down.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (ignored to stay up):", reason);
});
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
  modelConfigured: hasModelConfiguration(),
  swapsConfigured: !!process.env.UNISWAP_API_KEY,
  swap: {
    available: await swapAvailable(),
    router: UNISWAP.router,
    tokens: TOKENS,
  },
  publicRpcUrl: process.env.VITE_RPC_URL,
  envelopes: { available: true },
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
    pay: {
      available:
        local ||
        (process.env.ENABLE_TEST_FIXTURES === "true" &&
          tipJar !== "0x0000000000000000000000000000000000000000"),
      url: `${fixtureOrigin}/kiosk`,
      target: tipJar,
      selector: toFunctionSelector("tip()"),
      price: "0.0001",
    },
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
    const token = randomBytes(32).toString("hex");
    const prior = db
      .prepare("SELECT user_id FROM tasks ORDER BY rowid DESC LIMIT 1")
      .get() as { user_id?: string } | undefined;
    const id = prior?.user_id || "local:playground";
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
async function accessibleEnvelope(req: any) {
  const user = await authenticate(req);
  const envelope = getEnvelope(req.params.id);
  if (!canAccessEnvelope(envelope, user))
    throw Object.assign(Error("Envelope not found"), { statusCode: 404 });
  return { envelope, user };
}
app.get("/api/envelopes", async (req) => {
  const user = await authenticate(req);
  return listEnvelopes(user.id, user.owner);
});
app.post(
  "/api/envelopes",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (req, reply) => {
    const user = await authenticate(req);
    if (user.apiKey)
      throw Object.assign(Error("Only the owner can fund a new envelope"), {
        statusCode: 403,
      });
    const input = createEnvelope.parse(req.body);
    const raw = req.headers["idempotency-key"];
    if (typeof raw !== "string" || raw.length < 8 || raw.length > 128)
      throw Error("Provide an Idempotency-Key header (8–128 characters)");
    const key = user.id + ":envelope:" + raw;
    return serial("create:" + user.id, async () => {
      const previous = db
        .prepare("SELECT task_id FROM idempotency WHERE key=?")
        .get(key);
      if (previous) return getEnvelope(previous.task_id as string);
      if (list(user.id).filter((t) => t.status !== "closed").length >= 10)
        throw Error("Close an existing envelope before creating another");
      const envelope = await createFundedEnvelope(user, input);
      db.prepare("INSERT INTO idempotency VALUES(?,?)").run(key, envelope.id);
      reply.code(201);
      return envelope;
    });
  },
);
app.get(
  "/api/envelopes/:id",
  async (req) => (await accessibleEnvelope(req)).envelope,
);
app.get("/api/envelopes/:id/options", async (req) => {
  const { envelope } = await accessibleEnvelope(req);
  const request = String((req.query as { q?: string }).q || "");
  return findEnvelopeOptions(envelope, request);
});
app.post(
  "/api/envelopes/:id/propose",
  { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
  async (req) => {
    const { envelope } = await accessibleEnvelope(req);
    const body = z
      .object({
        sku: z.string().trim().min(1).max(80),
        request: z.string().trim().max(500).optional().default(""),
      })
      .parse(req.body);
    return proposePurchase(envelope, body.sku, body.request);
  },
);
app.post(
  "/api/envelopes/:id/redeem",
  { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
  async (req) => {
    const { envelope } = await accessibleEnvelope(req);
    const body = req.body as Record<string, unknown> | undefined;
    if (
      body &&
      (body.to || body.transfer || body.recipient || body.amount) &&
      !body.quoteId
    )
      throw Object.assign(
        Error(
          "An envelope cannot send unrestricted cash. Propose a purchase, then redeem that quote.",
        ),
        { statusCode: 400 },
      );
    const parsed = z.object({ quoteId: z.string().uuid() }).parse(req.body);
    return redeemQuote(envelope, parsed.quoteId);
  },
);
app.get("/api/envelopes/:id/redemptions", async (req) => {
  const { envelope } = await accessibleEnvelope(req);
  return redemptionStatus(envelope);
});
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
    // Reliable natural-language swaps: a plain instruction like "swap 0.05 ETH
    // for USDC" becomes a deterministic onchain swap when Uniswap is available.
    if (
      input.kind === "browse" &&
      !input.url &&
      !input.target &&
      (await swapAvailable())
    ) {
      const intent = parseSwapIntent(input.instruction);
      if (intent) {
        try {
          const token = await resolveToken(intent.tokenOut);
          input.kind = "swap";
          input.swap = {
            tokenOut: token.address,
            symbol: token.symbol,
            amountIn: intent.amountIn,
            slippageBps: 50,
            buys: 1,
            intervalSec: 60,
          };
        } catch {
          /* Unknown token symbol; keep this as a browser task. */
        }
      }
    }
    if (input.kind === "swap") {
      if (!input.swap) throw Error("A swap task needs swap details");
      if (!(await swapAvailable()))
        throw Error(
          "Onchain swaps need a Uniswap-enabled network. Run with MELT_FORK=1 or use a Uniswap-supported chain.",
        );
      const token = await resolveToken(input.swap.tokenOut);
      // Validate that a route exists now so the user does not fund a dead pair.
      await quoteSwap({
        tokenOut: token.address,
        amountIn: input.swap.amountIn,
        slippageBps: input.swap.slippageBps,
      });
      input.swap.tokenOut = token.address;
      input.swap.symbol = token.symbol;
      // Lock the vault to only the Uniswap router + swap function, and hold
      // exactly the total across all scheduled buys so nothing else is spent.
      const totalWei =
        parseEther(input.swap.amountIn) * BigInt(input.swap.buys);
      if (totalWei > parseEther("10"))
        throw Error("Total swap budget must be 10 or less");
      input.target = UNISWAP.router;
      input.selector = SWAP_SELECTOR;
      input.budget = formatEther(totalWei);
      input.url = "";
    }
    if (
      input.selector &&
      forbiddenSelectors.includes(input.selector.toLowerCase())
    )
      throw Error("Token approvals and arbitrary transfers are not supported");

    if (input.url) await checkURL(input.url);
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
      if (input.kind !== "swap") await requireBrowser();
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
        agentMode: hasModelConfiguration() ? "model" : "manual",
        outcome: "pending",
      };
      save(task);
      db.prepare("INSERT INTO idempotency VALUES(?,?)").run(key, task.id);
      event(task, "info", "Spending limit set");
      try {
        await deployTask(task);
        emit(user.id, "session.created", task);
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
  if (task.kind !== "swap") await requireBrowser();
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
  const closed = get(task.id);
  emit(closed.userId, "session.recovered", closed);
  return closed;
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
  if (task.status === "funding" && Number(task.balance) > 0) {
    task.status = "ready";
    save(task);
    emit(task.userId, "session.funded", task);
    if (task.envelopeId)
      emit(task.userId, "envelope.funded", task, {
        envelopeId: task.envelopeId,
      });
  } else save(task);
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
      emit(task.userId, "session.funded", task);
      if (task.envelopeId)
        emit(task.userId, "envelope.funded", task, {
          envelopeId: task.envelopeId,
        });
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
app.get(
  "/api/public/receipts/:token",
  { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
  async (req) => {
    const token = String((req.params as { token: string }).token || "");
    const task = getByReceiptToken(token);
    return publicReceipt(task, {
      id: chain.id,
      name: chain.name,
      symbol: chain.nativeCurrency.symbol,
      explorer: process.env.EXPLORER_URL,
    });
  },
);
app.get("/api/events", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  return listEvents(user.id);
});
app.get("/api/webhooks", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  return listWebhooks(user.id);
});
app.post("/api/webhooks", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  const body = z
    .object({
      url: z.string().trim().url().max(2048),
      events: z
        .array(z.enum(WEBHOOK_TYPES))
        .min(1)
        .max(WEBHOOK_TYPES.length)
        .default(
          WEBHOOK_TYPES.filter((type) => type !== "webhook.test") as [
            WebhookType,
            ...WebhookType[],
          ],
        ),
    })
    .parse(req.body);
  return createWebhook(user.id, body.url, body.events);
});
app.post("/api/webhooks/:id/ping", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  return pingWebhook(user.id, (req.params as { id: string }).id);
});
app.delete("/api/webhooks/:id", async (req) => {
  const user = await authenticate(req);
  if (user.apiKey) throw Error("Owner sign-in required");
  deleteWebhook(user.id, (req.params as { id: string }).id);
  return { ok: true };
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
  return {
    token,
    scopes: [
      "sessions:read",
      "sessions:run",
      "sessions:close",
      "envelopes:read",
      "envelopes:redeem",
    ],
  };
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
app.get("/api/swap/tokens", async () => ({
  available: await swapAvailable(),
  router: UNISWAP.router,
  tokens: TOKENS,
}));
app.post(
  "/api/swap/quote",
  { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
  async (req) => {
    await authenticate(req);
    const body = z
      .object({
        tokenOut: z.union([address, z.string().trim().min(1).max(20)]),
        amountIn: z
          .string()
          .regex(/^\d+(\.\d{1,18})?$/)
          .refine((v) => Number(v) > 0 && Number(v) <= 10, "Use 0–10"),
        slippageBps: z.number().int().min(1).max(5000).optional(),
      })
      .parse(req.body);
    return quoteSwap(body);
  },
);
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
