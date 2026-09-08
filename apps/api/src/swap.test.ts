import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, parseEther } from "viem";
import { buildSwapCall, SWAP_SELECTOR, TOKENS, UNISWAP } from "./swap.js";

const routerAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

test("exposes the SwapRouter02 exactInputSingle selector", () =>
  assert.equal(SWAP_SELECTOR, "0x04e45aaf"));

test("token registry includes USDC with correct decimals", () => {
  const usdc = TOKENS.find((t) => t.symbol === "USDC");
  assert.ok(usdc);
  assert.equal(usdc!.decimals, 6);
});

test("builds a native-value swap call the vault can execute", () => {
  const usdc = TOKENS.find((t) => t.symbol === "USDC")!;
  const recipient = "0x2222222222222222222222222222222222222222" as const;
  const amountInWei = parseEther("0.05");
  const minOutWei = 123000000n;
  const call = buildSwapCall({
    tokenOut: usdc.address,
    recipient,
    amountInWei,
    minOutWei,
    fee: 500,
  });
  // The call targets the Uniswap router and carries ETH as msg.value, so no
  // ERC-20 approval is needed and it stays a permitted native-value call.
  assert.equal(call.to, UNISWAP.router);
  assert.equal(call.value, amountInWei);
  assert.ok(call.data.startsWith(SWAP_SELECTOR));
  const { args } = decodeFunctionData({ abi: routerAbi, data: call.data });
  const params = args[0] as any;
  assert.equal(params.tokenIn, UNISWAP.weth);
  assert.equal(params.tokenOut, usdc.address);
  assert.equal(params.recipient, recipient);
  assert.equal(params.amountIn, amountInWei);
  assert.equal(params.amountOutMinimum, minOutWei);
  assert.equal(params.fee, 500);
});
