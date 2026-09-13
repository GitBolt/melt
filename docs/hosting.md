# Railway API and Vercel website

The root `vercel.json` builds the Vite website from this monorepo and proxies `/api` and `/demo` to the Railway service. Browser requests stay on the website origin. The root `Dockerfile` runs the API, browser worker, and SQLite storage on Railway; it does not run Anvil or enable local test accounts.

## Railway

- Project: `melt` (`3d198d27-81d2-4aa1-907d-23762e1fb9cc`)
- Production environment: `5e0cc123-baa8-43e2-bea5-fb61c7a1215a`
- API service: `951cb605-0705-4629-8310-39e921d34b57`
- API origin: `https://melt-api-production-1b26.up.railway.app`
- One replica, persistent volume at `/data`, health check `/api/health`.

Set `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `RPC_URL`, `CHAIN_ID`, `CHAIN_NAME`, `EXPLORER_URL`, and `APP_ORIGIN`. The app refuses to start with missing configured-wallet credentials. `APP_ORIGIN` must be the production Vercel origin. Keep model and Uniswap keys server-side. Fund the relayer with testnet ETH after initialization. See [setup](setup.md) for the full wallet flow.

The container fixes the mounted directory ownership, then runs the API and Chromium as the unprivileged `node` user. Chromium sandboxing remains enabled. Verify a real browser launch on the host before opening task creation; do not disable the sandbox to work around host restrictions.

## Vercel

- Project: `melt` (`prj_kbrsAP8zSofyB6scv0Yp9blxG7nB`), scope `gitbolts-projects`.
- Production website: `https://trymeltapp.vercel.app`.
- Run deployments from the repository root; build output is `dist`.
- Set `VITE_RPC_URL` to a public or domain-restricted RPC endpoint for the same chain as the API. This value is public and compiled into the website.
- Add the assigned production domain to Privy's allowed origins and set Railway `APP_ORIGIN` to it. Preview domains need their own deliberately configured authentication access.
- API and fixture rewrites must match the Railway origin when recreating infrastructure.

The website depends on a healthy configured API. A successful static build alone does not establish working sign-in, signing, or browser sessions.

## Verification

Verify Railway reports a successful deployment and `/api/health` responds with the intended chain ID. Verify the same endpoint through the Vercel origin, then run a signed-in testnet task through funding, browser execution, closure, and asset return. Restart the API and verify receipts persist. Credentials, session data, and local test outputs are excluded from Git and deployment uploads.

References: [Vercel external rewrites](https://vercel.com/kb/guide/vercel-reverse-proxy-rewrites-external), [Playwright containers](https://playwright.dev/docs/docker).
