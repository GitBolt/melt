import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, parseEther } from "viem";
import {
  buildSwapCall,
  SWAP_SELECTOR,
  TOKENS,
  UNISWAP,
  priceImpactBps,
  tokensFor,
  uniswapFor,
} from "./swap.js";

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

test("Sepolia uses official Uniswap V3 testnet deployments", () => {
  const sepolia = uniswapFor(11155111);
  assert.equal(sepolia.router, "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E");
  assert.equal(sepolia.quoter, "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3");
  const usdc = tokensFor(11155111).find((t) => t.symbol === "USDC");
  assert.equal(usdc?.address, "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
});

test("token registry includes USDC with correct decimals", () => {
  const usdc = TOKENS.find((t) => t.symbol === "USDC");
  assert.ok(usdc);
  assert.equal(usdc!.decimals, 6);
});

test("measures Uniswap price impact from a spot probe versus the executed size", () => {
  assert.equal(priceImpactBps(100n, 1n, 100n, 1n), 0);
  assert.equal(priceImpactBps(100n, 1n, 99n, 1n), 100);
  assert.equal(priceImpactBps(100n, 1n, 101n, 1n), 0);
  assert.equal(priceImpactBps(0n, 1n, 50n, 1n), 0);
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
