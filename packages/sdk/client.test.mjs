import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { Melt, MeltError, publicReceipt, constructEvent } from "./client.mjs";

const id = "1277b125-7623-4cd1-a7be-16a1da9ae253";
const task = (status = "ready") => ({
  id,
  userId: "owner",
  title: "Mint collectible",
  instruction: "Mint one collectible",
  url: "https://example.com",
  budget: "0.0003",
  durationMinutes: 15,
  target: `0x${"1".repeat(40)}`,
  selector: "0x1249c58b",
  recovery: `0x${"2".repeat(40)}`,
  vault: `0x${"3".repeat(40)}`,
  createdAt: new Date().toISOString(),
  expiresAt: 1_900_000_000,
  status,
  spent: "0",
  returned: "0",
  balance: "0.0003",
  agentMode: "manual",
  events: [],
  transactions: [],
  assets: [],
  outcome: "pending",
});
async function endpoint(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
function json(res, data, status = 200, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}
const client = (baseUrl, options = {}) =>
  new Melt({ baseUrl, apiKey: "melt_test_only", ...options });

test("native HTTP client supports /api base URLs and preserves financial decimal strings", async (t) => {
  const calls = [];
  const base = await endpoint(t, async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls.push({
      url: req.url,
      auth: req.headers.authorization,
      method: req.method,
      body,
    });
    if (req.url.endsWith("/receipt"))
      return json(res, {
        ...task("closed"),
        outcome: "cancelled",
        schemaVersion: 1,
        chainId: 11155111,
        network: "Sepolia",
      });
    if (req.url === "/api/sessions") return json(res, [task()]);
    json(res, task("paused"));
  });
  const melt = client(`${base}/api/`);
  assert.equal((await melt.sessions())[0].balance, "0.0003");
  await melt.start(id, { manual: true });
  await melt.action(id, {
    type: "fill",
    index: 2,
    value: "one collectible",
    extra: "stripped",
  });
  const receipt = await melt.receipt(id);
  assert.equal(receipt.chainId, 11155111);
  assert.equal(receipt.outcome, "cancelled");
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.auth === "Bearer melt_test_only"));
  assert.equal(calls[1].url, `/api/sessions/${id}/start`);
  assert.deepEqual(JSON.parse(calls[1].body), { manual: true });
  assert.deepEqual(JSON.parse(calls[2].body), {
    type: "fill",
    index: 2,
    value: "one collectible",
  });
});

test("API errors expose status and Retry-After without retrying mutations", async (t) => {
  let requests = 0;
  const base = await endpoint(t, (_req, res) => {
    requests++;
    json(res, { error: "Please wait" }, 429, { "Retry-After": "2" });
  });
  await assert.rejects(client(base).close(id), (error) => {
    assert.ok(error instanceof MeltError);
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterMs, 2000);
    assert.equal(error.uncertain, true);
    return true;
  });
  assert.equal(requests, 1);
});

test("malformed JSON, HTML and incomplete sessions are rejected instead of returned as success", async (t) => {
  let step = 0;
  const base = await endpoint(t, (_req, res) => {
    step++;
    if (step === 1) {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<h1>Sign in</h1>");
    }
    if (step === 2) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end("{");
    }
    json(res, { id, status: "ready" });
  });
  const melt = client(base);
  for (let i = 0; i < 3; i++)
    await assert.rejects(
      melt.session(id),
      (error) =>
        error.code === "INVALID_RESPONSE" && !error.message.includes("<h1>"),
    );
});

test("validates actions and rejects credential-bearing base URLs before contacting a server", () => {
  const melt = client("https://example.com");
  assert.throws(
    () => melt.action(id, { type: "click", index: 200 }),
    /control index/,
  );
  assert.throws(
    () => melt.action(id, { type: "fill", index: 1, value: "x".repeat(2001) }),
    /2000/,
  );
  assert.throws(
    () => melt.action(id, { type: "open", url: "javascript:alert(1)" }),
    /website URL/,
  );
  assert.throws(() => melt.session("../keys"), /session ID/);
  assert.throws(
    () => client("https://user:password@example.com"),
    /credentials/,
  );
  assert.throws(
    () => client("https://example.com?token=secret"),
    /credentials/,
  );
  assert.throws(() => new Melt({ apiKey: "key\nOther: header" }), /API key/);
});

test("bounded waiting distinguishes closed from a succeeded outcome and respects rate limits", async (t) => {
  let reads = 0;
  const base = await endpoint(t, (_req, res) => {
    reads++;
    if (reads === 1)
      return json(res, { error: "Rate limited" }, 429, { "Retry-After": "0" });
    if (reads === 2) return json(res, task("running"));
    json(res, {
      ...task("closed"),
      outcome: "failed",
      outcomeReason: "No collectible received",
    });
  });
  const session = await client(base).wait(id, {
    intervalMs: 250,
    timeoutMs: 3000,
  });
  assert.equal(reads, 3);
  assert.equal(session.status, "closed");
  assert.equal(session.outcome, "failed");
});

test("wait deadline cancels an in-flight native fetch rather than waiting for its request timeout", async (t) => {
  let reads = 0;
  const base = await endpoint(t, () => {
    reads++;
  });
  const started = Date.now();
  await assert.rejects(
    client(base).wait(id, { timeoutMs: 150 }),
    (error) => error.code === "WAIT_TIMEOUT" && !error.uncertain,
  );
  assert.ok(Date.now() - started < 2000);
  assert.equal(reads, 1);
});

test("caller cancellation interrupts the polling delay and never closes the server session", async (t) => {
  const controller = new AbortController();
  let reads = 0;
  const base = await endpoint(t, (req, res) => {
    reads++;
    assert.equal(req.method, "GET");
    json(res, task("running"));
    setTimeout(() => controller.abort(), 50);
  });
  await assert.rejects(
    client(base).wait(id, { intervalMs: 30_000, signal: controller.signal }),
    (error) => error.code === "ABORTED",
  );
  assert.equal(reads, 1);
});

test("mutation timeout is marked uncertain and is not retried", async (t) => {
  let calls = 0;
  const base = await endpoint(t, () => {
    calls++;
  });
  await assert.rejects(
    client(base).start(id, { timeoutMs: 150 }),
    (error) => error.code === "TIMEOUT" && error.uncertain,
  );
  assert.equal(calls, 1);
});

test("redirects never forward an API key and screenshots return binary bytes", async (t) => {
  let leaked = false;
  const other = await endpoint(t, (_req, res) => {
    leaked = true;
    json(res, []);
  });
  const image = Uint8Array.from([255, 216, 255, 217]);
  const base = await endpoint(t, (req, res) => {
    if (req.url.endsWith("/screenshot")) {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.end(image);
    }
    res.writeHead(307, { Location: `${other}/api/sessions` });
    res.end();
  });
  await assert.rejects(
    client(base).sessions(),
    (error) => error.code === "NETWORK_ERROR",
  );
  assert.equal(leaked, false);
  assert.deepEqual(await client(base).screenshot(id), image);
});

test("expanded controls carry only validated fields and optional reasons", async (t) => {
  const bodies = [];
  const base = await endpoint(t, async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    bodies.push(JSON.parse(body));
    json(res, task("paused"));
  });
  const melt = client(base);
  const actions = [
    { type: "scroll", direction: "down", reason: "Find the purchase control" },
    { type: "press", index: 199, key: "Enter" },
    { type: "select", index: 4, value: "single" },
    { type: "finish", reason: "Collectible received" },
  ];
  for (const action of actions)
    await melt.action(id, { ...action, untrusted: "ignored" });
  assert.deepEqual(bodies, actions);
  assert.throws(
    () => melt.action(id, { type: "press", index: 2, key: "Control+C" }),
    /Enter/,
  );
  assert.throws(
    () => melt.action(id, { type: "scroll", direction: "left" }),
    /up or down/,
  );
  assert.throws(
    () => melt.action(id, { type: "wait", reason: "x".repeat(161) }),
    /160/,
  );
  assert.equal(bodies.length, 4);
});

test("constructEvent verifies Stripe-style HMAC over the raw body", async () => {
  const secret = "whsec_test";
  const payload = '{"id":"evt_1","object":"event","type":"session.closed"}';
  const timestamp = 1_700_000_000;
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const original = Date.now;
  Date.now = () => timestamp * 1000;
  try {
    const event = await constructEvent(
      payload,
      `t=${timestamp},v1=${v1}`,
      secret,
    );
    assert.equal(event.id, "evt_1");
    await assert.rejects(
      () => constructEvent(payload + " ", `t=${timestamp},v1=${v1}`, secret),
      (error) =>
        error instanceof MeltError && error.code === "INVALID_SIGNATURE",
    );
  } finally {
    Date.now = original;
  }
});

test("publicReceipt fetches an unauthenticated receipt by token", async (t) => {
  const token = "ab".repeat(24);
  const base = await endpoint(t, (req, res) => {
    assert.equal(req.url, `/api/public/receipts/${token}`);
    assert.equal(req.headers.authorization, undefined);
    json(res, { object: "receipt", id, url: `/r/${token}` });
  });
  const receipt = await publicReceipt(token, { baseUrl: base });
  assert.equal(receipt.object, "receipt");
  assert.equal(receipt.url, `/r/${token}`);
});
