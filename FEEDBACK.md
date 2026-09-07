# Uniswap integration feedback

Status: documentation and adapter implementation reviewed; live API-key-backed swap verification is still pending. This is not a claim that the official feedback form has been submitted.

The optional funding flow calls `check_approval`, `quote`, and `swap` from `apps/api/src/uniswap.ts`; `apps/web/src/FundingSwap.tsx` obtains owner approval and submits the returned transaction. The agent browser never obtains access to that owner wallet.

Useful documentation details: the consistent Universal Router header, `permitAmount: EXACT`, the explicit Permit2 domain/types/values shape, and the requirement to supply both signature and permitData. We implemented a 30-second quote lifetime, owner binding, simulation, a swap deadline and exact ERC-20 allowance instead of unlimited approval. Quotes requesting a broader permit are rejected.

Suggested documentation improvement: place the EIP-1193 / viem signing transformation directly beside the Permit2 example, including `primaryType` and the mapping from `values` to `message`. A route-specific runnable testnet pair would also make hackathon verification easier; supported networks alone do not establish available liquidity.

After live verification, append the chain/token pair, redacted request IDs, transaction hashes, observed errors and measured feedback. Submit the [official feedback form](https://developers.uniswap.org/hackathon-feedback) and record completion. Do not include API keys.
