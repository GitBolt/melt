# Verification record

Updated September 9, 2026. Local runtime: macOS, Node 25.8.1, Playwright, Solidity 0.8.30 and Anvil chain 31337.

## September 9 additions

- **AI discovery and remote catalog.** Envelope search now asks a configured model to rank policy-approved candidates, and the catalog can include live Cryptorefills brands (`MELT_REMOTE_CATALOG=1`). Unit tests cover the deterministic keyword fallback (stemming, filler words) and the policy gate; the browser suite runs the full discover → propose → redeem flow with the deterministic matcher. Live model ranking and the remote catalog fetch are exercised manually, not by automated evidence: the model can only reorder or reject candidates that already passed policy, so a wrong model answer cannot move funds outside the envelope's rules.
- **Developer platform and hosted MCP.** The browser suite covers key create/revoke, revealed-secret clearing on logout, and OpenAPI download. Production smoke checks confirm `/api/platform` discovery, `/api/openapi.json`, and that `/api/mcp` rejects unauthenticated calls.
- **Offered-option cache.** A unit test asserts that any option a search served remains proposable by SKU without re-running search (the AI ranking is nondeterministic), and that unseen SKUs stay rejected. The deterministic policy gate still runs at propose time.
- **Thank-you notes and timeline.** The browser envelope test posts a public thank-you by gift token, then asserts the sender's envelope carries `thankYou` and that the derived event timeline includes the note. `envelope.thanked` is a signed webhook type.
- **Agent jobs surface.** The consumer app again exposes session creation (Activity → New agent job); the existing browser-mint, spending-limit, and manual-control tests already exercise this path end to end. Verified manually in a real browser: composer → vault deploy → live session → close and return.

## What the checks establish

| Check                 | Evidence and scope                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript            | Current application and client declarations type-check.                                                                                                                                                                                                                                                                                                                                                              |
| Standalone client     | 10 native HTTP tests pass. They cover decimal preservation, action validation, structured errors, Retry-After, cancelled and bounded polling, uncertain mutation responses, redirect credential protection and JPEG downloads. No model or chain is involved in these client tests.                                                                                                                                  |
| MCP                   | A real stdio client handshake from outside the repository lists all 15 tools using the documented absolute-path configuration. Browser integration tests also exercise account-scoped keys and manual control.                                                                                                                                                                                                       |
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

The hosted entry point is [Melt](https://trymeltapp.vercel.app), with [public source](https://github.com/GitBolt/melt). Deployment URLs and working RPC access are not substitutes for transaction proof.

Before claiming an end-to-end public-testnet run, record:

1. Selected chain ID, funded relayer and deployed contract addresses.
2. Verified Privy sign-in on the actual app origin and a confirmed owner funding transaction.
3. The model identifier or external-agent configuration, with a confirmed permitted task transaction.
4. Asset/ETH return hashes, final receipt and independently checked token ownership.
5. Any sponsor-specific live flow, including a real Uniswap route and owner-signed swap where required.

## Hosted Sepolia verification

The hosted app completed a real model-driven task on September 7, 2026 (September 8 UTC). Email sign-in used Privy; owner funding was signed in the embedded wallet. Browserless hosted the task browser and `liquid/lfm-2.5-2.6b:free` selected its actions.

- Funded 0.0003 ETH; minted for 0.0001 ETH; returned 0.0002 ETH and NFT #1.
- All six transaction receipts succeeded. Independent RPC reads confirmed the final NFT owner, closed vault, and zero vault balance.
- The initial free-router model returned invalid JSON and paused before spending. The corrected fixed model resumed the same allowance after deployment; it did not create a second wallet or increase the budget.
- Downloaded the hosted JavaScript client, matched it to repository source, fetched the receipt through an account key, then revoked that key and verified HTTP 401.
- Evidence: [onchain checks](evidence/sepolia-live-task.json), [API receipt](evidence/sepolia-session-receipt.json).

This uses our own collectible test dapp. Independent dapp and Uniswap integration remain unverified. Testnet ETH has no monetary value.

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
are not enforced by this provider. Remote browsing therefore requires public
HTTPS, private-network blocking, and request interception. Optional
BROWSER_ALLOWED_HOSTS can restrict which hostnames the page may navigate to;
subresources (scripts, images, CDNs) stay on public HTTPS even when that list
is set. An empty list allows any public site for navigation. Arbitrary
javascript: or credential-bearing URLs are rejected. The remote browser has no access to the API container or its secrets. Free connections are
limited to two minutes; disconnects pause the task and allow reopening without
creating another allowance. Live provider checks passed for native Playwright connection, page evaluation,
and loading example.com through Melt’s browser setup. The configured free model
returned a valid click action for a supplied observation. The hosted end-to-end transaction is documented above. Request interception was also verified against the remote provider. Broader adversarial network testing and independent dapp compatibility remain outside this evidence.
