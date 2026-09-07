# ETHOnline submission and demo plan

## Positioning

“Melt is a wallet for one browser task. Give an agent a small allowance, let it bring something back, then close its spending access while keeping your recovery access.”

We are not claiming to invent agent wallets, browser takeover or disposable sessions. The demonstration is a complete, understandable lifecycle with independently enforced permissions and persistent recovery. See the research report for direct competitors.

## Rules checked September 7

The [official event details](https://ethglobal.com/events/ethonline2026/info/details) list submission at **Sunday, September 13, 12:00 noon EDT**. They describe technicality, originality, practicality, usability and WOW factor without numerical weights. Select at most three partners. Prepare a 2–4 minute human-narrated video at least 720p, public source/version history and AI-tool disclosure. Live judging allows four minutes for the demo and three for questions. Recheck the portal for any event updates.

No Git commit, push or publication was performed by this build. The user must explicitly authorize/publish the source and provide genuine version history; never fabricate it. Disclose the existing design work, reused components, archived capacity prototype and AI-assisted implementation honestly. Confirm the start-fresh/continuity classification against when project-specific work began.

## Three-minute video

| Time      | Show                                                                                   | What it proves                                |
| --------- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| 0:00–0:20 | One concrete job: mint a collectible without connecting the main wallet to its website | Clear user problem                            |
| 0:20–0:45 | Email sign-in, owner wallet, exact allowance, fixed recovery destination               | Privy and permission UX                       |
| 0:45–1:20 | Live browser agent sees page, connects its task wallet and attempts the action         | Actual agent use, not a prerecorded animation |
| 1:20–1:40 | Oversized spend rejected; allowed mint confirms                                        | Enforcement independent of model intent       |
| 1:40–2:15 | Close, NFT arrives home, remaining ETH returned; inspect explorer/receipt              | Full onchain lifecycle                        |
| 2:15–2:40 | A late deposit still recovers after closure; mention restart proof                     | Persistent owner recovery                     |
| 2:40–3:00 | SDK/MCP invocation and what is actually live                                           | Reusable application, honest scope            |

Label the guardrail page as an adversarial test fixture. Record the credential-backed model for the final video; the default scripted fixture driver must not be presented as AI. Keep the full Uniswap owner conversion in a separate short sponsor clip if it makes the main narrative unwieldy. Show its swap and task-funding hashes.

## Before submission

- [ ] Privy email, external wallet and passkey login verified on the actual origin.
- [ ] Live model completes the chosen task on the chosen testnet.
- [ ] One independent compatible dapp tested and its exact supported action documented.
- [ ] Uniswap live route and wallet-signed transaction recorded; official feedback form completed.
- [ ] Public repository, accurate contribution history and deployed URL added by the user.
- [ ] Confirm correct event pool; disclose previous code/design and AI tooling.
- [ ] Human-narrated video and architecture diagram attached.
- [ ] Pick only partner tracks with demonstrated requirements. Privy/Uniswap are the implemented shortlist; Bazantic is conditional, not integrated.
- [ ] Check-in completed in the portal by the applicable deadline; Discord update posted by the user if desired.

The check-in draft is in `docs/check-in.md`. A Discord post does not itself prove that the portal check-in was completed.
