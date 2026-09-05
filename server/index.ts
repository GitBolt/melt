import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import {
  getAddress,
  encodeFunctionData,
  keccak256,
  stringToHex,
  verifyMessage,
  type Address,
} from "viem";
import * as chain from "./chain.js";
import { recoverJob } from "./recovery.js";
import { agentTools } from "./tools.js";
await chain.initialize();
fs.mkdirSync("data/outputs", { recursive: true });
const db = new DatabaseSync("data/melt.sqlite");
db.exec(
  `CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,owner TEXT,persona INTEGER,expires INTEGER); CREATE TABLE IF NOT EXISTS keys(hash TEXT PRIMARY KEY,owner TEXT,persona INTEGER,created INTEGER); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT,lot INTEGER,status TEXT,filename TEXT,created INTEGER,tx TEXT,error TEXT);`,
);
const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });
await app.register(cookie);
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
await app.register(rateLimit, { max: 150, timeWindow: "1 minute" });
app.addHook("onRequest", async (req, reply) => {
  if (["POST", "DELETE", "PUT"].includes(req.method) && req.headers.origin) {
    const allowed = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
    if (
      req.headers.origin !== allowed &&
      !(
        chain.demo &&
        ["http://localhost:5173", `http://${req.headers.host}`].includes(
          req.headers.origin,
        )
      )
    )
      return reply.code(403).send({ error: "Origin not allowed" });
  }
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function auth(req: any): { owner: Address; persona: number } {
  const bearer = req.headers.authorization?.replace(/^Bearer /, "");
  const row = bearer
    ? db
        .prepare("SELECT owner,persona FROM keys WHERE hash=?")
        .get(hash(bearer))
    : db
        .prepare(
          "SELECT owner,persona FROM sessions WHERE token=? AND expires>?",
        )
        .get(hash(req.cookies.session || ""), Date.now());
  if (!row)
    throw Object.assign(
      new Error("Connect a wallet or choose a playground account first."),
      { statusCode: 401 },
    );
  return row as any;
}
function session(reply: any, owner: string, persona: number) {
  owner = getAddress(owner);
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
    hash(token),
    owner,
    persona,
    Date.now() + 86400000,
  );
  reply.setCookie("session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: !chain.demo,
    path: "/",
    maxAge: 86400,
  });
}
app.setErrorHandler((error: any, req, reply) => {
  const message =
    error instanceof z.ZodError
      ? error.issues.map((i) => i.message).join(", ")
      : error.shortMessage || error.message || "Request failed";
  reply.code(error.statusCode || 400).send({ error: message });
});
app.get("/api/state", async (req) => {
  let user;
  try {
    user = auth(req);
  } catch {}
  return {
    mode: chain.demo ? "playground" : "wallet",
    chain: {
      id: chain.chain.id,
      name: chain.chain.name,
      contract: chain.address,
    },
    user: user
      ? {
          ...user,
          name: chain.demo
            ? ["Provider", "Alice", "Bob"][user.persona] || "Your wallet"
            : "Your wallet",
        }
      : null,
    ...(await chain.inventory(user?.owner)),
    worker: {
      name: "Melt Workshop",
      workload: "Image resize & WebP conversion",
      concurrency: 2,
      active,
      queued: Math.max(0, admitted - active),
    },
    jobs: user
      ? db
          .prepare(
            "SELECT * FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 50",
          )
          .all(user.owner)
      : [],
  };
});
app.post("/api/session/demo", async (req, reply) => {
  if (!chain.demo)
    return reply.code(403).send({ error: "Playground disabled" });
  const { persona } = z
    .object({ persona: z.union([z.literal(0), z.literal(1), z.literal(2)]) })
    .parse(req.body);
  session(reply, chain.accounts[persona].address, persona);
  return { ok: true };
});
app.delete("/api/session", async (req, reply) => {
  db.prepare("DELETE FROM sessions WHERE token=?").run(
    hash(req.cookies.session || ""),
  );
  reply.clearCookie("session", { path: "/" });
  return { ok: true };
});
const challenges = new Map<string, { message: string; expires: number }>();
app.post("/api/session/challenge", async (req) => {
  const { address } = z
    .object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
    .parse(req.body);
  const nonce = randomBytes(24).toString("hex");
  const message = `Sign in to Melt\nOrigin: ${process.env.APP_ORIGIN || "http://127.0.0.1:5173"}\nAddress: ${address}\nNonce: ${nonce}\nExpires: ${new Date(Date.now() + 300000).toISOString()}`;
  challenges.set(address.toLowerCase(), {
    message,
    expires: Date.now() + 300000,
  });
  return { message };
});
app.post("/api/session/verify", async (req, reply) => {
  const { address, signature } = z
    .object({
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
    })
    .parse(req.body);
  const c = challenges.get(address.toLowerCase());
  challenges.delete(address.toLowerCase());
  if (
    !c ||
    c.expires < Date.now() ||
    !(await verifyMessage({
      address: address as Address,
      message: c.message,
      signature: signature as `0x${string}`,
    }))
  )
    throw new Error("Signature invalid or expired");
  session(reply, address, -1);
  return { ok: true };
});
const actionSchema = z.object({
  action: z.enum(["buy", "list", "take", "cancel", "withdraw"]),
  id: z.number().int().positive().optional(),
  units: z.number().int().min(1).max(1000).optional(),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,18})?$/)
    .optional(),
});
app.post("/api/transactions", async (req) => {
  const user = auth(req);
  const body = actionSchema.parse(req.body);
  const id = BigInt(body.id || 0),
    units = BigInt(body.units || 0);
  let args: any[] = [],
    value = 0n;
  if (["buy", "take", "list", "cancel"].includes(body.action) && !body.id)
    throw new Error("Offer or listing id required");
  if (["buy", "take", "list"].includes(body.action) && !body.units)
    throw new Error("Quantity required");
  if (body.action === "buy") {
    const lot = await chain.read("lots", [id]);
    args = [id, units];
    value = lot[3] * units;
  }
  if (body.action === "take") {
    const item = await chain.read("listings", [id]);
    args = [id, units];
    value = item[3] * units;
  }
  if (body.action === "list") {
    if (!body.price) throw new Error("Price required");
    args = [id, units, chain.parseEther(body.price)];
  }
  if (body.action === "cancel") args = [id];
  if (user.persona >= 0 && chain.demo)
    return { hash: await chain.write(body.action, args, user.persona, value) };
  return {
    transaction: {
      to: chain.address,
      data: encodeFunctionData({
        abi: chain.abi,
        functionName: body.action,
        args,
      }),
      value: `0x${value.toString(16)}`,
      chainId: chain.chain.id,
    },
  };
});
app.post("/api/keys", async (req) => {
  const user = auth(req);
  const token = `melt_${randomBytes(24).toString("hex")}`;
  db.prepare("INSERT INTO keys VALUES(?,?,?,?)").run(
    hash(token),
    user.owner,
    user.persona,
    Date.now(),
  );
  return { token };
});
app.delete("/api/keys", async (req) => {
  const user = auth(req);
  db.prepare("DELETE FROM keys WHERE owner=?").run(user.owner);
  return { ok: true };
});
let active = 0;
let admitted = 0;
const pending: Array<() => Promise<void>> = [];
function drain() {
  while (active < 2 && pending.length) {
    active++;
    pending.shift()!().finally(() => {
      active--;
      admitted--;
      drain();
    });
  }
}
app.post("/api/jobs", async (req, reply) => {
  const user = auth(req);
  const lot = z.coerce
    .number()
    .int()
    .positive()
    .parse((req.query as any).lot);
  const file = await req.file();
  if (!file) throw new Error("Upload an image");
  const input = await file.toBuffer();
  if (file.file.truncated) throw new Error("Image exceeds 10 MB");
  const meta = await sharp(input, { limitInputPixels: 40000000 }).metadata();
  if (!["jpeg", "png", "webp", "avif"].includes(meta.format || ""))
    throw new Error("Use PNG, JPEG, WebP, or AVIF");
  if (admitted >= 22)
    throw Object.assign(new Error("Worker queue full. Try again shortly."), {
      statusCode: 429,
    });
  admitted++;
  const id = randomUUID(),
    jobId = keccak256(stringToHex(id));
  db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)").run(
    id,
    user.owner,
    lot,
    "reserving",
    file.filename,
    Date.now(),
    "",
    null,
  );
  let tx;
  let broadcast = false;
  try {
    tx = await chain.write(
      "startJob",
      [user.owner, BigInt(lot), jobId],
      0,
      0n,
      (hash) => {
        broadcast = true;
        db.prepare("UPDATE jobs SET tx=? WHERE id=?").run(hash, id);
      },
    );
    db.prepare("UPDATE jobs SET status=?,tx=? WHERE id=?").run(
      "queued",
      tx,
      id,
    );
  } catch (e) {
    admitted--;
    db.prepare("UPDATE jobs SET status=?,error=? WHERE id=?").run(
      broadcast ? "needs-recovery" : "rejected",
      (e as any).shortMessage || (e as Error).message,
      id,
    );
    throw e;
  }
  pending.push(async () => {
    db.prepare("UPDATE jobs SET status=? WHERE id=?").run("running", id);
    try {
      await sharp(input, { limitInputPixels: 40000000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toFile(`data/outputs/${id}.webp`);
      const settled = await chain.write("finishJob", [jobId, true]);
      db.prepare("UPDATE jobs SET status=?,tx=? WHERE id=?").run(
        "completed",
        settled,
        id,
      );
    } catch (e) {
      try {
        await chain.write("finishJob", [jobId, false]);
        db.prepare("UPDATE jobs SET status=?,error=? WHERE id=?").run(
          "refunded",
          (e as any).shortMessage || (e as Error).message,
          id,
        );
      } catch {
        db.prepare("UPDATE jobs SET status=?,error=? WHERE id=?").run(
          "needs-recovery",
          (e as any).shortMessage || (e as Error).message,
          id,
        );
      }
    }
  });
  drain();
  return reply.code(202).send({ id, status: "queued", transaction: tx });
});
app.get("/api/jobs/:id/output", async (req, reply) => {
  const user = auth(req);
  const row = db
    .prepare("SELECT * FROM jobs WHERE id=? AND owner=? AND status=?")
    .get((req.params as any).id, user.owner, "completed");
  if (!row) return reply.code(404).send({ error: "Completed job not found" });
  reply
    .header("Content-Type", "image/webp")
    .header(
      "Content-Disposition",
      `attachment; filename="melt-${row.id}.webp"`,
    );
  return fs.createReadStream(`data/outputs/${row.id}.webp`);
});

app.get("/api/receipts/:hash", async (req, reply) => {
  const hash = z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .parse((req.params as any).hash);
  try {
    const receipt = await chain.client.getTransactionReceipt({
      hash: hash as `0x${string}`,
    });
    return {
      hash: receipt.transactionHash,
      block: Number(receipt.blockNumber),
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      chainId: chain.chain.id,
    };
  } catch {
    return reply.code(202).send({ status: "pending", hash });
  }
});
app.post("/api/mcp", async (req, reply) => {
  auth(req);
  const { id, method, params } = z
    .object({
      jsonrpc: z.literal("2.0"),
      id: z.union([z.number(), z.string()]).optional(),
      method: z.string(),
      params: z.any().optional(),
    })
    .parse(req.body);
  if (method.startsWith("notifications/")) return reply.code(202).send();
  let result: any;
  if (method === "initialize")
    result = {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "melt", version: "0.1.0" },
      instructions:
        "Melt trades expiring prepaid image jobs. Never spend twice for a prepaid job. POST multipart image uploads to /api/jobs?lot=N with the same bearer key.",
    };
  else if (method === "ping") result = {};
  else if (method === "tools/list") result = { tools: agentTools };
  else if (method === "tools/call") {
    const headers = {
      authorization: req.headers.authorization || "",
      cookie: req.headers.cookie || "",
    };
    let response;
    if (params?.name === "melt_inventory" || params?.name === "melt_job_status")
      response = await app.inject({
        method: "GET",
        url: "/api/state",
        headers,
      });
    else if (params?.name === "melt_transaction")
      response = await app.inject({
        method: "POST",
        url: "/api/transactions",
        headers,
        payload: params.arguments,
      });
    else
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Unknown tool" },
      };
    const data = response.json();
    result = {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            params.name === "melt_job_status" ? data.jobs : data,
          ),
        },
      ],
      isError: response.statusCode >= 400,
    };
  } else
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    };
  return { jsonrpc: "2.0", id, result };
});
app.post("/api/provider/offers", async (req, reply) => {
  const user = auth(req);
  if (user.owner.toLowerCase() !== chain.operatorAddress.toLowerCase())
    return reply.code(403).send({ error: "Provider wallet required" });
  const { units, hours, price } = z
    .object({
      units: z.number().int().min(1).max(200),
      hours: z.number().int().min(1).max(48),
      price: z.string().regex(/^0\.\d{1,18}$/),
    })
    .parse(req.body);
  const stock = await chain.inventory();
  const outstanding = stock.lots
    .filter((l) => l.expiresAt * 1000 > Date.now())
    .reduce((sum, l) => sum + l.total, 0);
  if (outstanding + units > 1000)
    throw new Error(
      "Workshop reservation limit reached. Wait for existing windows to expire.",
    );
  return {
    hash: await chain.write("issue", [
      BigInt(units),
      BigInt(Math.floor(Date.now() / 1000) + hours * 3600),
      chain.parseEther(price),
    ]),
  };
});

app.get("/api/openapi.yaml", async (_req, reply) =>
  reply
    .type("application/yaml")
    .send(fs.readFileSync("docs/openapi.yaml", "utf8")),
);
app.get("/api/health", () => ({
  ok: true,
  chainId: chain.chain.id,
  worker: "sharp",
  mode: chain.demo ? "local Ethereum" : "configured EVM",
}));
// Reconcile interrupted jobs at startup, then retry uncertain settlements periodically.
let recovering = false;
async function recoverJobs(startup = false) {
  if (recovering) return;
  recovering = true;
  try {
    const query = startup
      ? "SELECT * FROM jobs WHERE status IN ('queued','running','needs-recovery','reserving')"
      : "SELECT * FROM jobs WHERE status='needs-recovery'";
    for (const row of db.prepare(query).all()) {
      const id = keccak256(stringToHex(row.id as string));
      const status = await recoverJob({
        state: async () => Number((await chain.read("jobs", [id]))[2]),
        refund: () => chain.write("finishJob", [id, false]),
        receipt: async () => {
          if (!row.tx) return "pending";
          try {
            return (
              await chain.client.getTransactionReceipt({
                hash: row.tx as `0x${string}`,
              })
            ).status;
          } catch {
            return "pending";
          }
        },
      });
      db.prepare("UPDATE jobs SET status=? WHERE id=?").run(status, row.id);
    }
  } finally {
    recovering = false;
  }
}
await recoverJobs(true);
setInterval(
  () => void recoverJobs().catch(() => app.log.warn("Job recovery will retry")),
  30000,
).unref();
if (fs.existsSync("dist")) {
  await app.register(staticFiles, { root: path.resolve("dist") });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found" })
      : reply.sendFile("index.html"),
  );
}
await app.listen({ port: 8787, host: "127.0.0.1" });
