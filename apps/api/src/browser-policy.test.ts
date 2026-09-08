import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "../../../packages/shared/src/index.js";

const directory = mkdtempSync(join(tmpdir(), "melt-browser-policy-"));
process.env.DATA_DIR = directory;
const { estimatePermittedGas, provider, checkURL } =
  await import("./browser.js");
const { db } = await import("./store.js");
const { client } = await import("./chain.js");
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
const task = {
  id: "browser-policy-test",
  status: "running",
  expiresAt: Math.floor(Date.now() / 1000) + 600,
  target: "0x1111111111111111111111111111111111111111",
  vault: "0x2222222222222222222222222222222222222222",
  selector: "0x1249c58b",
  budget: "0.001",
  spent: "0.0009",
  transactions: [],
} as unknown as Task;
const transaction = {
  to: task.target,
  from: task.vault,
  data: task.selector,
  value: "0x5af3107a4000",
};

test("gas estimation rejects unsupported spending before consulting the RPC", async () => {
  let calls = 0;
  const estimate = async () => {
    calls++;
    return 45000n;
  };
  for (const patch of [
    { to: task.vault },
    { data: "0xa9059cbb" },
    { value: "0xffffffffffffffffffffffff" },
  ])
    await assert.rejects(
      estimatePermittedGas(task, { ...transaction, ...patch }, estimate),
    );
  assert.equal(calls, 0);
  assert.equal(
    await estimatePermittedGas(task, transaction, async (tx) => {
      calls++;
      assert.equal(tx.to, task.target);
      assert.equal(tx.value, 100000000000000n);
      assert.equal(tx.data, task.selector);
      return 45000n;
    }),
    "0xafc8",
  );
  assert.equal(calls, 1);
  await assert.rejects(
    estimatePermittedGas(task, transaction, async () => 1000001n),
    /gas limit/,
  );
});

test("wallet supports common chain reads and still refuses signatures", async (t) => {
  const request = t.mock.method(
    client,
    "request",
    async (args: any) => args.method,
  );
  for (const method of [
    "eth_getTransactionByHash",
    "eth_getTransactionCount",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_gasPrice",
    "eth_maxPriorityFeePerGas",
    "eth_feeHistory",
  ])
    assert.equal(await provider(task, method, []), method);
  assert.equal(request.mock.callCount(), 7);
  for (const method of [
    "personal_sign",
    "eth_signTypedData_v4",
    "wallet_addEthereumChain",
    "eth_sendRawTransaction",
  ])
    await assert.rejects(provider(task, method, []), /does not sign/);
  assert.equal(request.mock.callCount(), 7);
});

test("remote browsing requires an operator-approved public host", async () => {
  const previousToken = process.env.BROWSERLESS_TOKEN;
  const previousHosts = process.env.BROWSER_ALLOWED_HOSTS;
  process.env.BROWSERLESS_TOKEN = "test-token";
  process.env.BROWSER_ALLOWED_HOSTS = "8.8.8.8,127.0.0.1";
  try {
    await assert.rejects(checkURL("https://unapproved.invalid"), /not enabled/);
    await assert.rejects(checkURL("https://127.0.0.1"), /Private networks/);
    await checkURL("https://8.8.8.8");
  } finally {
    if (previousToken === undefined) delete process.env.BROWSERLESS_TOKEN;
    else process.env.BROWSERLESS_TOKEN = previousToken;
    if (previousHosts === undefined) delete process.env.BROWSER_ALLOWED_HOSTS;
    else process.env.BROWSER_ALLOWED_HOSTS = previousHosts;
  }
});
