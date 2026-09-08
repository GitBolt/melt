import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTransaction } from "./policy.js";
import { createTask, type Task } from "../../../packages/shared/src/index.js";
const target = "0x1111111111111111111111111111111111111111",
  vault = "0x2222222222222222222222222222222222222222";
const task = {
  status: "running",
  expiresAt: Math.floor(Date.now() / 1000) + 600,
  target,
  vault,
  selector: "0x1249c58b",
  budget: "0.001",
  spent: "0.0009",
} as Task;
const tx = {
  to: target,
  from: vault,
  data: "0x1249c58b",
  value: "0x5af3107a4000",
};
test("permits exactly the remaining native amount", () =>
  assert.equal(validateTransaction(task, tx).value, 100000000000000n));
test("rejects over-budget requests with very large integers without floating point", () =>
  assert.throws(
    () =>
      validateTransaction(task, {
        ...tx,
        value: "99999999999999999999999999999999999999999",
      }),
    /allowance/,
  ));
test("blocks wrong sender, contract, function and chain", () => {
  for (const patch of [
    { from: target },
    { to: vault },
    { data: "0xa9059cbb" },
    { chainId: "0x1" },
  ])
    assert.throws(() => validateTransaction(task, { ...tx, ...patch }));
});
test("closed, closing, funding and expired sessions cannot sign", () => {
  for (const status of ["closed", "closing", "funding"])
    assert.throws(() => validateTransaction({ ...task, status } as Task, tx));
  assert.throws(() => validateTransaction({ ...task, expiresAt: 0 }, tx));
});
test("create input rejects non-finite amounts and malformed selectors", () =>
  assert.equal(
    createTask.safeParse({
      title: "Task",
      instruction: "Mint",
      url: "https://example.com",
      budget: "Infinity",
      target,
      selector: "0x123",
      recovery: vault,
    }).success,
    false,
  ));
test("create input accepts a job and spending limit without a contract lock", () => {
  const parsed = createTask.parse({
    title: "Pay the kiosk",
    instruction: "Connect and leave a tip",
    url: "https://example.com/pay",
    budget: "0.0003",
    recovery: vault,
  });
  assert.equal(parsed.target, "");
  assert.equal(parsed.selector, "");
});
test("create input accepts an empty website and still requires a matching lock pair", () => {
  assert.equal(
    createTask.safeParse({
      title: "Write the job first",
      instruction: "Do the work within the spending limit",
      url: "",
      budget: "0.001",
      recovery: vault,
    }).success,
    true,
  );
  assert.equal(
    createTask.safeParse({
      title: "Partial lock",
      instruction: "Lock only the contract",
      url: "https://example.com",
      budget: "0.001",
      target,
      recovery: vault,
    }).success,
    false,
  );
});
test("unlocked sessions may call any contract except forbidden selectors", () => {
  const open = { ...task, target: "", selector: "" };
  assert.equal(
    validateTransaction(open, {
      ...tx,
      to: "0x3333333333333333333333333333333333333333",
      data: "0x1249c58b",
    }).to,
    "0x3333333333333333333333333333333333333333",
  );
  assert.throws(
    () =>
      validateTransaction(open, {
        ...tx,
        data: "0xa9059cbb0000000000000000000000001111111111111111111111111111111111111111",
      }),
    /approvals/,
  );
});
