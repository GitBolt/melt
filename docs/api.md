# API reference

Base URL: `http://127.0.0.1:8787/api` locally, or `/api` on the hosted application. Machine-readable definition: [OpenAPI 3.1](openapi.json), served at `/api/openapi.json`.

Use `Authorization: Bearer melt_…` for an agent key, or a verified Privy access token for the signed-in owner. Local browser sessions use an HttpOnly cookie. Owner cookie mutations require an `Origin` matching `APP_ORIGIN`. Agent bearer keys are scoped by account and have narrower operations than owner authentication.

| Method              | Path                                                   | Meaning                                                          |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| GET                 | `/health`, `/config`                                   | Public operational/network configuration                         |
| GET                 | `/me`                                                  | Authenticated identity and recovery wallet                       |
| POST                | `/auth/local`, `/auth/logout`                          | Local-only sign-in; sign out                                     |
| GET / POST          | `/sessions`                                            | List own sessions; owner-authorized creation                     |
| GET                 | `/sessions/{id}`                                       | Current state, events, transactions, assets                      |
| POST                | `/sessions/{id}/start`                                 | Begin built-in driver, or `{ "manual": true }`                   |
| POST                | `/sessions/{id}/pause`                                 | Pause driver and enable manual actions                           |
| POST                | `/sessions/{id}/action`                                | Click/fill/wait/finish while paused                              |
| GET                 | `/sessions/{id}/browser`                               | Visible page text and indexed controls                           |
| GET                 | `/sessions/{id}/screenshot`                            | Authenticated JPEG preview                                       |
| POST                | `/sessions/{id}/refresh`                               | Read actual chain funding/spend state                            |
| POST                | `/sessions/{id}/close`                                 | Stop access and recover supported assets                         |
| POST                | `/sessions/{id}/recover`                               | Owner registers a late ERC-20/ERC-721 asset and retries recovery |
| GET                 | `/sessions/{id}/receipt`                               | JSON receipt with network and schema version                     |
| GET / POST / DELETE | `/keys`, `/keys/{id}`                                  | Owner lists, creates, revokes hashed agent keys                  |
| POST                | `/uniswap/approval`, `/uniswap/quote`, `/uniswap/swap` | Owner-only unsigned conversion preparation                       |

## Create a session

```json
{
  "title": "Mint a field note",
  "instruction": "Mint one collectible, then return it and unused funds.",
  "url": "https://your-domain/demo/studio",
  "budget": "0.0003",
  "durationMinutes": 15,
  "target": "0xYOUR_DEPLOYED_FIXTURE_ADDRESS",
  "selector": "0x1249c58b",
  "recovery": "0xYOUR_AUTHENTICATED_WALLET"
}
```

Address placeholders above must be replaced with actual 20-byte Ethereum addresses. Include an `Idempotency-Key` header, 8–128 characters. Reusing it with the same body returns the same session; a changed body returns 409. Keep the key when retrying an uncertain create request. Creation persists the task before chain work; a 201 response can contain `status: attention` if deployment failed. Always inspect state and transaction hashes.

Budget is a decimal native-token string, maximum 18 decimals and 10 tokens. The selector is four bytes; recovery must match the authenticated wallet. Funding in configured mode is a separate owner-signed transfer. The deployment/execution relayer pays gas separately.

## Browser actions and recovery

```json
{ "type": "click", "index": 3 }
```

For a field: `{ "type": "fill", "index": 2, "value": "hello" }`. Refresh the observation after each page change. Actions require paused status. The `finish` action closes and recovers; it does not assert a business outcome.

Late recovery body: `{ "kind": "erc721", "token": "0x...", "tokenId": "12" }` or `{ "kind": "erc20", "token": "0x..." }`. Only the owner can register a token; recovery always uses the immutable owner address. Calling close again checks for late native funds and retries known assets.

## Errors and retries

Errors have `{ "error": "message" }`. 400 indicates invalid input/state or a provider failure; 401 unauthenticated/revoked; 403 unauthorized operation/origin; 404 unknown or someone else's session; 409 changed idempotency input; 429 rate limiting. Respect `Retry-After`. Global limit: 180 requests/minute/IP; local sign-in and creation: 10/minute/IP. An owner can have at most ten non-closed sessions.

An HTTP timeout can occur after a transaction was broadcast. Inspect session transactions before retrying any financial request. Close waits for unresolved transactions and surfaces `attention` if recovery cannot complete. There is no automatic replacement transaction or exactly-once guarantee over a lost external response.
