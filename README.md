# Melt · Gift cards without stores

Send purchasing power for a purpose — dinner, a flight home, mobile data for a trip — and let their AI choose how to use it later. The money can only become what you meant.

You create an envelope. Ethereum holds the amount, the purpose, the expiry, and where unused funds go. The recipient cannot cash it out. You cannot take it back early. Weeks later they open Melt, or they tell ChatGPT, Claude, Codex or Grok to use the gift. Melt finds a qualifying purchase, converts only the required ETH to USDC on Uniswap, and leaves the rest in the envelope.

[Open Melt](https://melt-woad.vercel.app) · [API reference](docs/api.md) · [Connect an agent](docs/agents.md) · [Verification record](docs/verification.md)

Underneath there is one primitive: a purpose-bound onchain task vault with a budget, a deadline, and recovery that works without Melt. It is spent by two kinds of hands:

```text
Envelope    sender’s money → immutable purpose → recipient’s chosen assistant → qualifying purchase
Agent job   your money     → one instruction   → your own browser agent       → the task, live, with takeover
```

The gift is the headline surface; the agent job surface (Activity → “New agent job”) hands the same vault to a browser agent you watch work in real time. Neither is a store gift card, and neither hands an agent an unrestricted key.

## Run locally

Requires Node.js 24.13+, npm, [Foundry / Anvil](https://getfoundry.sh/introduction/installation/), and Chromium installed by Playwright.

```sh
npm ci
npx playwright install chromium
MELT_FORK=1 npm run dev
```

`MELT_FORK=1` forks Ethereum so Uniswap V3 settlement is real. The chain id stays 31337. The dev script probes a list of public RPCs and picks one that actually serves forked state (free providers rotate between working and demanding archive tokens). Set `FORK_RPC_URL` to pin your own endpoint.

Open [the local site](http://127.0.0.1:5173), choose **Open Melt**, then **Open local workspace**. Create an envelope — the demo path is “mobile data for your trip, up to $20”. Open **Discover**, search for an eSIM, and **Use this**. Melt swaps only the required ETH to USDC on Uniswap. Cash-out wording returns nothing.

Local development starts Anvil on 8545, the API on 8787, test dapps on 8788, and the web app on 5173. Its ETH and wallets are public development accounts with no monetary value.

## Connect your own agent

Create and fund an envelope in Melt, then create an API key at `/developers`. Use HTTP, download the dependency-free JavaScript client, or connect hosted MCP. There is no generic transfer tool.

```sh
curl --fail --show-error https://melt-woad.vercel.app/api/client.mjs -o melt-client.mjs
```

```js
import { Melt } from "./melt-client.mjs";

const melt = new Melt({ apiKey: process.env.MELT_API_KEY });
const { sent } = await melt.envelopes();
const found = await melt.findOptions(sent[0].id, "an eSIM for Japan");
const quote = await melt.proposePurchase(sent[0].id, {
  sku: found.options[0].sku,
});
await melt.redeem(sent[0].id, quote.quote.id);
```

MCP tools: `list_envelopes`, `get_envelope`, `find_options`, `propose_purchase`, `propose_item`, `redeem`, `get_redemption_status`. `propose_item` lets an assistant propose anything it found on the open web — Melt audits it against the gift's purpose, caps, and deny list before quoting. An external agent cannot create envelopes, raise the amount, or send unrestricted cash. [Runnable examples](examples/README.md) also show direct HTTP.

## What's implemented

- **Purpose-bound envelopes.** A sender locks ETH against a semantic promise. Policy (category, dollar cap, deny list, partial use, unused-to-sender) is hashed and cannot be rewritten after funding.
- **AI discovery over a real catalog.** A recipient asks in plain language — “an eSIM for Japan”, “fps games” — and a model ranks candidates from roughly 900 live gift-card brands (Cryptorefills public API) plus the built-in catalog. The model only orders candidates that already passed the deterministic policy gate; it cannot add items, change prices, or bypass caps. A stemmed keyword matcher answers when no model is configured.
- **Open proposals, not a walled catalog.** An assistant can propose anything it found on the open web (`propose_item`: title, merchant, price, URL). Melt audits the item against the gift’s purpose with the model, then enforces the deny list, caps, and remaining funds deterministically before quoting. The catalog is a convenience, not a boundary.
- **A gift you can hand over.** Every gift page prints as a physical certificate with a QR claim link, and can be shared by email or link. The recipient never needs a Melt account to receive it.
- **A note back.** The recipient can leave a thank-you on the gift page — no account needed. It lands on the sender's envelope and fires an `envelope.thanked` webhook.
- **A visible spine.** Every envelope exposes its full event timeline — created, funded, quoted, settled — so both sides can see exactly what the vault did and when.
- **Discover and redeem.** Matching catalog options only. Uniswap V3 converts the required ETH to USDC from the envelope vault (`exactInputSingle`, native value, no ERC-20 approval). Leftover funds stay until expiry, then return to the sender.
- **MCP as distribution.** ChatGPT, Claude, Codex or Grok redeem an existing gift. They cannot invent a transfer. Hosted MCP lives at `/api/mcp`; a stdio server ships in the SDK.
- **Developer platform.** `/developers` is a standalone portal with API keys, per-key usage metering, webhooks, quickstarts, and generated OpenAPI docs.
- **Privy identity.** Email or wallet login, embedded Ethereum wallets, passkeys, and a relayer for outer vault transactions. Implementation: [`apps/web/src/PrivyApp.tsx`](apps/web/src/PrivyApp.tsx).
- **Agent jobs on the same vault.** From Activity, fund a task wallet for your own browser agent — an instruction, a budget, a time limit. Watch the live browser, pause and take control, or let it finish; the vault enforces the budget onchain and returns the rest.
- Solidity task wallets with immutable owner, agent, cumulative native-token budget and expiry. ERC-20 and ERC-721 recovery, including late assets.
- SQLite persistence, idempotent creation, hashed revocable agent keys, HMAC-signed webhooks, and shareable public receipts.

### Uniswap integration (for reviewers)

Uniswap is the settlement rail for a qualifying purchase, not a product tab. Precise code pointers are in [`FEEDBACK.md`](FEEDBACK.md).

- **Envelope settlement (headline).** Redeeming a quote swaps only `priceEth` from the vault to USDC on Uniswap V3. Engine: [`apps/api/src/swap.ts`](apps/api/src/swap.ts) — `quoteSwap` (QuoterV2 `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`), `buildSwapCall` (SwapRouter02 `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` `exactInputSingle`). Execution: [`apps/api/src/envelopes.ts`](apps/api/src/envelopes.ts) `executeSettlement` via the vault’s `execute`. The vault already forbids `approve`/`transfer`; a native-value router call needs neither.
- **Owner funding conversion (Uniswap Trading API).** Optional owner-only conversion before funding. The recipient’s assistant never receives that wallet. Adapter: [`apps/api/src/uniswap.ts`](apps/api/src/uniswap.ts). UI: [`apps/web/src/FundingSwap.tsx`](apps/web/src/FundingSwap.tsx).

Implementation is not the same as live verification. [The verification record](docs/verification.md) distinguishes local transaction evidence, mocked provider tests and outstanding public-network checks.

## Use a public testnet

Follow [setup](docs/setup.md) and configure the hosted services with `.env.example`. A public-network run needs the selected chain's RPC, Privy configuration, a funded relayer, and owner test ETH.

Testnet ETH has no monetary value. Mainnet gas, hosted models and infrastructure can incur costs. Neither a deployed frontend nor successful RPC connectivity establishes that the full public-network transaction flow has passed.

## Repository

| Location          | Responsibility                                                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| `apps/web`        | Product page, envelope composer, Discover, Activity, and `/developers` platform |
| `apps/api`        | HTTP API, catalog, envelope settlement, persistence and chain execution         |
| `packages/shared` | Shared validation, envelope policy and domain types                             |
| `packages/sdk`    | Standalone JavaScript client, types and stdio MCP server                        |
| `examples`        | HTTP and downloaded-client examples                                             |
| `contracts`       | TaskVault, collectible test contract and Solidity tests                         |
| `docs`            | Setup, architecture, security, API reference and submission evidence            |

## Verify

With `npm run dev` running in a separate terminal:

```sh
npm run check
```

This builds the app and runs contract, adapter, SDK, browser/API/MCP and worker-restart checks. Browser tests use real Chromium and local Ethereum receipts. They do not call a live model or prove third-party merchant delivery. API rate limits apply to tests too; leave a minute between repeated full browser suites.

## Read next

- [Architecture](docs/architecture.md) and [security boundaries](docs/security.md)
- [API reference](docs/api.md), [agent integration](docs/agents.md) and [OpenAPI](docs/openapi.json)
- [Submission plan](docs/hackathon.md), [check-in draft](docs/check-in.md) and [Uniswap feedback](FEEDBACK.md)

The supported execution surface is native-value contract calls. Optional locks can pin a session to one contract function. ERC-1155, cross-chain actions and private-network browsing are outside it. This hackathon implementation has not undergone an independent security audit.
