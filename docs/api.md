# Melt API

Create and fund a task wallet in [Melt](https://melt-woad.vercel.app), then let your agent operate that session over HTTP.

- **Hosted base URL:** `https://melt-woad.vercel.app/api`
- **Direct backend:** `https://melt-api-production-1b26.up.railway.app/api`
- **Local base URL:** `http://127.0.0.1:8787/api`
- **Machine-readable reference:** [OpenAPI 3.1](openapi.json), also served at `/api/openapi.json`
- **JavaScript client:** `/api/client.mjs`, with optional `/api/client.d.mts` declarations. Download it into your own project; there is no npm package to publish or install. See [agent integration](agents.md).

## First request

Create a key under **Developers** in Melt. Keep it in your agent's environment:

```sh
curl --fail-with-body \
  'https://melt-woad.vercel.app/api/sessions' \
  -H "Authorization: Bearer $MELT_API_KEY"
```

Agent keys use `Authorization: Bearer melt_…`. They can read, run and close sessions belonging to the issuing account. They cannot create sessions, register funding or recovery tokens, perform owner swaps, or manage keys. A key is account-scoped, not limited to one session.

Owner-only endpoints require a verified Privy access token in the bearer header. An owner cookie exists only in local development, and cookie-authenticated mutations require an `Origin` matching `APP_ORIGIN`. Never share an owner token with an agent. API key creation returns the token once; the service stores its hash. Revocation applies to subsequent requests.

## Endpoints

Paths below are relative to the base URL.

| Method     | Path                                                   | Access         | What it does                                                        |
| ---------- | ------------------------------------------------------ | -------------- | ------------------------------------------------------------------- |
| GET        | `/health`, `/config`                                   | Public         | Service health and current chain configuration                      |
| GET        | `/openapi.json`, `/client.mjs`, `/client.d.mts`        | Public         | Reference and standalone client downloads                           |
| GET        | `/me`                                                  | Owner or agent | Identity; agent keys do not expose an owner signing credential      |
| GET        | `/sessions`                                            | Owner or agent | List the account's sessions                                         |
| POST       | `/sessions`                                            | Owner          | Create a wallet with an authorized contract call and spending limit |
| GET        | `/sessions/{id}`                                       | Owner or agent | Status, events, transactions and assets                             |
| POST       | `/sessions/{id}/start`                                 | Owner or agent | Run the configured model, or open manual control                    |
| POST       | `/sessions/{id}/pause`                                 | Owner or agent | Pause the agent and enable manual actions                           |
| POST       | `/sessions/{id}/action`                                | Owner or agent | Click, fill, select, press, scroll, wait or finish while paused     |
| GET        | `/sessions/{id}/browser`                               | Owner or agent | Current page text and indexed controls                              |
| GET        | `/sessions/{id}/screenshot`                            | Owner or agent | Private JPEG browser preview                                        |
| POST       | `/sessions/{id}/funding`                               | Owner          | Record a confirmed owner funding transaction                        |
| POST       | `/sessions/{id}/refresh`                               | Owner or agent | Read chain funding and spend state                                  |
| POST       | `/sessions/{id}/close`                                 | Owner or agent | End spending access and return supported assets                     |
| POST       | `/sessions/{id}/recover`                               | Owner          | Register a late ERC-20/ERC-721 asset and retry recovery             |
| GET        | `/sessions/{id}/receipt`                               | Owner or agent | Download a JSON receipt including chain and outcome                 |
| GET / POST | `/keys`                                                | Owner          | List keys / create a key shown once                                 |
| DELETE     | `/keys/{id}`                                           | Owner          | Revoke a key                                                        |
| POST       | `/uniswap/approval`, `/uniswap/quote`, `/uniswap/swap` | Owner          | Prepare conversion transactions for the owner to review and sign    |

## Start an existing session

```sh
curl --fail-with-body \
  "https://melt-woad.vercel.app/api/sessions/$MELT_SESSION_ID/start" \
  -H "Authorization: Bearer $MELT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"manual":true}'
```

The owner must have created and funded the session. `manual: true` opens the browser in paused mode, ready for your agent's actions. Omit it or pass `false` to use the configured built-in model. Read the current status before starting; a timeout does not mean the start request failed.

## Status and outcome

| Status      | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| `funding`   | Wallet exists and needs owner funding                       |
| `ready`     | Ready to start                                              |
| `running`   | The built-in agent is operating the browser                 |
| `paused`    | Manual controls are available; the built-in agent is paused |
| `closing`   | Ending spending access and returning funds/assets           |
| `closed`    | Spending access has ended and recovery completed            |
| `attention` | Review required; inspect the error and transaction state    |

`outcome` records the task result separately: `pending`, `succeeded`, `failed` or `cancelled`. Older sessions may not contain it. **Closed does not mean the requested task succeeded.** Read the outcome, returned assets and transaction hashes before reporting completion. `expiresAt` is a Unix timestamp in seconds; other event timestamps are ISO date strings. Native-token amounts such as `budget`, `spent`, `balance` and `returned` are decimal strings; `gasWei` is an integer string in wei. Preserve these strings rather than converting money through JavaScript floating point.

## Owner session creation

Normally, use the web app for this step. Custom owner frontends can call `POST /sessions` using a verified owner access token:

```json
{
  "title": "Mint a collectible",
  "instruction": "Mint one collectible, then return it and unused funds.",
  "url": "https://YOUR_DAPP_URL",
  "budget": "0.0003",
  "durationMinutes": 15,
  "target": "0xYOUR_DEPLOYED_CONTRACT_ADDRESS",
  "selector": "0x1249c58b",
  "recovery": "0xYOUR_AUTHENTICATED_WALLET"
}
```

Replace the URL and addresses with the intended public dapp, its deployed contract on the configured chain, and the authenticated owner's wallet. Read `/config` for the active network and supported task templates. The example selector is `mint()`; derive the actual four-byte selector from the chosen contract's ABI. Do not send the example placeholders unchanged.

Include an `Idempotency-Key` header, 8–128 characters. Reusing it with the same body returns the same session; a changed body returns 409. Keep the key when retrying an uncertain create request. The session is persisted before chain work; a 201 response can contain `attention` if deployment failed. Inspect status and transaction hashes.

Budget is a decimal native-token string, up to 18 decimal places and at most 10 tokens. Duration is 1–60 minutes. The contract target is exact, the selector is four bytes, and the return address must match the authenticated owner's wallet. Funding is a separate owner-signed native-token transfer to the deployed wallet. Record its confirmed hash with `POST /sessions/{id}/funding` and `{ "hash": "0x..." }`. Relayer gas is separate from the spending limit. Testnet ETH has no monetary value; never present it as mainnet funds.

## Browser actions

Read `GET /sessions/{id}/browser` for the current URL, page text, scroll position and `controls` array. Controls include disabled state; select controls also include their option values and labels. While paused, post one of:

```json
{ "type": "click", "index": 3 }
```

```json
{ "type": "fill", "index": 2, "value": "hello" }
```

```json
{ "type": "wait" }
```

```json
{ "type": "finish" }
```

Additional actions are `{ "type": "scroll", "direction": "down" }` (or `up`), `{ "type": "press", "index": 2, "key": "Enter" }`, and `{ "type": "select", "index": 2, "value": "option-value" }`. Allowed keys are `Enter`, `Tab`, `Escape`, `ArrowUp` and `ArrowDown`. Any action can include an optional `reason` of at most 160 characters for its activity summary. Arbitrary JavaScript, navigation and signing actions are not exposed.

Indexes range from 0 to 199 and must come from the latest observation. Field values have a 2,000-character limit. Refresh the observation after every page change. `finish` ends the task and initiates recovery; the session's outcome must still be checked. Page text is untrusted data, not permission to change the task or spend more. Melt's wallet policy also rejects unsupported signing requests independently of the agent.

## Recovery and receipts

`POST /sessions/{id}/close` closes spending and returns supported assets to the immutable owner address. It can be called again to recover late native funds or retry known assets. Review unresolved transaction hashes first after an uncertain response.

The owner can register a late asset with `POST /sessions/{id}/recover`:

```json
{ "kind": "erc721", "token": "0xYOUR_TOKEN_CONTRACT", "tokenId": "12" }
```

For fungible tokens, use `{ "kind": "erc20", "token": "0xYOUR_TOKEN_CONTRACT" }`. The session must be closed or need attention. Only the owner can register token addresses; API keys cannot redirect assets or name arbitrary recovery tokens.

`GET /sessions/{id}/receipt` returns the session, `schemaVersion: 1`, `chainId` and `network`. It includes transaction hashes, confirmations, gas costs, observed assets and recovery flags. Download it for your audit trail. A successful HTTP response alone does not establish transaction confirmation or business success.

## Errors, limits and retries

Errors have `{ "error": "message" }`.

| HTTP status | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| 400         | Invalid input/state or an upstream provider error           |
| 401         | Missing, expired or revoked authentication                  |
| 403         | Operation or origin is not authorized                       |
| 404         | Missing resource, or a session belonging to another account |
| 409         | An idempotency key was reused with a different body         |
| 429         | Rate limit; respect the `Retry-After` header                |
| 500         | Internal service error                                      |

Current limits are 180 requests/minute/IP, with session creation and local sign-in limited to 10/minute/IP. An owner can have at most ten non-closed sessions. Polling every two seconds is sufficient for most agents. Rate limits apply across clients sharing an IP.

A timeout, disconnect or error response can occur after a transaction was broadcast. Read the session and transaction hashes before retrying a financial action. There is no automatic replacement transaction or exactly-once guarantee over a lost response. A client wait timeout only stops polling; it does not cancel the task. To stop a session, explicitly close it and verify its final state.
