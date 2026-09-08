# Uniswap integration feedback

Melt integrates Uniswap in two distinct places. This file points reviewers at
the exact code and describes what we learned.

## 1. Agent-executed onchain swaps (Uniswap V3 AMM)

The headline integration: an AI agent is given a hard, onchain spending limit and
swaps on Uniswap V3 **from a task wallet**, then the purchased token is returned
to the owner. This is deterministic (no model required) so "swap 0.05 ETH for
USDC" always executes.

Key design point: an **ETH → token swap through the Uniswap router is a
native-value call that needs no ERC-20 `approve`**. The task-wallet contract
already forbids `approve`/`transfer`/Permit2 but allows native-value calls, so
swaps fit the existing security model with **zero contract changes**. The vault
is locked to the router address and the `exactInputSingle` selector.

Code:

- `apps/api/src/swap.ts` — Uniswap addresses (`UNISWAP.router` SwapRouter02
  `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45`, `UNISWAP.quoter` QuoterV2
  `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`), `quoteSwap()` (QuoterV2
  best-fee-tier routing), `buildSwapCall()` (native-value `exactInputSingle`
  calldata with `amountOutMinimum` slippage guard), `SWAP_SELECTOR`.
- `apps/api/src/browser.ts` — `runSwap()` executes the swap via
  `vaultCall(task, "execute", [router, amountIn, data])` and returns the token
  on close.
- `contracts/src/TaskVault.sol` — `execute()` (native-value call surface) and
  `_forbidden()` (why no approval path is exposed).
- `apps/api/src/intent.ts` — `parseSwapIntent()` turns natural language into a
  swap so external agents/MCP get the same behaviour.
- `apps/api/src/index.ts` — `POST /api/swap/quote`, `GET /api/swap/tokens`, and
  swap-aware session creation/start.

Reproduce locally against real Uniswap contracts on an Ethereum mainnet fork
(chain id kept at 31337): `MELT_FORK=1 npm run dev`. QuoterV2 quoting and
SwapRouter02 `exactInputSingle` execute unchanged on the fork and produce real
transaction receipts.

Feedback: QuoterV2's `quoteExactInputSingle` is not `view` but returns cleanly
over `eth_call`; documenting that explicitly (and that native ETH input via
`msg.value` avoids a WETH approval on SwapRouter02) would save integrators time.
Probing fee tiers in parallel and caching quotes was necessary for responsive
UX on a cold fork.

Recurring buys (dollar-cost averaging) run several of these native-value swaps
across time under one onchain budget (`runSwaps` in `apps/api/src/browser.ts`),
an automated agent strategy that fits the same no-approval model.

Agent access: the dependency-free client and MCP server expose `quote` and
`tokens` (`packages/sdk/client.mjs`, `packages/sdk/src/mcp.ts`) so an external
agent can price and operate owner-authorized swaps it cannot escalate.

We also send the recommended `X-Agent-Info` attribution header on Trading API
calls (`decision_origin=autonomous`) in `apps/api/src/uniswap.ts`.

## 2. Owner funding conversion (Uniswap Trading API)

The optional funding flow calls `check_approval`, `quote`, and `swap` from
`apps/api/src/uniswap.ts`; `apps/web/src/FundingSwap.tsx` obtains owner approval
and submits the returned transaction. The agent browser never obtains access to
that owner wallet.

Useful documentation details: the consistent Universal Router header,
`permitAmount: EXACT`, the explicit Permit2 domain/types/values shape, and the
requirement to supply both signature and permitData. We implemented a 30-second
quote lifetime, owner binding, simulation, a swap deadline and exact ERC-20
allowance instead of unlimited approval. Quotes requesting a broader permit are
rejected.

Suggested documentation improvement: place the EIP-1193 / viem signing
transformation directly beside the Permit2 example, including `primaryType` and
the mapping from `values` to `message`. A route-specific runnable testnet pair
would also make hackathon verification easier; supported networks alone do not
establish available liquidity.

## Verification

For a public submission, append the chain/token pair, redacted request IDs,
transaction hashes and observed errors here, then submit the
[official feedback form](https://developers.uniswap.org/hackathon-feedback). Do
not include API keys.
