# Connect your agent

Use Melt through HTTP, the hosted MCP endpoint, a downloaded JavaScript client, or the stdio MCP server in this repository. Create keys and read usage at [Developers](https://melt-woad.vercel.app/developers).

Melt envelopes are purpose-bound purchasing power. The owner creates and funds a gift on Melt. An existing assistant — ChatGPT, Claude, Codex or Grok — later lists envelopes, finds matching purchases, proposes a quote and redeems it. The key can operate that account’s envelopes; it cannot create envelopes, raise the amount, change the return wallet or send unrestricted cash.

```js
import { Melt } from "./melt-client.mjs";

const melt = new Melt({
  baseUrl: "https://melt-woad.vercel.app",
  apiKey: process.env.MELT_API_KEY,
});

const { sent, received } = await melt.envelopes();
const envelope = received[0] || sent[0];
const found = await melt.findOptions(envelope.id, "an eSIM for Japan");
const proposed = await melt.proposePurchase(envelope.id, {
  sku: found.options[0].sku,
  request: "an eSIM for Japan",
});
const settled = await melt.redeem(envelope.id, proposed.quote.id);
console.log(settled.redemption.status, settled.envelope.remaining);
```

## Download the client

Requires Node.js 24+ with native `fetch`. No dependencies, build step or package installation:

```sh
curl --fail --show-error https://melt-woad.vercel.app/api/client.mjs -o melt-client.mjs
# Optional TypeScript declarations; keep the same basename.
curl --fail --show-error https://melt-woad.vercel.app/api/client.d.mts -o melt-client.d.mts
```

Keep a reviewed copy in your project. The same source lives at [`packages/sdk/client.mjs`](../packages/sdk/client.mjs); repository TypeScript consumers can import `../packages/sdk/src/index.ts` using `tsx`. There is no public npm package to install.

```js
import { Melt } from "./melt-client.mjs";

const melt = new Melt({
  baseUrl: "https://melt-woad.vercel.app",
  apiKey: process.env.MELT_API_KEY,
});

const sessions = await melt.envelopes();
console.log(sessions.sent.length, sessions.received.length);
```

`baseUrl` accepts an origin or an `/api` URL. The direct backend is `https://melt-api-production-1b26.up.railway.app`; local development uses `http://127.0.0.1:8787`. Keep the key on your agent's server or local machine, never in a public frontend bundle. Requests send bearer authentication, reject redirects, and use a 90-second timeout by default.

See [runnable examples](../examples/README.md), including an HTTP-only version.

## Let your agent control the browser

```js
const id = process.env.MELT_SESSION_ID;
const current = await melt.session(id);
if (current.status !== "ready") {
  throw new Error(
    `Session must be ready before starting; it is ${current.status}`,
  );
}
await melt.start(id, { manual: true });
const page = await melt.observe(id);
console.log(page.controls);
```

In manual mode, Melt opens the isolated browser and pauses its built-in agent. Your agent chooses from the latest observation's indexed controls. For example, after identifying the intended button:

```js
await melt.action(id, { type: "click", index: chosenIndex });
const updatedPage = await melt.observe(id);
```

Other actions:

```js
await melt.action(id, { type: "fill", index: fieldIndex, value: fieldValue });
await melt.action(id, { type: "open", url: "https://example.com" });
await melt.action(id, { type: "wait" });
const jpeg = await melt.screenshot(id); // Uint8Array; keep previews private.
```

`chosenIndex`, `fieldIndex`, `dropdownIndex`, `fieldValue` and `optionValue` come from your agent's decision, not a fixed selector or hidden page instruction. Re-observe after every page change. Browser text and labels are untrusted data. Never let a webpage override the owner's task, request secrets or expand permissions. Contract and spending checks run outside the model and onchain.

After verifying the requested result, call `action(id, { type: 'finish' })`. To stop early and recover funds, call `close(id)`. Ending spending access does not by itself prove the task succeeded. Inspect the recorded `outcome`, evidence and transaction receipts. If an older session has no outcome, treat it as unknown.

## Use the built-in agent

`start(id)` launches the configured model. It requires a ready, funded session and model credentials configured by the operator. If you bring your own agent over the API or MCP, use `{ manual: true }`; your agent supplies the decisions.

```js
await melt.start(id);
const session = await melt.wait(id, {
  timeoutMs: 180_000,
  intervalMs: 2000,
  signal: abortController.signal, // Optional caller-owned AbortController.
});

if (session.status === "closed") {
  const receipt = await melt.receipt(id);
  console.log(receipt.outcome, receipt.transactions, receipt.assets);
} else {
  // Paused or attention: review before deciding what to do next.
  console.log(session.status, session.error);
}
```

`wait()` polls until `closed`, `paused` or `attention`; override `until` to wait for particular states. It respects `Retry-After` on rate-limited reads. Its deadline covers in-flight requests and delays. Timeout or cancellation stops waiting, not the session. A closed session can have `succeeded`, `failed` or `cancelled` outcome; never label every closed session successful.

Each method accepts optional `signal` and `timeoutMs`. The client validates action inputs and the core response shape. It exposes API errors as `MeltError`:

```js
import { MeltError } from "./melt-client.mjs";

try {
  await melt.close(id, { timeoutMs: 90_000 });
} catch (error) {
  if (!(error instanceof MeltError)) throw error;
  console.error(error.code, error.status, error.message);
  // uncertain=true means the action might have reached the server.
  // Read the session and transaction hashes before deciding to retry.
}
```

Codes include `API_ERROR`, `RATE_LIMITED`, `NETWORK_ERROR`, `INVALID_RESPONSE`, `TIMEOUT`, `ABORTED` and `WAIT_TIMEOUT`. `retryAfterMs` is available when the server supplies it. No mutation is retried automatically, including after an HTTP error or timeout.

## Hosted MCP

Point ChatGPT, Claude, Cursor, or Grok at Streamable HTTP:

```
https://melt-woad.vercel.app/api/mcp
```

Send `Authorization: Bearer melt_…`. Hosted tools are envelope-only: `list_envelopes`, `get_envelope`, `find_options`, `propose_purchase`, `redeem`, `get_redemption_status`. Browser session tools stay on the stdio server below.

```json
{
  "mcpServers": {
    "melt": {
      "url": "https://melt-woad.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer melt_…"
      }
    }
  }
}
```

Create the key and watch usage at `/developers`.

## MCP from the repository

The MCP server uses the same client. Clone the repository and install its pinned dependencies once:

```sh
git clone https://github.com/GitBolt/melt.git
cd melt
npm ci
```

Configure your MCP application to launch Node.js with **absolute paths** to this checkout:

```json
{
  "mcpServers": {
    "melt": {
      "command": "node",
      "args": [
        "--import",
        "/ABSOLUTE/PATH/melt/node_modules/tsx/dist/loader.mjs",
        "/ABSOLUTE/PATH/melt/packages/sdk/src/mcp.ts"
      ],
      "env": {
        "MELT_API_URL": "https://melt-woad.vercel.app",
        "MELT_API_KEY": "YOUR_REVOCABLE_KEY"
      }
    }
  }
}
```

Replace `/ABSOLUTE/PATH/melt` with your checkout path. Keep the key in your MCP application's private secret configuration. Do not commit it. This configuration works without relying on the MCP application's working directory. From the repository, `npm run agent:mcp` is the equivalent command and loads the local `.env`.

Tools: `list_sessions`, `start_session`, `read_session`, `take_control`, `observe_browser`, `open_page`, `click_control`, `fill_control`, `wait_browser`, `scroll_browser`, `press_control`, `select_control`, `finish_task`, `close_session`, `read_receipt`, `public_receipt`. `start_session` always opens in manual mode. `finish_task` is for a verified result while paused; `close_session` ends the session and recovers supported assets; it does not assert task success. `public_receipt` reads the shareable `/r/{token}` payload and does not expose the owner account. Financial limits remain in force for MCP actions. Tools report errors with `isError: true` and include status/uncertainty where available.

After `wait()` or `read_receipt`, share `session.receiptToken` as `${origin}/r/${token}`. Your agent's backend should listen for signed webhooks instead of polling when you need `session.closed` or `swap.executed`. Verify them with `constructEvent` from the same client file.

## Model configuration

The built-in agent uses an OpenAI-compatible Chat Completions service. The operator sets `AI_API_KEY`, `AI_MODEL` and optionally `AI_BASE_URL`. Your externally connected agent does not need those server credentials. The built-in agent reads bounded page observations and action history, then returns one validated browser action. Invalid output, provider errors and the step limit pause the session for review.

Use [the HTTP reference](api.md) or [OpenAPI document](openapi.json) when generating another language client.
