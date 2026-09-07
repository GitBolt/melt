# Setup and service keys

## Local

Run the commands in the README. No `.env` is necessary. Preserve `data/anvil-state.json` together with `data/task-wallet/` if keeping old local sessions. If you intentionally reset the local chain, reset its session database too; an old database cannot recreate contracts on a new chain.

## Configured wallet mode

1. Create a [Privy app](https://docs.privy.io/basics/react/setup). Enable email and Ethereum wallet login. Add the actual local/hosted origin to allowed origins. Enable embedded wallet creation and configure passkey support for the intended domain.
2. Copy `.env.example` to `.env`. Set `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `RPC_URL`, `CHAIN_ID`, `CHAIN_NAME`, `APP_ORIGIN`, `EXPLORER_URL`, and `VITE_RPC_URL`. Use Sepolia (`11155111`) initially. `VITE_RPC_URL` is public website configuration; keep privileged RPC credentials in `RPC_URL` only.
3. Start the API. It creates a Privy relayer if `PRIVY_RELAYER_WALLET_ID` is absent, saves its ID in SQLite, and exposes its public address in `/api/config`. Fund that address with a small amount of testnet ETH for deployment, execution and recovery gas. Keep the database backed up. Supplying an existing wallet ID uses that wallet instead.
4. Set `AI_MODEL`, `AI_API_KEY` and optionally `AI_BASE_URL` for a compatible Chat Completions endpoint. Without them, custom dapps open for manual control. The canned local driver is explicitly labelled and is not an LLM.
5. Set `UNISWAP_API_KEY` for the optional token conversion. Use a supported network and a token pair with actual liquidity. A supported chain does not guarantee a testnet quote.
6. Rebuild after changing `VITE_RPC_URL`. Sign in by email, wait for wallet creation, and fund that owner wallet from a faucet. Owner funding and swaps are reviewed in the owner wallet; gas for agent execution is separate.

A Privy policy can additionally restrict a newly created relayer via `PRIVY_POLICY_ID`. The Solidity allowance is always enforced independently. Updating this environment value does not retrofit policies onto an existing relayer; configure those in Privy directly. The server currently operates an app-controlled relayer, not a user-delegated Privy session signer.

## Public testnet fixture

The optional demo collectible can be deployed by the operator:

```sh
npm run chain:deploy -- --confirm-testnet
```

The script only accepts Sepolia or Base Sepolia. It uses configured Privy signing and consumes testnet gas. Set the printed `FIXTURE_CONTRACT`, `ENABLE_TEST_FIXTURES=true`, and `FIXTURE_ORIGIN=https://your-domain/demo`, then restart. The API serves `/demo/studio`, `/demo/print-shop` and `/demo/guardrail-check`. These are self-hosted fixtures sharing one collectible contract, not independent third-party integrations. Never point this demonstration at a mainnet currency.

For a real dapp, choose **Use another website**, enter its HTTPS URL and exact permitted contract/function. The browser's main navigation stays on that origin. Put additional public resource hostnames in `BROWSER_RESOURCE_HOSTS` if the site needs CDNs. Login redirects, private networks, arbitrary popups, downloads and WebSockets are blocked. Check compatibility first; many dapps require unsupported signatures or approvals.

## Hosting handoff

Build with `npm run build`, then start with `NODE_ENV=production npm start`. The API serves `dist/` as well as `/api`. Use one API/worker process and one persistent SQLite volume. The in-memory queues coordinate this single process; horizontal scaling requires a shared job queue and database work first.

The host needs Node, Chromium plus its OS dependencies (`npx playwright install --with-deps chromium` on a supported Linux host), and support for Chromium's sandbox. Run as an unprivileged user, behind TLS, with `APP_ORIGIN` equal to the public origin. Keep RPC endpoints, the database, secrets, and administrative ports private. Health checks use `/api/health`. Configure the platform to send SIGTERM during restarts and to retain the data directory.

Production mode refuses to start without an explicit configured RPC. Public deployment has not been performed or validated in this workspace. See the security document for browser-worker isolation and relayer limitations before opening registration broadly.

## Credential verification checklist

- Email login creates an embedded wallet; an external wallet also works.
- A passkey can be enrolled, the account signed out, and the same account recovered with it on the deployed domain.
- The authenticated recovery address matches the funding wallet and remains immutable in the vault.
- The Privy relayer creates, executes and closes a real testnet session; explorer receipts are saved.
- An actual model completes the chosen task from observations, with an independently enforced denied transaction case.
- Uniswap returns a live quote, the owner signs the exact permit, the swap confirms, and the owner then funds a task. Save both receipts and the network/token pair used.
- Restart with a funded session; verify reconciliation and recovery on that configured chain.

If a transaction is pending, inspect its hash before retrying. Do not create a replacement financial action merely because an HTTP call timed out. The UI retains a submitted funding hash to discourage duplicate deposits. Recovery is safe to retry after reconciliation.
