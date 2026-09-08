import { TOKENS } from "./swap.js";

export interface SwapIntent {
  amountIn: string;
  tokenOut: string;
}

const AMOUNT_ETH = /(\d+(?:\.\d+)?)\s*(?:eth|ether|weth|Ξ)\b/i;
const SWAP_WORD = /\b(swap|buy|convert|trade|exchange|purchase)\b/i;
const ARROW = /(->|→|=>)/;
const ADDRESS = /0x[0-9a-fA-F]{40}/;

// Turn a plain-language instruction such as "swap 0.05 ETH for USDC on
// Uniswap" into structured swap parameters. Returns null when the text is not
// clearly a swap so the browser agent can handle it instead. This is what
// makes "swap my tokens" work reliably with no model configured.
export function parseSwapIntent(instruction: string): SwapIntent | null {
  const text = instruction.trim();
  if (!SWAP_WORD.test(text) && !ARROW.test(text)) return null;

  const amountMatch = text.match(AMOUNT_ETH);
  if (!amountMatch) return null;
  const amountIn = amountMatch[1];
  if (!(Number(amountIn) > 0)) return null;

  const rawAddress = text.match(ADDRESS)?.[0];
  if (rawAddress) return { amountIn, tokenOut: rawAddress };

  // Prefer a token named after a "for/to/into" phrase, then any known symbol.
  const phrase = text.match(
    /(?:for|to|into|in|get|buy|receive)\s+([A-Za-z][A-Za-z0-9]{1,9})\b/i,
  );
  const candidate = phrase?.[1]?.toUpperCase();
  const symbols = TOKENS.map((t) => t.symbol.toUpperCase());
  if (candidate && symbols.includes(candidate) && candidate !== "ETH")
    return { amountIn, tokenOut: candidate };

  for (const token of TOKENS) {
    const symbol = token.symbol.toUpperCase();
    if (symbol === "WETH") continue; // avoid matching the ETH/WETH source
    if (new RegExp(`\\b${symbol}\\b`, "i").test(text))
      return { amountIn, tokenOut: token.symbol };
  }
  return null;
}
