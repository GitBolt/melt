import test from "node:test";
import assert from "node:assert/strict";
import { createWalletLookup } from "./auth-wallet-cache.js";

test("concurrent requests share wallet metadata lookup and refresh after its TTL", async () => {
  let calls = 0;
  let time = 0;
  let resolve!: (owner: string) => void;
  const lookup = createWalletLookup(
    async () => {
      calls++;
      return new Promise<string>((done) => (resolve = done));
    },
    { ttlMs: 10, now: () => time },
  );
  const first = lookup("alice");
  const concurrent = lookup("alice");
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve("wallet-one");
  assert.deepEqual(await Promise.all([first, concurrent]), [
    "wallet-one",
    "wallet-one",
  ]);
  time = 9;
  assert.equal(await lookup("alice"), "wallet-one");
  assert.equal(calls, 1);
  time = 10;
  const refreshed = lookup("alice");
  await Promise.resolve();
  assert.equal(calls, 2);
  resolve("wallet-two");
  assert.equal(await refreshed, "wallet-two");
});

test("wallet lookup failures are not cached and users never share a wallet", async () => {
  let fail = true;
  const lookup = createWalletLookup(async (id) => {
    if (fail) throw Error("User lookup failed");
    return `${id}-wallet`;
  });
  const first = lookup("alice");
  const concurrent = lookup("alice");
  await Promise.all([
    assert.rejects(first, /User lookup failed/),
    assert.rejects(concurrent, /User lookup failed/),
  ]);
  fail = false;
  assert.equal(await lookup("alice"), "alice-wallet");
  assert.equal(await lookup("bob"), "bob-wallet");
});

test("wallet metadata cache stays bounded", async () => {
  const calls: string[] = [];
  const lookup = createWalletLookup(
    async (id) => {
      calls.push(id);
      return `${id}-wallet`;
    },
    { maxEntries: 2 },
  );
  await lookup("alice");
  await lookup("bob");
  await lookup("carol");
  await lookup("bob");
  assert.deepEqual(calls, ["alice", "bob", "carol"]);
  await lookup("alice");
  assert.deepEqual(calls, ["alice", "bob", "carol", "alice"]);
});
