# ETHOnline competitor review — September 7, 2026

Read through Computer Use in the user's Safari Discord session. Reviewed the September 7 project-check-in batch back to the opening announcement (older May posts appeared above it), team pitches from September 4–7, and recent messages in information, event schedule, ETHOnline chat, mentorship help, questions, and all eleven ETHOnline partner channels. This is a review of dozens of project descriptions and channel windows, not an exhaustive archive of every server message. Long Discord accessibility messages sometimes truncate; two close competitors were followed into their public repositories. No messages, reactions, check-ins, or submissions were sent.

## Judgment

Melt has close adjacent competition. No reviewed description explicitly demonstrated the same full loop of a provider-issued, expiring compute entitlement being partially consumed, resold, and redeemed by a second buyer without resetting expiry. That is a finding about this sample, not proof of uniqueness.

The defensible pitch is: **Recover the value of prepaid compute you will not use before it expires.** The broader claims “agents buy compute,” “x402 service marketplace,” “agent payments with receipts,” and “safe agent spending” are crowded.

## Closest overlaps

| Project                                                                         | Observed scope                                                                                                                                    | Implication for Melt                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Coalition](https://ethglobal.com/showcase/coalition-9d4ok)                     | Agents pool USDC on Arc to jointly buy shared compute, initially a VPS. SDK documents ERC-8004 identity/reputation and resource-pool commitments. | Closest compute-economics competitor. It groups purchasing power before purchase; Melt recirculates unused rights after purchase. Do not pivot into generic group buying. |
| [TrueCollective](https://github.com/mashharuki/ethglobal-online-2026)           | NFT-linked content access, limited-use/expiring licenses, ownership transfer, future revenue allocation, MCP purchases on Hedera.                 | Closest rights-lifecycle competitor. Their IP/content licensing differs from Melt's consumable service capacity, but rights and payments are not unique to Melt.          |
| [AgentTether](https://ethglobal.com/showcase/agenttether-oso1m)                 | Agents buy conditional blockchain-event webhooks; metering by processed blocks and capped settlement using x402/Permit2.                          | Competes on paying for useful work and avoiding waste. Resale and expiry-preserving transfer must be the visible distinction.                                             |
| [Tool402](https://ethglobal.com/showcase/tool402-8x70q)                         | Backs agent-native APIs with verifiable revenue from x402 payments on Hedera.                                                                     | Adjacent service monetization. Adding an x402 endpoint alone will not differentiate Melt.                                                                                 |
| [Koven](https://ethglobal.com/showcase/koven-7598i)                             | Agents discover paid services, borrow working capital, pay through a restricted signer, and repay.                                                | Adjacent procurement/finance. Potential future consumer of capacity rather than a reason to add lending now.                                                              |
| [Keryx](https://ethglobal.com/showcase/keryx-sv1zi)                             | Budgeted paid research jobs, source purchases over x402, receipts and recovery.                                                                   | Strong example of a specific paid workload and explainable purchasing decisions.                                                                                          |
| [CosmicGameSanctuary](https://ethglobal.com/showcase/cosmicgamesanctuary-da0gn) | Browser-game storefront with Hedera payments, ownership keys, Privy and proposed autonomous buyers.                                               | A clear buy→own→use story. Melt must be equally legible.                                                                                                                  |

Coalition's [SDK README](https://github.com/Jashk120/Coalition/blob/main/sdk/README.md) confirms documented pooling, identity, and reputation APIs; I did not run it or establish its live deployment status.

TrueCollective's README is internally inconsistent: earlier sections say live settlement remains unverified, while its verification section claims a completed live MCP purchase/decrypt run with a 0.1 HBAR payment. Treat that as self-reported, evolving evidence. Its architecture and implementation detail make it a serious adjacent entrant; do not dismiss it because AI tools contributed code.

## Crowded patterns

Observed a large cluster of bounded agent wallets, policies, identity, escrow and reputation: Froggy, AgentARC, worldCommerce, varanasi, Cresnex IntentLock, AgentProof, Mandate, Usenami, Arbitra, Helico, Perjury, and payOrRefuse. Another cluster combines agents with trading or prediction markets: AgentBull, Binary Bet, pebble, Robinhood Predictor, TradeCharts, thelema, and ratio.

Other descriptions reviewed included Tare, Wizard, Prism, genesis, Glasshouse, ComplianceGateway, ArcAsset, Creva SealPay, Argus4626, Oases, FreelanceTrail, PAI, SUBFLOOR, Onchain Heartbeat, Startup On Fire, Agentic Risk Manager, hooked.family, Lattice Prime, DeSci Proof Notebook, Postage, Eve, WISHMail, Sowee, Banshee Music, Agent FUEL, Automator, AquaGhost, Seyf, Data Aggregator Tool, tearrubr, Merxet and Minato. Partner channels added an unnamed inference router, scheduled-refund x402 service, Cap Table, ZoneGo, Verdikt, DYNEXA and Nota.

A fashionable name or AI-written prose is not evidence of poor implementation. The useful filter is whether the builder can show a real external input, a meaningful state transition, correct failure behavior, and a reproducible result. Some descriptions are broad promises; others include transaction evidence and concrete integration blockers. No demos were executed during this review.

## Adjacent improvements worth pursuing

1. **Expiry-aware capacity rescue.** An agent compares its remaining workload with its remaining credits and expiry, proposes a sale of the surplus, and buys only enough capacity to finish its next task. Keep owner-defined limits and explicit confirmation where required. This builds on Melt's existing resale flow instead of competing on generic agent-wallet policy infrastructure.
2. **A capacity-aware image workflow.** An ecommerce seller needs a fixed number of product images resized. The workflow checks existing rights, buys the shortfall, processes the files, and offers unused units for resale. This makes the current deterministic worker commercially understandable without pretending it is GPU inference.
3. **Fulfillment evidence attached to each entitlement.** Show original expiry, remaining units, ownership changes, output receipt, and failed-job credit recovery in one inspectable trail. payOrRefuse and AgentTether suggest demand for verifying what paid services actually deliver; this does not require an AI judge or a new reputation protocol.

Avoid adding a second payment to redeem an already-paid credit. An x402 purchase integration must distinguish paying for the right from consuming it. Avoid expanding into lending, generic escrow courts, or prediction markets this week.

## Partner-channel findings that change execution

- [Bazantic](https://discord.com/channels/554623348622098432/1544000328167591997): Tom Hay said September 6 that x402 currently settles on Base/Base Sepolia and MPP on Tempo, not arbitrary chains. Login via email is available; the confusing access-request form was hidden. A Hedera+Bazantic design cannot assume identical settlement rails.
- [ENS](https://discord.com/channels/554623348622098432/801175268639113216): September 7 feedback explicitly rejected simple name resolution as sufficient. More substantive suggestions included text records, subnames and authorization tied to name state. No ENS integration is currently implemented in Melt.
- [Hedera](https://discord.com/channels/554623348622098432/1275189427102290070): builders asked about Blocky402 batch settlement, deterministic-agent eligibility, scheduled refunds, and ATS failures. These questions were not all answered in the reviewed window. Do not treat participant guesses as sponsor approvals.
- [The Graph](https://discord.com/channels/554623348622098432/982729443795693688): AI-tooling eligibility and single-product/composability questions remained open in the reviewed messages. An indexer added only to tick a prize box is a weak bet.
- [Ledger](https://discord.com/channels/554623348622098432/1284777373819994153): repeated unanswered questions about hardware-free Speculos/Key Ring judging. [World](https://discord.com/channels/554623348622098432/971226642276057088): multiple sandbox-access delays. Avoid making either a late critical dependency without confirmed access.

Melt's local documentation currently records a working Anvil lifecycle and HTTP/MCP worker; public deployment, Hedera/Blocky402, Bazantic, ATS and ENS evidence are still missing. The practical priority is one real sponsor-integrated lifecycle over further decorative features.

## Immediate sequence

1. Complete the dashboard check-in with the actual working scope, demo loop, and remaining integration blockers. This research did not submit it.
2. Validate the chosen paid-service integration before broadening features. Preserve one entitlement authority and correct retries/refunds across payment and issuance.
3. Make the buyer→use→resale→second-buyer→output flow accessible from a fresh session with public testnet receipts.
4. Use the September 8 feedback session to ask whether the resale/expiry distinction is clear and whether the actual integration meets the selected partner track.
5. Record a 2–4 minute narrated demo at 720p or higher, with audio and no music. Show the actual output and the resale transaction early.

[Official information](https://discord.com/channels/554623348622098432/906117584838070293), September 7: check-in #1 due September 7 at 11:59pm ET; feedback session September 8 at 2pm ET; check-in #2 due September 10 at 11:59pm ET; submissions September 13 at noon ET. Staff clarified in [event chat](https://discord.com/channels/554623348622098432/1490278514057023589) that at least one check-in is required. Posting the update to Discord is optional and does not replace the dashboard check-in. Submissions can be updated until the deadline, but edits must be submitted again to save.
