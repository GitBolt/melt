# Melt · Let an agent spend without your wallet

Give a browser agent one job, a spending limit, and a deadline. Melt opens an isolated browser with a separate task wallet. When the session ends, spending access closes onchain and supported assets return to your wallet. Recovery stays available for assets that arrive later.

[Open Melt](https://melt-woad.vercel.app) · [API reference](docs/api.md) · [Connect an agent](docs/agents.md) · [Verification record](docs/verification.md)

The core flow is concrete: an agent opens a collectible website, connects its task wallet, mints within the limit, and returns the NFT and unused ETH. Each step has transaction evidence. The task's outcome and the wallet's closed state are tracked separately; a returned balance does not imply the requested task succeeded.

## Run locally

Requires Node.js 24.13+, npm, [Foundry / Anvil](https://getfoundry.sh/introduction/installation/), and Chromium installed by Playwright.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open [the local site](http://127.0.0.1:5173), choose **Open Melt**, then **Open local workspace**. Create a task wallet, then **Open task browser**. Under **View browser controls**, connect the wallet, refresh the controls, and choose the mint button. End the session to return the collectible and remaining ETH.

Without model credentials, you or an external agent control the browser through visible controls. There is no scripted production driver. With a configured model, Melt chooses actions from page observations and finishes when the job is done or a locked session confirms its permitted transaction. The browser tests choose fixture buttons explicitly inside the test suite.

Local development starts Anvil on 8545, the API on 8787, test dapps on 8788, and the web app on 5173. Its ETH and wallets are public development accounts with no monetary value. No provider account or payment is required for manual local use.

To try **agent-driven Uniswap swaps** against the real Uniswap V3 contracts, start with a mainnet fork (the chain id stays 31337, so every other local flow is unchanged):

```sh
MELT_FORK=1 npm run dev
```

Then sign in, choose the **Swap** tab, pick a token and amount, and run it. Melt swaps ETH for the token from a spend-limited task wallet and returns the token to your wallet — no ERC-20 approval, real onchain execution. Set `FORK_RPC_URL` to use your own RPC.

## Connect your own agent

Create and fund a session in Melt, then create an API key under **Developers**. Use HTTP directly or download the dependency-free JavaScript client:

```sh
curl --fail --show-error https://melt-woad.vercel.app/api/client.mjs -o melt-client.mjs
```

```js
import { Melt } from "./melt-client.mjs";

const melt = new Melt({ apiKey: process.env.MELT_API_KEY });
await melt.start(sessionId, { manual: true });
const page = await melt.observe(sessionId);
// Your agent chooses a control from page.controls, then observes again.
```

The client includes status polling, cancellation, screenshots, receipts and clear error handling. It never automatically retries financial actions. There is no npm package to publish or install. [Runnable examples](examples/README.md) also show direct HTTP. The repository-local [MCP server](docs/agents.md#mcp-from-the-repository) exposes the same session and browser controls.

## What's implemented

- **Allowance-bounded Uniswap V3 swaps.** An agent (or one line of natural language) swaps ETH for a token from a task wallet capped by an onchain limit, then the token returns to the owner. Deterministic and reliable — it never depends on a model driving a UI. Because an ETH→token router call carries value and needs no `approve`, it runs inside the existing task-wallet security model.
- **Recurring buys (dollar-cost averaging).** Schedule several swaps over time under one onchain budget — an automated strategy the agent runs to completion, with proceeds returned on close.
- **Agent access to swaps.** The dependency-free client and MCP server expose Uniswap price discovery (`quote`, `tokens`), so an external agent (Cursor, Claude) can size and operate owner-authorized swaps within limits it cannot raise.
- Owner-authorized wallet creation, separate funding, isolated browser execution, live preview, manual takeover, expiry, recovery and downloadable receipts.
- Solidity task wallets with immutable owner, agent, optional permitted target/function, cumulative native-token budget and expiry.
- ERC-20 and ERC-721 recovery, including late assets. Native refunds are derived from confirmed recovery logs.
- SQLite persistence, idempotent creation, transaction reconciliation, account isolation and hashed, revocable agent keys.
- Privy email/wallet authentication, embedded wallets, passkey support, verified owner identity and Privy-managed relayer signing in configured mode.
- An owner-reviewed Uniswap funding conversion: bounded approvals, Permit2 validation, expiring owner-bound quotes and simulated unsigned swaps.
- Built-in model integration and external-agent HTTP, JavaScript and MCP access. Eight browser action types, including opening a public site; no arbitrary script execution.
- A light interface with custom paper-wallet motion, a spending ribbon and reduced-motion support.

Privy is the owner identity and wallet: email or external wallet login, an embedded Ethereum wallet, passkeys, and the relayer that signs outer task-wallet transactions. The live financial flow is sign in → owner wallet → fund the session → the agent spends inside the limit → unused funds and supported assets return. Implementation: [`apps/web/src/PrivyApp.tsx`](apps/web/src/PrivyApp.tsx).

### Uniswap integration (for reviewers)

Melt integrates Uniswap in two places. Precise code pointers are in [`FEEDBACK.md`](FEEDBACK.md).

- **Agent-executed Uniswap V3 swaps (headline).** A task wallet swaps ETH for a token on Uniswap V3, bounded by its onchain allowance. Engine: [`apps/api/src/swap.ts`](apps/api/src/swap.ts) — `quoteSwap` (QuoterV2 `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`, best fee tier), `buildSwapCall` (SwapRouter02 `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` `exactInputSingle`, native value, no approval). Execution: [`apps/api/src/browser.ts`](apps/api/src/browser.ts) `runSwap` via the vault's `execute`. The reason no approval is needed and this stays safe: [`contracts/src/TaskVault.sol`](contracts/src/TaskVault.sol) `execute`/`_forbidden`. Natural-language routing: [`apps/api/src/intent.ts`](apps/api/src/intent.ts).
- **Owner funding conversion (Uniswap Trading API).** An owner-only conversion used to fund a session. The agent browser never receives that wallet. Adapter: [`apps/api/src/uniswap.ts`](apps/api/src/uniswap.ts) (`checkApproval`, `uniswapQuote`, `prepareSwap`). UI: [`apps/web/src/FundingSwap.tsx`](apps/web/src/FundingSwap.tsx).

Implementation is not the same as live verification. [The verification record](docs/verification.md) distinguishes local transaction evidence, mocked provider tests and outstanding public-network checks.

## Use a public testnet

Follow [setup](docs/setup.md) and configure the hosted services with `.env.example`. A public-network run needs the selected chain's RPC, Privy configuration, a funded relayer, and owner test ETH. The built-in agent also needs model credentials; an external API/MCP agent can supply its own decisions.

Testnet ETH has no monetary value. Mainnet gas, hosted models and infrastructure can incur costs. Neither a deployed frontend nor successful RPC connectivity establishes that the full public-network transaction flow has passed.

## Repository

| Location          | Responsibility                                                                    |
| ----------------- | --------------------------------------------------------------------------------- |
| `apps/web`        | Product page, React workspace, authentication, funding and session UI             |
| `apps/api`        | HTTP API, browser worker, model/Uniswap adapters, persistence and chain execution |
| `packages/shared` | Shared validation and domain types                                                |
| `packages/sdk`    | Standalone JavaScript client, types and stdio MCP server                          |
| `examples`        | HTTP and downloaded-client examples                                               |
| `contracts`       | TaskVault, collectible test contract and Solidity tests                           |
| `docs`            | Setup, architecture, security, API reference and submission evidence              |

## Verify

With `npm run dev` running in a separate terminal:

```sh
npm run check
```

This builds the app and runs contract, adapter, SDK, browser/API/MCP and worker-restart checks. Browser tests use real Chromium and local Ethereum receipts. They do not call a live model or prove third-party dapp compatibility. API rate limits apply to tests too; leave a minute between repeated full browser suites.

## Read next

- [Architecture](docs/architecture.md) and [security boundaries](docs/security.md)
- [API reference](docs/api.md), [agent integration](docs/agents.md) and [OpenAPI](docs/openapi.json)
- [Competitor and track research](docs/research/validation-2026-09-07.md)
- [Submission plan](docs/hackathon.md), [check-in draft](docs/check-in.md) and [Uniswap feedback](FEEDBACK.md)

The supported execution surface is native-value contract calls. Optional locks can pin a session to one contract function. ERC-1155, cross-chain actions and private-network browsing are outside it. This hackathon implementation has not undergone an independent security audit.
