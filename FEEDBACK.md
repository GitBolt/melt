# Uniswap integration feedback

Melt uses Uniswap as the conversion rail inside a consumer gift, not as a trading tab.

A sender funds an envelope with ETH. The recipient (or their existing assistant) later proposes a purchase that matches the promise. Melt quotes Uniswap V3, swaps **only the required amount** to USDC from the envelope vault, and leaves leftover ETH in the gift. There is no generic transfer and no ERC-20 `approve`.

This file points reviewers at the exact code and describes what we learned.

## 1. Envelope settlement (Uniswap V3 AMM) — headline

When `POST /api/envelopes/:id/redeem` accepts a quote, Melt:

1. Re-checks the catalog option against the envelope policy (purpose, category, dollar cap, deny list, remaining ETH).
2. Quotes Uniswap V3 for that exact ETH size → USDC.
3. Forwards a native-value `exactInputSingle` through the vault to SwapRouter02.
4. Records the amount out, symbol, and transaction hash on the redemption.

Key design point: an **ETH → token swap through the Uniswap router is a native-value call that needs no ERC-20 `approve`**. The task-wallet contract already forbids `approve`/`transfer`/Permit2 but allows native-value calls, so settlement fits the existing security model with **zero contract changes**.

Code:

- `apps/api/src/envelopes.ts` — `executeSettlement()` / `redeemQuote()`. This is the consumer path: policy first, then a sized Uniswap swap, then leftover funds stay in the envelope.
- `apps/api/src/swap.ts` — Uniswap addresses (`UNISWAP.router` SwapRouter02 `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45`, `UNISWAP.quoter` QuoterV2 `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`), `quoteSwap()` (QuoterV2 best-fee-tier routing), `buildSwapCall()` (native-value `exactInputSingle` calldata with `amountOutMinimum` slippage guard), `SWAP_SELECTOR`.
- `contracts/src/TaskVault.sol` — `execute()` (native-value call surface) and `_forbidden()` (why no approval path is exposed).
- `apps/web/src/Envelopes.tsx` — Discover shows the settlement proof (USDC amount + hash). Uniswap is not a top-level tab.

Reproduce locally against real Uniswap contracts on an Ethereum mainnet fork (chain id kept at 31337): `MELT_FORK=1 npm run dev`. Create a mobile-data envelope, Discover an eSIM, redeem. QuoterV2 quoting and SwapRouter02 `exactInputSingle` execute on the fork and produce real transaction receipts.

Feedback: QuoterV2's `quoteExactInputSingle` is not `view` but returns cleanly over `eth_call`; documenting that explicitly (and that native ETH input via `msg.value` avoids a WETH approval on SwapRouter02) would save integrators time. Probing fee tiers in parallel and caching quotes was necessary for responsive UX on a cold fork. Quotes also probe a smaller size on the winning fee tier to surface `priceImpactBps` before the vault spends.

We send the recommended `X-Agent-Info` attribution header on Trading API calls (`decision_origin=autonomous`) in `apps/api/src/uniswap.ts`.

## 2. Owner funding conversion (Uniswap Trading API)

The optional funding flow calls `check_approval`, `quote`, and `swap` from `apps/api/src/uniswap.ts`; `apps/web/src/FundingSwap.tsx` obtains owner approval and submits the returned transaction. The recipient’s assistant never obtains access to that owner wallet.

Useful documentation details: the consistent Universal Router header, `permitAmount: EXACT`, the explicit Permit2 domain/types/values shape, and the requirement to supply both signature and permitData. We implemented a 30-second quote lifetime, owner binding, simulation, a swap deadline and exact ERC-20 allowance instead of unlimited approval. Quotes requesting a broader permit are rejected.

Suggested documentation improvement: place the EIP-1193 / viem signing transformation directly beside the Permit2 example, including `primaryType` and the mapping from `values` to `message`. A route-specific runnable testnet pair would also make hackathon verification easier; supported networks alone do not establish available liquidity.

## Verification

For a public submission, append the chain/token pair, redacted request IDs, transaction hashes and observed errors here, then submit the [official feedback form](https://developers.uniswap.org/hackathon-feedback). Do not include API keys.
