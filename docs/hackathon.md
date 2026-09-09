# ETHOnline submission and demo plan

## Positioning

“Gift cards without stores. Send purchasing power for a purpose, and let the recipient’s AI choose how to use it later.”

Melt Envelopes transfer a restricted purchasing right from one person to another. Existing agent wallets restrict how an owner’s agent spends the owner’s money. Melt holds the gift between two people who may use completely different assistants.

Uniswap converts only the required ETH to USDC when a purchase qualifies. Privy gives both people email-created wallets. MCP is how ChatGPT, Claude, Codex or Grok redeem the gift. None of those are top-level product tabs.

## Rules checked September 8

The [official event details](https://ethglobal.com/events/ethonline2026/info/details) list submission at **Sunday, September 13, 12:00 noon EDT**. They describe technicality, originality, practicality, usability and WOW factor without numerical weights. Select at most three partners. Prepare a 2–4 minute human-narrated video at least 720p, public source/version history and AI-tool disclosure. Live judging allows four minutes for the demo and three for questions. Recheck the portal for any event updates.

The source is public at [GitBolt/melt](https://github.com/GitBolt/melt). The product page is [Melt](https://melt-woad.vercel.app); the workspace is [Open Melt](https://melt-woad.vercel.app/app). Disclose AI-assisted implementation and reused UI components accurately.

## Three-minute video

| Time      | Show                                                                | What it proves                         |
| --------- | ------------------------------------------------------------------- | -------------------------------------- |
| 0:00–0:20 | Product page: gift cards without stores                             | Clear, distinct problem                |
| 0:20–0:50 | Email sign-in, create “mobile data for your trip, up to $20”        | Privy and envelope UX                  |
| 0:50–1:20 | Fund with ETH; vault holds the gift                                 | Real onchain lock                      |
| 1:20–1:50 | Discover: plain-language search ranks real brands; cash-out is rejected | AI matching over ~900 live brands, hard policy gate |
| 1:50–2:20 | Redeem: Uniswap converts only the required amount to USDC           | Uniswap serves the consumer flow       |
| 2:20–2:45 | MCP: Claude or ChatGPT lists the envelope and proposes the purchase | Assistants are distribution            |
| 2:45–3:00 | Receipt, leftover funds still in the envelope                       | Honest settlement                      |

## Before submission

- [ ] Privy email, external wallet and passkey login verified on the actual origin.
- [ ] Envelope created, funded, matched, and redeemed with hashes saved.
- [ ] Uniswap settlement hash recorded; official feedback form completed.
- [ ] MCP redeem shown from an external assistant.
- [ ] Public repository and deployed URL open without account access.
- [ ] Human-narrated video and architecture notes attached.
- [ ] Pick only partner tracks with demonstrated requirements. Privy/Uniswap are the implemented shortlist. Chainlink CRE only with a real confidential workflow.
- [ ] Check-in completed in the portal by the applicable deadline.

The check-in draft is in `docs/check-in.md`. A Discord post does not itself prove that the portal check-in was completed.
