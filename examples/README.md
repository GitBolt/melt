# Use Melt without an npm package

Node.js 24+ is enough. Sign in at [Melt](https://melt-woad.vercel.app), create and fund a session, then create an API key under **Developers**. Keep that key in your local `.env` or secret store.

```dotenv
MELT_API_URL=https://melt-woad.vercel.app
MELT_API_KEY=YOUR_KEY
```

From this repository:

```sh
node --env-file=.env examples/http-session.mjs YOUR_SESSION_ID
node --env-file=.env examples/session.mjs YOUR_SESSION_ID
```

Both examples only read status and receipts. They do not send transactions. `session.mjs` uses the shared client; `http-session.mjs` makes the HTTP request directly.

Outside the repository, download the standalone client next to your script:

```sh
curl --fail --show-error https://melt-woad.vercel.app/api/client.mjs -o melt-client.mjs
```

Import it with `import { Melt } from './melt-client.mjs'`. Optional TypeScript declarations are available at `/api/client.d.mts`; save them as `melt-client.d.mts` alongside `melt-client.mjs`. Keep a reviewed copy in your own repository so a remote update does not silently change your agent.

See [agent integration](../docs/agents.md) for browser control, bounded polling and repository-local MCP configuration. See [API reference](../docs/api.md) for HTTP endpoints and authentication.
