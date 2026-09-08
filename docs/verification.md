# Verification record

Updated September 7, 2026 (September 8 UTC in some logs). Local runtime: macOS, Node 25.8.1, Playwright, Solidity 0.8.30 and Anvil chain 31337.

## What the checks establish

| Check                 | Evidence and scope                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript            | Current application and client declarations type-check.                                                                                                                                                                                                                                                                                                                                                              |
| Standalone client     | 10 native HTTP tests pass. They cover decimal preservation, action validation, structured errors, Retry-After, cancelled and bounded polling, uncertain mutation responses, redirect credential protection and JPEG downloads. No model or chain is involved in these client tests.                                                                                                                                  |
| MCP                   | A real stdio client handshake from outside the repository lists all 14 tools using the documented absolute-path configuration. Browser integration tests also exercise account-scoped keys and manual control.                                                                                                                                                                                                       |
| Browser/API           | Tests use a real Chromium browser and local Ethereum. The test chooses visible fixture controls; production contains no deterministic driver. Assertions cover confirmed mint, onchain NFT ownership after return, correct ETH remainder, outcome separate from closure, account isolation, idempotency, key revocation, origin/private-URL rejection, late recovery, developer key UI and client/OpenAPI downloads. |
| Restart recovery      | A separate worker is stopped after a confirmed browser mint. The test checks persisted authorization, transaction hashes, attention after restart, NFT/native recovery, the final outcome and the downloaded receipt.                                                                                                                                                                                                |
| Solidity and adapters | Run through `npm test`. Contract tests enforce cumulative limits, expiry, authorized calls, closure and recovery. Model/Uniswap adapter tests use controlled HTTP responses; they do not establish live provider success.                                                                                                                                                                                            |
| Mobile layout         | The browser suite exercises a 390px viewport, reduced motion and absence of horizontal document overflow. Screenshots are saved for review.                                                                                                                                                                                                                                                                          |

The fixture mint costs `0.0001` local test ETH from a `0.0003` limit and returns `0.0002` plus the NFT. The hostile fixture attempts `1 ETH`, which is rejected before the allowed mint. Late recovery checks another `0.00005` and a second NFT; repeating closure must not duplicate transfers. These are actual local-chain receipts, not public-testnet or mainnet transactions.

The model's success signal requires a confirmed permitted execution transaction. It does not establish that every semantic instruction was satisfied. Review the received asset and intended result as well. A closed session with no execution is cancelled; a model that finishes without transaction evidence is failed. Both can still have their funds returned.

## Reproduce

Run `npm run dev` in one terminal, then:

```sh
npm run check
```

Individual commands are `npm run build`, `npm test`, `npm run test:e2e` and `npm run test:restart`. `npm run test:sdk` runs the standalone client checks. API rate limits remain enabled, including in tests; leave a minute between repeated full browser suites. Browser traces and failure screenshots go into ignored `test-results/`.

## Public-network evidence still required

The hosted entry point is [Melt](https://melt-woad.vercel.app), with [public source](https://github.com/GitBolt/melt). Deployment URLs and working RPC access are not substitutes for transaction proof.

Before claiming an end-to-end public-testnet run, record:

1. Selected chain ID, funded relayer and deployed contract addresses.
2. Verified Privy sign-in on the actual app origin and a confirmed owner funding transaction.
3. The model identifier or external-agent configuration, with a confirmed permitted task transaction.
4. Asset/ETH return hashes, final receipt and independently checked token ownership.
5. Any sponsor-specific live flow, including a real Uniswap route and owner-signed swap where required.

No public-testnet task receipt or live model-provider run is established by the local tests documented here. Add those artifacts after they actually succeed. Testnet ETH has no monetary value.

## Limits of this evidence

- The test websites share a contract and implementation. They do not prove compatibility with an independent third-party dapp.
- Privy credentials, provider configuration or a relayer address alone do not prove complete login, funding and signing flows.
- Mocked Uniswap quotes and permit validation do not establish a successful live swap or sponsor qualification.
- Local Chromium checks do not establish Linux-host sandbox behavior, load capacity or production network isolation.
- No independent security audit or guaranteed hackathon eligibility is claimed. Recheck event and track rules separately.
- A crash between external provider acceptance and hash persistence can need relayer reconciliation. The API does not claim exactly-once delivery across a lost response.
- Dependency counts change with the lockfile. Run the current audit and consult [security boundaries](security.md); do not present an earlier count as a current audit.

### Recovery when the browser host is unavailable

The restart test now deliberately removes the worker's Chromium installation and
clears a saved vault address while leaving its successful deployment transaction
on chain. The restarted API remains available, `/refresh` reconciles that receipt,
and closing returns the remaining ETH and collectible. Browser creation/start
returns 503 while unavailable; receipt and recovery routes remain available.
Browser teardown errors cannot interrupt on-chain recovery.

The optional Browserless adapter uses Playwright's native protocol, keeps recording/replay off. Remote checks showed that local DNS launch rules
are not enforced by this provider. Remote browsing therefore requires exact
operator-configured trusted hostnames in BROWSER_ALLOWED_HOSTS, alongside request
interception and public-address validation. Arbitrary user-supplied hosts are
rejected. The remote browser has no access to the API container or its secrets. Free connections are
limited to two minutes; disconnects pause the task and allow reopening without
creating another allowance. Live provider checks passed for native Playwright connection, page evaluation,
and loading example.com through Melt’s browser setup. The configured free model
returned a valid click action for a supplied observation. A hosted end-to-end
transaction and adversarial remote network checks are still required; these
connection checks alone do not establish full production readiness.
