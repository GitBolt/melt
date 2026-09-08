# Melt: final submission review

Reviewed September 7, 2026 against the live official event pages, primary product documentation, public project repositories and ETHGlobal showcases. This report concerns the current **wallet for one browser task**. It does not use the abandoned capacity-market concept. Competitor implementations were not executed, and this is a targeted review rather than an exhaustive inventory.

## Decision

Finish a real public-testnet task lifecycle before adding another sponsor. The strongest story is specific: an agent receives a small, temporary wallet, completes a browser task, returns its result, and loses spending access while the owner retains recovery.

The opportunity is not “agents can have wallets.” Strong existing projects already demonstrate agent wallets, browser takeover, payment controls and receipts. Melt can distinguish itself through a completed task's **onchain closure and independently usable recovery path**, presented in a UI a normal wallet owner can understand. This is an implementation and positioning judgment, not a claim that these primitives are new or that a prize is assured.

## Verified event requirements

The [official event details](https://ethglobal.com/events/ethonline2026/info/details) specify:

- Submit by **September 13, 2026 at noon EDT** through the Hacker Dashboard.
- Supply a **2–4 minute video**, at least **720p**, with human narration. Do not use synthetic narration, sped-up footage or a phone recording. Editing out waiting is allowed.
- Select at most **three partners**. Multiple categories under one partner consume one selection.
- Judging covers technicality, originality, practicality, usability/DX and WOW factor; no numerical weighting is published. Live finalist judging is four minutes of demonstration and three minutes of questions.
- Classic projects must begin after the official start; continuity projects must disclose prior work and their new contribution. Include public source and meaningful development history, distinguish reused work, and disclose AI-assisted files/assets. The rules require meaningful human contribution. Include specifications and planning artifacts if using a specification-driven workflow.

The event page does not impose a blanket Ethereum-mainnet deployment requirement. Use a public testnet and describe it accurately. Partner-specific requirements still apply. Eligibility classification and prize selection remain organizer decisions.

## Partner priorities and actual qualification gaps

| Priority    | Relevant category                                                                           | Requirements to satisfy                                                                                                                                                                                                                                                                                                                                                  | Evidence Melt should supply                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1           | **Privy — Best financial flow, $2,500**                                                     | Privy must be central; create/use a Privy wallet and complete a functional financial flow using a generally available feature. Working demo and accessible source are required. Login by itself is insufficient. [Official prize](https://ethglobal.com/events/ethonline2026/prizes/privy)                                                                               | Email onboarding → real embedded owner wallet → task funding → result/refund. Include public-testnet transaction hashes and identify where Privy signs. Show how owner and relayer roles differ.                   |
| 2           | **Uniswap — Best Uniswap Stack Contribution, from-scratch pool: up to three $1,000 awards** | Meaningful Uniswap-stack use; public open-source repository; `FEEDBACK.md`; completed [developer feedback form](https://developers.uniswap.org/hackathon-feedback) linking that file. README must point to integration code/contracts. A separate $2,000 pool is continuity-only. [Official prize](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation) | Successful owner-approved swap followed by task funding, with token addresses, chain, quote details and both hashes. Update feedback with actual integration experience. An untested swap button is weak evidence. |
| Conditional | **Bazantic — Best Recipe using sponsor APIs, $500 / $300 / $200**                           | Account, Bazantic x402/MPP gateway, another available or sponsor service, a recipe whose result depends on both, a complete recording and account identifier. [Official requirements](https://ethglobal.com/events/ethonline2026/prizes)                                                                                                                                 | A working Melt task API + sponsor-service recipe. Only pursue after the core flow works. Plain REST/MCP access does not establish Bazantic eligibility.                                                            |

Privy's B2B category additionally requires a genuine organization workflow and a Privy control such as a policy, signer, quorum or intent. Do not claim it merely because an API exists. [Privy requirements](https://ethglobal.com/events/ethonline2026/prizes/privy)

Bazantic's separate new-API category also awards $500 / $300 / $200 and requires an eligible new service plus a gateway and combined recipe; its “Help an Agent” pool is continuity-only. [Bazantic requirements](https://ethglobal.com/events/ethonline2026/prizes)

Do not add ENS name display, a Graph query or a confidential-handler example just to name another partner. ENS requires ENSv2 on Sepolia to be central; The Graph requires live data that meaningfully drives the application; Chainlink's confidential category requires a useful confidential handler with successful execution evidence. None is established by Melt's current task-wallet architecture alone. [ENS](https://ethglobal.com/events/ethonline2026/prizes/ens), [The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph), [Chainlink](https://ethglobal.com/events/ethonline2026/prizes/chainlink)

### Testnet choice does not block Uniswap

The current Trading API supports **Ethereum Sepolia (11155111), Base Sepolia (84532), and Unichain Sepolia (1301)**. Ethereum and Unichain Sepolia also appear in Uniswap's web interface; Base Sepolia is available through the API. Use a version-pinned Universal Router and verify the returned address against the official deployment list. Chain support does not imply liquidity for a chosen token pair: obtain a successful quote before depending on it. [Supported chains and tokens](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains)

If Ethereum Sepolia faucet access is the bottleneck, Unichain Sepolia is a compatible alternative, subject to funded accounts and a working route. Its official public RPC is `https://sepolia.unichain.org`, and its explorer is `https://sepolia.uniscan.xyz/`. The provider labels that RPC unsuitable for production; it is a development option, not an uptime promise for the hosted product. [Network information](https://developers.uniswap.org/docs/unichain/technical-information/network-information)

## Competition that should affect the demonstration

| Project                                                                                         | Verified public evidence                                                                                                                                                                                                                                                                                                                        | Consequence for Melt                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Froggy — ETHOnline 2026](https://github.com/grmkris/Froggy-ETHOnline2026)                      | The current README describes a shared agent browser, human takeover, externally enforced spending rules, Privy signing, external-agent access and receipts. It claims live Base/Hedera payments and links release evidence, while identifying some remaining recovery work. These are self-reported claims, not independently executed results. | Treat it as direct competition. Compete on the temporary vault lifecycle, enforceable end of spending, and recovery without trusting the worker to remain online. Do not imitate its wider payments/research product. |
| [NanoCrawl — Cannes 2026](https://ethglobal.com/showcase/nanocrawl-egxyi)                       | The official showcase lists an Arc first-place award. It describes pay-per-page MCP access, disposable session wallets and privacy infrastructure.                                                                                                                                                                                              | Disposable wallets are prior art. A visible, recoverable output is a clearer Melt distinction. Do not promise anonymity or erased chain history.                                                                      |
| [ethui agentic wallet — Lisbon 2026](https://ethglobal.com/showcase/ethui-agentic-wallet-6ohfx) | The official showcase lists finalist recognition. Its developer wallet and cloud testnets expose real wallet/browser testing workflows over MCP.                                                                                                                                                                                                | “An agent can operate a real wallet” is also prior art. Show why a person would use Melt for a bounded task on a live public network. A published npm package is unnecessary to demonstrate useful developer access.  |

Recognition establishes that these projects received awards, not why judges selected them. My inference is that a concrete, reproducible workflow makes technical work easier to evaluate. Similar names, AI-written descriptions or large commit counts do not establish product quality. Prefer actual state transitions, transaction evidence and credible failure handling when assessing competitors.

## Five achievable improvements, in order

1. **Make the hosted default genuinely live.** Use configured Privy, a funded public-testnet relayer and an actual model. Show the chain name, actual balances and transaction links. If the model or RPC is unavailable, say so and disable dependent actions; never silently substitute a scripted path. Keep deterministic drivers solely in explicitly labelled tests. Acceptance: a fresh hosted user completes funding → model-controlled browser action → returned asset and funds, with public hashes.

2. **Make recovery usable without the worker.** The current Solidity contract already permits owner calls to `close`, `recoverNative`, `recoverERC20` and `recoverERC721`. Turn the receipt into a recovery kit: chain, vault address, immutable owner, ABI/call instructions and asset IDs. Ideally provide a client-side recovery page using the owner's wallet directly. Acceptance: stop the API, close from the owner wallet, recover an asset, then recover a later deposit. A relayer-only recovery button does not prove independence.

3. **Give external agents a five-minute HTTP path.** Put a real `curl`/`fetch` quickstart, authentication, session permissions, polling, failures and revocation in the deployed docs. Include a downloadable OpenAPI document and a copyable small client; a local workspace SDK can remain optional. Start from an owner-authorized session so an agent key cannot create or increase an allowance. Acceptance: a separate client observes and operates its session, gets denied access to another owner's session, and loses access immediately after key revocation. No npm publication is needed.

4. **Make the Uniswap step solve funding friction.** Show current owner balances and a supported token choice instead of requiring a user to know base units. Preview the amount received, minimum received, network and separate gas needs. Keep permission and funding approvals understandable and owner-controlled. Acceptance: an actual testnet swap creates the funds used by the next task; preserve its evidence and record genuine feedback. If there is no route, show that explicitly and permit direct funding.

5. **Show one useful task and one failure, not ten integrations.** Make the primary task “mint this collectible within this limit,” with the received item visible in the receipt. Test a compatible independently hosted dapp where possible and document the exact action. Use a labelled adversarial page to show a forbidden transaction rejected, then complete an allowed task. Distinguish a call rejected before broadcast from an onchain revert. Acceptance: the receipt explains what was spent, what returned, why an attempt failed and whether recovery remains available.

These are priorities for implementation, not claims that they are all complete. The report was written during the live deployment work; final submission claims must follow the resulting evidence.

## Three-minute demo

| Time      | Show                                                                                  | Point                                         |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| 0:00–0:15 | One task and its result: a collectible in the owner's wallet                          | A concrete reason to use Melt                 |
| 0:15–0:40 | Privy login; actual network/balance; task allowance, allowed action and return wallet | Simple onboarding with visible authorization  |
| 0:40–1:20 | Actual model interacts with the browser and completes the allowed action              | A live agent, not timed animation or a script |
| 1:20–1:40 | Labelled forbidden call, its denial reason, unchanged allowance accounting            | Controls operate outside the model            |
| 1:40–2:10 | End session; returned asset and unused funds; explorer confirmation                   | The whole lifecycle                           |
| 2:10–2:40 | Recover a late deposit while the worker is unavailable                                | The strongest distinction                     |
| 2:40–3:00 | External client/API call and receipt; concise supported-scope statement               | A usable platform beyond the website          |

If the full swap flow makes the main clip confusing, attach a short partner-focused recording alongside it. Never imply a failure-test fixture is an independent commercial dapp. Keep testnet funds explicitly labelled even though the transactions and contract enforcement are real.

## Submission evidence checklist

- [ ] Fresh browser on the public URL can authenticate and finish the supported task.
- [ ] Record chain ID, vault and target contracts, owner/relayer roles, and real deployment/execution/recovery hashes.
- [ ] Public contract source or verifiable build artifact and ABI are accessible.
- [ ] Record model provider/model name and a redacted action trace; no secret values or unrelated browsing data.
- [ ] Save a success receipt, a denied-action receipt, and independent/late recovery evidence.
- [ ] API documentation works from a separate client; publish no secret key in examples or screenshots.
- [ ] README links directly to partner integration files and actual run evidence.
- [ ] Select only demonstrated partner integrations; finish the Uniswap feedback form if applying.
- [ ] Document what the builder directed/designed, where AI assisted, reused libraries and project-specific work dates accurately.
- [ ] Record and upload the human-narrated video; verify the final dashboard submission saved successfully.
- [ ] Confirm check-in and event-track status in the authenticated portal. This research did not submit anything.

Do not use “fully autonomous on any dapp,” “audited,” “funds can never be lost,” “real-money mainnet,” or “first agent wallet” as submission claims. The credible promise is a narrowly supported task with limits that can be inspected and an owner recovery path that actually works.
