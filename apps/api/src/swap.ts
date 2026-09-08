import {
  encodeFunctionData,
  parseEther,
  formatUnits,
  getAddress,
  toFunctionSelector,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { client, chain } from "./chain.js";

// Uniswap V3 canonical deployments. These addresses are the same on Ethereum
// mainnet and are present whenever the local chain is a mainnet fork, so a
// swap is a plain native-value contract call from the task vault — no ERC-20
// approval, which is exactly what the vault's spending model already allows.
export const UNISWAP = {
  router: getAddress("0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"), // SwapRouter02
  quoter: getAddress("0x61fFE014bA17989E743c5F6cB21bF9697530B21e"), // QuoterV2
  weth: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
} as const;

export interface TokenInfo {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

// A curated set of deep-liquidity tokens an agent can buy with its ETH
// allowance. Custom ERC-20 addresses are also accepted and resolved onchain.
export const TOKENS: TokenInfo[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    decimals: 6,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    decimals: 6,
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: getAddress("0x6B175474E89094C44Da98b954EedeAC495271d0F"),
    decimals: 18,
  },
  {
    symbol: "WBTC",
    name: "Wrapped BTC",
    address: getAddress("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"),
    decimals: 8,
  },
  {
    symbol: "UNI",
    name: "Uniswap",
    address: getAddress("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"),
    decimals: 18,
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    address: getAddress("0x514910771AF9Ca656af840dff83E8264EcF986CA"),
    decimals: 18,
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: UNISWAP.weth,
    decimals: 18,
  },
];

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

// QuoterV2 is non-view but returns cleanly through eth_call; declaring it view
// here lets viem read it without sending a transaction.
const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export const SWAP_SELECTOR = toFunctionSelector(
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
);
const FEE_TIERS = [500, 3000, 10000, 100] as const;

let available: boolean | undefined;
// Uniswap is usable only when its router and quoter bytecode exist on the
// connected chain (mainnet or a mainnet fork). Checked once and cached.
export async function swapAvailable(): Promise<boolean> {
  if (available !== undefined) return available;
  try {
    const [router, quoter] = await Promise.all([
      client.getCode({ address: UNISWAP.router }),
      client.getCode({ address: UNISWAP.quoter }),
    ]);
    available = Boolean(router && router !== "0x" && quoter && quoter !== "0x");
  } catch {
    available = false;
  }
  return available;
}

export async function resolveToken(idOrSymbol: string): Promise<TokenInfo> {
  const known = TOKENS.find(
    (t) =>
      t.symbol.toLowerCase() === idOrSymbol.toLowerCase() ||
      t.address.toLowerCase() === idOrSymbol.toLowerCase(),
  );
  if (known) return known;
  if (!isAddress(idOrSymbol)) throw Error(`Unknown token: ${idOrSymbol}`);
  const address = getAddress(idOrSymbol);
  const decimals = Number(
    await client.readContract({
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  );
  let symbol = `${address.slice(0, 6)}…`;
  try {
    symbol = (await client.readContract({
      address,
      abi: erc20Abi,
      functionName: "symbol",
    })) as string;
  } catch {
    /* Some tokens do not expose a string symbol. */
  }
  return { symbol, name: symbol, address, decimals };
}

export interface SwapQuote {
  tokenOut: Address;
  symbol: string;
  decimals: number;
  amountIn: string; // ETH, human readable
  amountInWei: string;
  fee: number;
  amountOutWei: string;
  amountOut: string; // human readable token amount
  minOutWei: string;
  minOut: string;
  slippageBps: number;
  rate: string; // token units per 1 ETH
}

async function bestQuote(tokenOut: Address, amountInWei: bigint) {
  let best: { fee: number; amountOut: bigint } | undefined;
  for (const fee of FEE_TIERS) {
    try {
      const result = (await client.readContract({
        address: UNISWAP.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: UNISWAP.weth,
            tokenOut,
            amountIn: amountInWei,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })) as readonly [bigint, bigint, number, bigint];
      const amountOut = result[0];
      if (amountOut > 0n && (!best || amountOut > best.amountOut))
        best = { fee, amountOut };
    } catch {
      /* No pool at this fee tier; try the next one. */
    }
  }
  return best;
}

export async function quoteSwap(params: {
  tokenOut: string;
  amountIn: string;
  slippageBps?: number;
}): Promise<SwapQuote> {
  if (!(await swapAvailable()))
    throw Error(
      "Onchain swaps need a Uniswap-enabled network. Run with MELT_FORK=1 or a Uniswap-supported chain.",
    );
  const slippageBps = Math.min(
    5000,
    Math.max(1, Math.round(params.slippageBps ?? 50)),
  );
  const amountInWei = parseEther(params.amountIn as `${number}`);
  if (amountInWei <= 0n) throw Error("Enter an amount greater than zero");
  const token = await resolveToken(params.tokenOut);
  const best = await bestQuote(token.address, amountInWei);
  if (!best) throw Error("No Uniswap pool found for this pair");
  const minOutWei = (best.amountOut * BigInt(10000 - slippageBps)) / 10000n;
  const amountOut = formatUnits(best.amountOut, token.decimals);
  return {
    tokenOut: token.address,
    symbol: token.symbol,
    decimals: token.decimals,
    amountIn: params.amountIn,
    amountInWei: amountInWei.toString(),
    fee: best.fee,
    amountOutWei: best.amountOut.toString(),
    amountOut,
    minOutWei: minOutWei.toString(),
    minOut: formatUnits(minOutWei, token.decimals),
    slippageBps,
    rate: formatUnits(
      (best.amountOut * 10n ** 18n) / amountInWei,
      token.decimals,
    ),
  };
}

// Build the native-value router call the vault executes. Because ETH is sent
// as msg.value and tokenIn is WETH, SwapRouter02 wraps it internally: no
// approval and no separate wrap transaction are needed.
export function buildSwapCall(params: {
  tokenOut: Address;
  recipient: Address;
  amountInWei: bigint;
  minOutWei: bigint;
  fee: number;
}): { to: Address; value: bigint; data: Hex } {
  const data = encodeFunctionData({
    abi: routerAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: UNISWAP.weth,
        tokenOut: params.tokenOut,
        fee: params.fee,
        recipient: params.recipient,
        amountIn: params.amountInWei,
        amountOutMinimum: params.minOutWei,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  return { to: UNISWAP.router, value: params.amountInWei, data };
}
