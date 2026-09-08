# ETHOnline submission and demo plan

## Positioning

“Let an agent spend without your wallet. Give it a job and a spending limit, then close its spending access while keeping recovery.”

We are not claiming to invent agent wallets, browser takeover or disposable sessions. The demonstration is a complete, understandable lifecycle with independently enforced permissions and persistent recovery. See the research report for direct competitors.

## Rules checked September 7

The [official event details](https://ethglobal.com/events/ethonline2026/info/details) list submission at **Sunday, September 13, 12:00 noon EDT**. They describe technicality, originality, practicality, usability and WOW factor without numerical weights. Select at most three partners. Prepare a 2–4 minute human-narrated video at least 720p, public source/version history and AI-tool disclosure. Live judging allows four minutes for the demo and three for questions. Recheck the portal for any event updates.

The source is public at [GitBolt/melt](https://github.com/GitBolt/melt). The product page is [Melt](https://melt-woad.vercel.app); the workspace is [Open Melt](https://melt-woad.vercel.app/app). A hosted URL alone does not establish a successful public-network task. Disclose AI-assisted implementation and reused UI components accurately. Check event eligibility against when project-specific work began.

## Three-minute video

| Time      | Show                                                                             | What it proves                                |
| --------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| 0:00–0:20 | Product page, then one concrete job: mint without connecting the main wallet     | Clear user problem                            |
| 0:20–0:45 | Email sign-in, owner wallet, exact allowance, fixed recovery destination         | Privy and permission UX                       |
| 0:45–1:20 | Configured model sees the page, connects its task wallet and attempts the action | Actual agent use, not a prerecorded animation |
| 1:20–1:40 | Oversized spend rejected; allowed mint confirms                                  | Enforcement independent of model intent       |
| 1:40–2:15 | Close, NFT arrives home, remaining ETH returned; inspect explorer/receipt        | Full onchain lifecycle                        |
| 2:15–2:40 | A late deposit still recovers after closure; mention restart proof               | Persistent owner recovery                     |
| 2:40–3:00 | HTTP or downloaded-client/MCP invocation and verified live status                | Reusable application, honest scope            |

Label the guardrail page as an adversarial test fixture. Record an actual model or externally connected agent for the final video. The production app has no scripted driver; automated fixture choices live only in tests, and manual browser tests are not evidence of autonomous reasoning. Show a normal successful run and the blocked-spend case separately: the model should pause for review on a policy rejection, not quietly press on. Keep the full Uniswap owner conversion in a separate short sponsor clip if it makes the main narrative unwieldy. Show its swap and task-funding hashes.

## Evidence to collect

Use one receipt bundle for the complete public-network run: chain ID, deployed task-wallet address, owner funding hash, permitted execution hash, returned asset/ETH hashes, model identifier, and final outcome. A model's “finished” message is not evidence of a purchase. The current success signal establishes a confirmed permitted transaction; verify that the received asset matches the intended task as well.

The downloadable client and HTTP API are the distribution story. Do not spend hackathon time publishing an npm package. The demo should show one external agent operating an already-authorized session while failing to create a new allowance.

## Before submission

- [ ] Privy email, external wallet and passkey login verified on the actual origin.
- [ ] Live model completes the chosen task on the chosen testnet; save deployment, funding, execution and recovery hashes.
- [ ] One independent compatible dapp tested and its exact supported action documented.
- [ ] Uniswap live route and wallet-signed transaction recorded; official feedback form completed.
- [ ] Public repository and deployed URL open without account access; contribution and AI-tool disclosure match the actual work.
- [ ] Confirm correct event pool; disclose previous code/design and AI tooling.
- [ ] Human-narrated video and architecture diagram attached; show confirmed task outcome separately from session closure.
- [ ] Pick only partner tracks with demonstrated requirements. Privy/Uniswap are the implemented shortlist; Bazantic is conditional, not integrated.
- [ ] Check-in completed in the portal by the applicable deadline; Discord update posted by the user if desired.

The check-in draft is in `docs/check-in.md`. A Discord post does not itself prove that the portal check-in was completed.
