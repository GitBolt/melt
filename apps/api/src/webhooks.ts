import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Task } from "../../../packages/shared/src/index.js";
import { db } from "./store.js";
import { publicReceipt } from "./receipt.js";
import { chain, local } from "./chain.js";

export const WEBHOOK_TYPES = [
  "session.created",
  "session.funded",
  "session.started",
  "swap.executed",
  "session.closed",
  "session.recovered",
  "envelope.created",
  "envelope.funded",
  "envelope.redeemed",
  "envelope.thanked",
  "webhook.test",
] as const;
export type WebhookType = (typeof WEBHOOK_TYPES)[number];

db.exec(`
CREATE TABLE IF NOT EXISTS webhooks(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  created TEXT NOT NULL,
  events TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  task_id TEXT,
  payload TEXT NOT NULL,
  created TEXT NOT NULL
);
`);

const native = chain.nativeCurrency.symbol;
function chainInfo() {
  return {
    id: chain.id,
    name: chain.name,
    symbol: native,
    explorer: process.env.EXPLORER_URL,
  };
}

export function meltSignature(
  secret: string,
  payload: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

export function verifyMeltSignature(
  secret: string,
  payload: string,
  header: string,
  toleranceSec = 300,
) {
  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const i = piece.indexOf("=");
      return [piece.slice(0, i), piece.slice(i + 1)];
    }),
  );
  const timestamp = Number(parts.t);
  const expected = meltSignature(secret, payload, timestamp).match(
    /v1=(.+)$/,
  )?.[1];
  if (!Number.isFinite(timestamp) || !parts.v1 || !expected) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) return false;
  const a = Buffer.from(parts.v1, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assertWebhookUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(Error("Enter a valid webhook URL"), {
      statusCode: 400,
    });
  }
  if (url.username || url.password)
    throw Object.assign(Error("Webhook URLs cannot include credentials"), {
      statusCode: 400,
    });
  if (url.protocol === "https:") return url.href;
  if (
    local &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname)
  )
    return url.href;
  throw Object.assign(Error("Use an HTTPS URL"), { statusCode: 400 });
}

export function listWebhooks(userId: string) {
  return db
    .prepare(
      "SELECT id,url,created,events FROM webhooks WHERE user_id=? ORDER BY rowid DESC",
    )
    .all(userId)
    .map((row: any) => ({
      ...row,
      events: JSON.parse(row.events),
    }));
}

export function createWebhook(
  userId: string,
  url: string,
  events: WebhookType[],
) {
  const href = assertWebhookUrl(url);
  const id = randomUUID();
  const secret = "whsec_" + randomBytes(24).toString("hex");
  const created = new Date().toISOString();
  db.prepare("INSERT INTO webhooks VALUES(?,?,?,?,?,?)").run(
    id,
    userId,
    href,
    secret,
    created,
    JSON.stringify(events),
  );
  return { id, url: href, secret, created, events };
}

export function deleteWebhook(userId: string, id: string) {
  const result = db
    .prepare("DELETE FROM webhooks WHERE id=? AND user_id=?")
    .run(id, userId);
  if (!result.changes)
    throw Object.assign(Error("Webhook not found"), { statusCode: 404 });
}

export function listEvents(userId: string, limit = 30) {
  return db
    .prepare(
      "SELECT id,type,task_id,payload,created FROM webhook_events WHERE user_id=? ORDER BY rowid DESC LIMIT ?",
    )
    .all(userId, limit)
    .map((row: any) => ({
      id: row.id,
      type: row.type,
      taskId: row.task_id,
      created: row.created,
      data: JSON.parse(row.payload).data,
    }));
}

export function emit(
  userId: string,
  type: WebhookType,
  task: Task,
  extra?: Record<string, unknown>,
) {
  const id = "evt_" + randomUUID();
  const created = new Date().toISOString();
  const body = {
    id,
    object: "event",
    type,
    created,
    livemode: !local,
    data: {
      object: publicReceipt(task, chainInfo()),
      ...extra,
    },
  };
  const payload = JSON.stringify(body);
  db.prepare("INSERT INTO webhook_events VALUES(?,?,?,?,?,?)").run(
    id,
    userId,
    type,
    task.id,
    payload,
    created,
  );
  void deliver(userId, type, payload).catch(() => {});
  return body;
}

export async function pingWebhook(userId: string, id: string) {
  const row = db
    .prepare("SELECT * FROM webhooks WHERE id=? AND user_id=?")
    .get(id, userId) as
    { url: string; secret: string; events: string } | undefined;
  if (!row)
    throw Object.assign(Error("Webhook not found"), { statusCode: 404 });
  const body = {
    id: "evt_" + randomUUID(),
    object: "event",
    type: "webhook.test",
    created: new Date().toISOString(),
    livemode: !local,
    data: { object: { ok: true } },
  };
  const payload = JSON.stringify(body);
  db.prepare("INSERT INTO webhook_events VALUES(?,?,?,?,?,?)").run(
    body.id,
    userId,
    "webhook.test",
    null,
    payload,
    body.created,
  );
  const ok = await postSigned(row.url, row.secret, payload);
  return { delivered: ok, event: body };
}

async function deliver(userId: string, type: WebhookType, payload: string) {
  const hooks = db
    .prepare("SELECT url,secret,events FROM webhooks WHERE user_id=?")
    .all(userId) as { url: string; secret: string; events: string }[];
  await Promise.all(
    hooks
      .filter((hook) => {
        const events = JSON.parse(hook.events) as string[];
        return events.includes(type) || events.includes("*");
      })
      .map((hook) => postSigned(hook.url, hook.secret, payload)),
  );
}

async function postSigned(url: string, secret: string, payload: string) {
  const signature = meltSignature(secret, payload);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "melt-signature": signature,
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
