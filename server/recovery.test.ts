import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverJob } from "./recovery.js";
test("interrupted reserved work restores exactly one credit", async () => {
  let refunds = 0;
  const result = await recoverJob({
    state: async () => 1,
    refund: async () => {
      refunds++;
    },
    receipt: async () => "success",
  });
  assert.equal(result, "refunded");
  assert.equal(refunds, 1);
});
test("completed work is never refunded even after an uncertain response", async () => {
  const result = await recoverJob({
    state: async () => 2,
    refund: async () => assert.fail("must not refund"),
    receipt: async () => "success",
  });
  assert.equal(result, "completed");
});
test("pending transactions remain uncertain rather than claiming refunds", async () => {
  assert.equal(
    await recoverJob({
      state: async () => 0,
      refund: async () => assert.fail("must not refund"),
      receipt: async () => "pending",
    }),
    "needs-recovery",
  );
});
test("a mined revert is rejected without minting a credit", async () => {
  assert.equal(
    await recoverJob({
      state: async () => 0,
      refund: async () => assert.fail("must not refund"),
      receipt: async () => "reverted",
    }),
    "rejected",
  );
});
test("RPC and refund failures remain recoverable", async () => {
  assert.equal(
    await recoverJob({
      state: async () => {
        throw Error("offline");
      },
      refund: async () => {},
      receipt: async () => "pending",
    }),
    "needs-recovery",
  );
  assert.equal(
    await recoverJob({
      state: async () => 1,
      refund: async () => {
        throw Error("offline");
      },
      receipt: async () => "pending",
    }),
    "needs-recovery",
  );
});
