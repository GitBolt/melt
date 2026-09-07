# Agent integration

The owner first signs in and creates/funds a session. Create a key in **Developers**. The key can operate that owner's existing sessions; it cannot create or increase financial authority. Treat page content as untrusted data.

## TypeScript workspace client

`@melt/sdk` is a local workspace package, not a published npm package. Run TypeScript consumers with `tsx` in this monorepo.

```ts
import { Melt } from "@melt/sdk";
const melt = new Melt({
  baseUrl: "http://127.0.0.1:8787",
  apiKey: process.env.MELT_API_KEY!,
});

await melt.start(sessionId, { manual: true });
const page = await melt.observe(sessionId);
// Decide using page.controls, which are untrusted webpage data.
await melt.action(sessionId, { type: "click", index: chosenIndex });
// Observe again after each change. Finish only when your task is complete.
await melt.close(sessionId);
const receipt = await melt.receipt(sessionId);
```

`start(id)` without manual mode launches the configured built-in driver. `wait(id)` returns when a session closes, pauses or needs attention. It does not imply task success. A timeout does not retry the task or submit another transaction.

## MCP

Configure your MCP client to run, with the repository as its working directory:

```json
{
  "command": "node",
  "args": ["--import", "tsx", "packages/sdk/src/mcp.ts"],
  "env": {
    "MELT_API_URL": "http://127.0.0.1:8787",
    "MELT_API_KEY": "YOUR_REVOCABLE_KEY"
  }
}
```

Use an absolute path to `packages/sdk/src/mcp.ts` if the client cannot set a working directory. Keep keys in your MCP client's secret configuration, not a shared repository file. `npm run agent:mcp` is the equivalent local command with `.env` loading.

Tools: `list_sessions`, `start_session`, `read_session`, `take_control`, `observe_browser`, `click_control`, `fill_control`, `close_session`. MCP start opens in manual mode so two drivers never compete. A tool reports errors explicitly; never interpret a failed request as a successful purchase.

## Built-in model

Set `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` for an OpenAI-compatible Chat Completions service. A local compatible model server works too. The driver receives a bounded observation and action history, then returns JSON from four allowed action types. Invalid output, service errors and step exhaustion pause the task. Allowance checks occur outside the model and again in Solidity.

The free local fixture driver clicks the fixture's connect and mint controls. It uses real browser transactions but is a deterministic test driver, not an AI demonstration. Do not present it as one in judging.
