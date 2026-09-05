import { test } from "node:test";
import assert from "node:assert/strict";
import { totalPrice } from "../src/lib/amount.js";
test("quoted ETH totals preserve wei precision", () => {
  assert.equal(totalPrice(10, "0.000000000000000001"), "0.00000000000000001");
  assert.equal(totalPrice(7, "0.00012"), "0.00084");
});
test("invalid and fractional job quantities do not become payable quotes", () => {
  assert.equal(totalPrice(1.5, "0.1"), "—");
  assert.equal(totalPrice(2, "nope"), "—");
  assert.equal(totalPrice(0, "0.1"), "—");
});
