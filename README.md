# Melt · a wallet for one task

Give a browser agent a specific job, a small native-token allowance, one permitted contract/function, and a deadline. Melt opens an isolated browser with that task's wallet. When the session ends, spending access closes onchain and supported assets return to the immutable owner. Recovery remains possible for late arrivals.

The working example mints a collectible in a browser, returns it with unused ETH, and produces a transaction receipt. A guardrail fixture attempts an oversized spend before the permitted mint. The local example uses a clearly labelled scripted driver; an actual model adapter and external-agent MCP tools are included.

## Run locally — no keys or payments

Requires Node 24.13+ (tested with 25.8.1), npm, [Foundry / Anvil](https://getfoundry.sh/introduction/installation/), and Chromium installed by Playwright.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open [Melt](http://127.0.0.1:5173), choose **Try the demo**, create it, then start the task. The script runs Anvil on 8545, the API on 8787, standalone dapp fixtures on 8788, and the website on 5173. All addresses and ETH in this mode are public development accounts and test funds. `.env.example` documents the optional configuration.

## What's implemented

- Session creation, funding, real browser execution, live preview, manual takeover, stop, expiry, recover, and downloadable receipts.
- Per-task Solidity vaults with immutable owner, agent, target/function permissions, cumulative native-token budget and expiry; no mutable approvals or arbitrary signature surface.
- ERC-20 and ERC-721 recovery, including manual registration of late assets. Native refunds are derived from confirmed recovery logs.
- SQLite persistence, idempotent creation, pending transaction reconciliation, owner isolation and hashed/revocable agent keys.
- Privy email/wallet login, automatic embedded wallets, passkey sign-in/enrolment, server token verification and Privy-managed relayer signing in configured mode.
- Owner-reviewed Uniswap exact-input conversion before funding: approval check, exact ERC-20 allowance, exact Permit2 message, short-lived owner-bound quotes and simulated unsigned swaps.
- TypeScript workspace SDK, eight MCP tools, model adapter, and [OpenAPI](docs/openapi.json).
- Light Manrope interface with a custom paper wallet sleeve, allowance ribbon, moving navigation and reduced-motion support.

## Monorepo

| Location                | Responsibility                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| `apps/web`              | React application, Privy authentication, wallet funding and UI                  |
| `apps/api`              | Fastify API, browser worker, model/Uniswap adapters, SQLite and chain execution |
| `packages/shared`       | Shared validation and domain types                                              |
| `packages/sdk`          | TypeScript client and stdio MCP server                                          |
| `contracts`             | TaskVault, collectible fixture and Solidity tests                               |
| `docs`                  | Setup, architecture, security, research, judging and API documentation          |

Only `apps/` and `packages/` are the current application. Root `src/`, `server/`, earlier capacity contracts, and older inspection scripts are retained legacy material and are excluded from the current TypeScript build.

## Verification

With `npm run dev` running, use:

```sh
npm run check
```

This type-checks and builds the application, runs contract and adapter tests, browser/API/MCP end-to-end tests, and a separate worker restart test. Financial state is checked against real local Ethereum receipts. See [verification](docs/verification.md) for scope and evidence. Tests create their own local accounts/sessions; rapid repeated suites can hit the real API's rate limits, so allow a minute between full runs.

## Set up the external services

Follow [setup](docs/setup.md). Service keys, public deployment, relayer funding, a real model run, and live Privy/Uniswap transaction proof remain operator steps. Those flows have implementation and adapter tests, but have **not** been represented as credential-verified or publicly deployed.

Local execution is free. Hosted model usage, provider plans, gas and hosting may cost money; no paid subscription is needed to run the playground.

## Read next

- [Architecture](docs/architecture.md) and [security boundaries](docs/security.md)
- [Agent SDK / MCP](docs/agents.md) and [API reference](docs/api.md)
- [Research, competitors and all partner tracks](docs/research/validation-2026-09-07.md)
- [Demo and submission plan](docs/hackathon.md), [check-in draft](docs/check-in.md), [Uniswap feedback](FEEDBACK.md)

This is a tested hackathon implementation, not an audited wallet or a claim of compatibility with every dapp. It currently supports native-value contract calls; signature-based login, ERC-20 spending approvals, ERC-1155, cross-chain activity and arbitrary dapp navigation are outside its supported execution surface.
