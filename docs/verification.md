# Verification record

Local validation completed September 7, 2026 (some logs use September 8 UTC). Runtime: macOS, Node 25.8.1, Playwright 1.63.0, Solidity 0.8.30 and Anvil chain 31337.

## Passing checks

| Check                              | Evidence and scope                                                                                                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript + Vite production build | Current monorepo compiles. A separate build with public RPC configuration also compiles the lazy Privy bundle.                                                                                                                                                             |
| Solidity                           | 20 tests passed: 12 TaskVault tests plus 8 preserved capacity-contract tests. Two fuzz tests use 256 runs each. New coverage includes cumulative cap, expiry, unauthorized calls, closure, NFT/native/ERC-20 recovery, late deposits, and failed token transfer isolation. |
| Policy/model/Uniswap adapters      | 10 tests passed. Exact integer budget checks, forbidden targets/functions/chain, inactive state, model-output rejection, exact permit bounds, quote expiry/ownership and single use. Model/Uniswap HTTP responses are mocked in these tests.                               |
| Browser/API/MCP                    | 7 end-to-end tests passed. Real Chromium and local Ethereum transactions, account isolation, idempotency, API-key restrictions/revocation, private-URL/origin rejection, manual MCP control, late NFT/native recovery, developer key UI and OpenAPI availability.          |
| Restart recovery                   | A separate worker is stopped after a confirmed browser mint. Restart retains the account and receipts, enters attention, then returns NFT plus the correct remainder.                                                                                                      |
| Visual review                      | Desktop home, session ready/completed, developer view and 390px mobile session/developer layouts inspected. No horizontal document overflow in checked mobile views. Reduced-motion rendering exercised.                                                                   |

The deterministic mint costs `0.0001` test ETH from a `0.0003` allowance and returns `0.0002` plus its NFT. The hostile fixture's `1 ETH` attempt is blocked before an allowed mint. Late recovery returns an additional `0.00005` and a second NFT; retrying closure does not create extra transfers. The owner-funding registration checks an actual confirmed transaction's sender, target and value.

Screenshots in `docs/screenshots/`: `platform-home.png`, `platform-developers.png`, `platform-developers-mobile.png`, `session-ready.png`, `session-complete.png`, `session-mobile.png`. Earlier screenshots belong to the archived capacity UI.

Reproduce with `npm run dev` in one terminal and `npm run check` in another. Logs from this run are under ignored `data/`: `platform-check.log`, `platform-e2e-final.log`, `platform-restart.log`, `platform-configured-build.log`. API rate limits are real; allow a minute between repeated full browser suites.

## Not established by these tests

- Real Privy email, embedded-wallet, passkey and relayer flows need the user's account configuration and keys.
- No actual model service was called. The autonomous adapter is implemented and response handling tested, while the no-key browser fixture uses a labelled scripted driver.
- Uniswap requests/permit handling are adapter-tested; no live quote, swap or public-network receipt has been claimed.
- The two demo websites share our fixture contract and implementation. This is not evidence of compatibility with arbitrary third-party dapps.
- No public deployment, Linux host/sandbox validation, load test, independent security audit, user-demand validation or prize qualification is claimed.
- A crash in the gap between external provider acceptance and hash persistence can require manual relayer reconciliation. This is documented, not described as exactly-once delivery.

The dependency audit currently reports zero high/critical and 23 moderate transitive findings. See `security.md`; remaining optional connector dependencies were not forced across incompatible major versions.
