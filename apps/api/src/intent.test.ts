import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSwapIntent } from "./intent.js";

test("parses common swap phrasings into amount and token", () => {
  assert.deepEqual(parseSwapIntent("swap 0.05 ETH for USDC"), {
    amountIn: "0.05",
    tokenOut: "USDC",
  });
  assert.deepEqual(parseSwapIntent("buy USDC with 0.1 ETH"), {
    amountIn: "0.1",
    tokenOut: "USDC",
  });
  assert.deepEqual(parseSwapIntent("convert 0.2 eth into dai on uniswap"), {
    amountIn: "0.2",
    tokenOut: "DAI",
  });
  assert.deepEqual(parseSwapIntent("swap 1 eth -> wbtc"), {
    amountIn: "1",
    tokenOut: "WBTC",
  });
});

test("accepts a raw token address", () => {
  const intent = parseSwapIntent(
    "swap 0.1 eth for 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  );
  assert.equal(intent?.amountIn, "0.1");
  assert.equal(
    intent?.tokenOut,
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  );
});

test("returns null when the text is not clearly a swap", () => {
  assert.equal(parseSwapIntent("Mint one collectible on the studio"), null);
  assert.equal(parseSwapIntent("swap tokens for me please"), null); // no amount
  assert.equal(parseSwapIntent("send 0.1 eth to my friend"), null); // no swap word
  assert.equal(parseSwapIntent("swap 0.1 eth to weth"), null); // no non-source token
});
