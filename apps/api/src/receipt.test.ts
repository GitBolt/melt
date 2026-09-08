import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mandateText,
  publicReceiptStatus,
  type Task,
} from "../../../packages/shared/src/index.js";
import { publicReceipt } from "./receipt.js";

const task = {
  id: "1277b125-7623-4cd1-a7be-16a1da9ae253",
  userId: "local:secret-user",
  title: "Buy USDC",
  instruction: "swap 0.05 ETH for USDC",
  url: "",
  budget: "0.05",
  durationMinutes: 15,
  target: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  selector: "0x04e45aaf",
  recovery: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  vault: "0x1111111111111111111111111111111111111111",
  createdAt: "2026-09-08T11:00:00.000Z",
  expiresAt: 1_900_000_000,
  status: "closed",
  spent: "0.05",
  returned: "0",
  balance: "0",
  agentMode: "manual",
  kind: "swap",
  swap: {
    tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    amountIn: "0.05",
    slippageBps: 50,
    buys: 1,
    intervalSec: 60,
  },
  events: [
    {
      id: "e1",
      at: "2026-09-08T11:00:01.000Z",
      kind: "success",
      text: "Swapped",
    },
  ],
  transactions: [
    {
      hash: "0x" + "ab".repeat(32),
      kind: "Execute dapp transaction",
      status: "success",
    },
  ],
  assets: [
    {
      token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      kind: "erc20",
      recovered: true,
      symbol: "USDC",
      amount: "124.27",
    },
  ],
  outcome: "succeeded",
  receiptToken: "aa".repeat(24),
} as Task;

test("public receipt omits the owner account id", () => {
  const receipt = publicReceipt(task, {
    id: 31337,
    name: "Local",
    symbol: "ETH",
  });
  assert.equal(receipt.object, "receipt");
  assert.equal(receipt.status, "succeeded");
  assert.equal("userId" in receipt, false);
  assert.equal(JSON.stringify(receipt).includes("secret-user"), false);
  assert.match(
    receipt.url,
    /\/r\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$/,
  );
  assert.match(receipt.mandate, /USDC/);
  assert.equal(receipt.remaining, "0");
  assert.equal(receipt.recover.owner, task.recovery);
});

test("mandate and public status cover swap, browse, and recovery states", () => {
  assert.match(mandateText(task), /Uniswap V3/);
  assert.equal(
    publicReceiptStatus({ ...task, status: "funding" } as Task),
    "requires_funding",
  );
  assert.equal(
    publicReceiptStatus({ ...task, status: "running" } as Task),
    "processing",
  );
  assert.equal(
    publicReceiptStatus({ ...task, status: "attention" } as Task),
    "needs_recovery",
  );
  const browse = mandateText({
    ...task,
    kind: "browse",
    swap: undefined,
    url: "https://example.com/mint",
  } as Task);
  assert.match(browse, /example.com/);
});
