# Connect your agent

Use Melt through HTTP, a downloaded JavaScript client, or the MCP server in this repository. Nothing needs to be published to npm.

First, the owner signs in at [Melt](https://melt-woad.vercel.app), creates a session, authorizes its contract call and spending limit, and adds funds. Create a key under **Developers** and give the agent that key and the session ID. The key can operate that account's existing sessions; it cannot create wallets, raise budgets, fund them, change the return address or create other keys. It is account-scoped, not restricted to a single session. Revoke it when it is no longer needed.

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

const sessions = await melt.sessions();
const session = await melt.session(process.env.MELT_SESSION_ID);
console.log(session.status, session.balance);
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

Tools: `list_sessions`, `start_session`, `read_session`, `take_control`, `observe_browser`, `click_control`, `fill_control`, `wait_browser`, `scroll_browser`, `press_control`, `select_control`, `finish_task`, `close_session`, `read_receipt`. `start_session` always opens in manual mode. `finish_task` is for a verified result while paused; `close_session` ends the session and recovers supported assets; it does not assert task success. Financial limits remain in force for MCP actions. Tools report errors with `isError: true` and include status/uncertainty where available.

## Model configuration

The built-in agent uses an OpenAI-compatible Chat Completions service. The operator sets `AI_API_KEY`, `AI_MODEL` and optionally `AI_BASE_URL`. Your externally connected agent does not need those server credentials. The built-in agent reads bounded page observations and action history, then returns one validated browser action. Invalid output, provider errors and the step limit pause the session for review.

Use [the HTTP reference](api.md) or [OpenAPI document](openapi.json) when generating another language client.
