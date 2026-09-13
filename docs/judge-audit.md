# Melt judge-readiness audit — September 13, 2026

This is a code and behavior audit, not a formal smart-contract security certification or a guarantee that every possible input works. Unsupported requests must fail clearly. Paid real-world fulfillment is not implemented in this release.

## Fixed

- Recipient access: authenticated, provider-verified email identity can access received gifts. A public link alone does not authorize spending. Wallet-recipient and sender access remain supported.
- Dollar display: excess ETH deposited into a vault cannot inflate a $1 gift into an $11 gift. The displayed allowance is bounded by the original cap and completed dollar spend.
- Cumulative limits: partial purchases consume the remaining dollar allowance. Native spending is bounded by both vault balance and budget minus spend; redemption rechecks both limits.
- Exact brands: searching DoorDash no longer silently substitutes Uber Eats; Steam-only gifts reject Xbox. Two named permitted brands are alternatives, not an impossible requirement to match both.
- Keywords: ordinary “show me” wording no longer becomes a concert request. Gaming, coffee, and more common brand aliases are recognized. Category mismatches and cash-out requests have explicit reasons.
- Catalog safety: unrestricted retailers cross-listed under gaming/food are not treated as restricted-purpose cards. Out-of-stock and non-dollar denominations are excluded from remote catalog parsing.
- Variety: cached US examples now include Razer Gold, Xbox, Nintendo, Roblox, Dunkin, Chipotle, Starbucks and Grubhub, alongside existing food/game/eSIM examples. Remote discovery remains enabled in production; cached prices do not prove current stock.
- Affordability: a $1 food gift explicitly explains the $15 Uber Eats minimum. Public fit checks distinguish purpose compatibility from affordability and honor brand restrictions.
- Funding precision: dollar-based envelopes use server-side ETH pricing and preserve small amounts instead of rounding them away. Editing the dollar amount also updates a purpose that says “up to $…”.
- Duplicate prevention: quote processing is persisted before submitting a swap; repeated redemption is rejected. Proposals and redemption are serialized per session, sharing the recovery lock.
- Persistence: read-only gift presentation no longer writes stale purchase state. Email/open/thank-you metadata cannot overwrite concurrent purchase records.
- Settlement receipts: confirmed settlement is saved before contacting the merchant. Actual token balance changes determine received USDC; later redemptions do not overwrite total holdings with the latest quote.
- Merchant failures: validation rejection, missing email, timeout, and settlement-only outcomes are explicit. An unpaid merchant order is not labeled “issued.” Mainnet redemption is blocked before funds move.
- Gift isolation: browser start, actions and wallet-provider paths reject gift vaults. New gift vaults are restricted to the Uniswap router and `exactInputSingle`; existing deployed vault permissions cannot be changed retroactively.
- UI: incoming gift links select the intended gift after login without continually overriding manual selection. Partial use, expiry, closed gifts, pending purchases, stale fit responses, loading failures and clipboard failures have clearer handling.
- Truthful boundaries: frontend and README distinguish onchain native limits from backend semantic rules, and sender recovery from irrevocable gifting. Network labels no longer present dead switching controls as active actions.
- Domain references: active SDK examples and docs use `https://trymeltapp.vercel.app`.

## Judge test matrix

| Gift purpose / cap | Enter | Expected result |
| --- | --- | --- |
| Gaming up to $1 | Razer Gold | $1 option; testnet swap and receipt, no paid card |
| Gaming up to $1 | Steam | Clear minimum-price explanation, no purchase |
| Food delivery up to $1 | video games | Explicit purpose rejection |
| Food delivery up to $1 | Uber Eats | Purpose matches, but $15 minimum exceeds gift |
| Food up to $5 | Dunkin, Chipotle, Starbucks, Grubhub | Eligible cached choices where denomination fits |
| Gaming up to $10 | Xbox, Nintendo, Roblox, Razer Gold | Eligible denomination choices within allowance |
| Steam games up to $40 | Xbox | Brand restriction rejection |
| Uber Eats or DoorDash up to $40 | either brand | That brand's matching options only |
| Mobile data up to $20 | Japan eSIM | Demonstration eSIM option; no verified live eSIM issuance |
| Any gift | cash out / transfer / crypto | Explicit rejection, no swap |
| Exhausted, expired or closed gift | any product | No purchase; state-specific explanation |
| Same quote submitted twice | redeem | One succeeds, other rejected; no second swap |
| Existing gift link | Spend it in Melt | Correct gift selected; unauthorized account gets a sign-in explanation |

Catalog prices are examples checked against the US catalog on the audit date, not a guarantee of later prices, stock, country compatibility or merchant validation success.

## Verification

- Production build and TypeScript checking.
- Solidity budget, permitted calls, expiry and recovery tests.
- API/policy/auth/catalog/issuer regression tests and SDK tests.
- Browser tests for minting, recovery, cross-account isolation, revoked keys, manual controls, MCP, private-URL restrictions, CSRF, gift settlement and developer controls.
- New $1 browser journey: correct dollar display, category rejection, affordability, intended gift selection, mobile overflow, actual local-fork swap, simultaneous proposals and duplicate redemption rejection.
- Restart test: persisted authorization, confirmed receipts and recovery after worker restart.
- Desktop and 390px mobile screenshots reviewed for the Razer journey.

These automated transactions use an isolated local mainnet fork and development wallets. They do not establish a newly verified end-to-end Privy login or paid merchant purchase on production.

## Remaining boundaries and operational risks

1. Sepolia ETH has no monetary value. No live gift card or eSIM is purchased or delivered. Mainnet merchant payment is disabled, not merely waiting for a configuration toggle.
2. Semantic policy is enforced by trusted backend code. A hash alone is not onchain proof of product eligibility. Native budget, expiry, call restrictions and recovery are contract-enforced.
3. Sender/authorized agent can recover early. Automatic expiry handling depends on worker/RPC availability; direct owner recovery remains possible.
4. Flights, event tickets, physical-goods checkout and AI subscriptions have no integrated fulfillment. External assistant proposals carry agent-supplied prices and descriptions, not verified inventory.
5. Merchant stock, US-region eligibility, public RPCs, model availability, wallet login, test ETH and relayer gas can affect a hosted test. Cached catalog fallback and error text do not remove those dependencies.
6. An unresolved submitted swap remains locked for safety. Do not blindly resubmit: inspect its transaction receipt and reconcile it operationally. Automated recovery of every ambiguous in-flight state is not implemented.
7. Account API keys are revocable but are not independently per-envelope capability keys. Share them only with a trusted assistant.
8. Existing onchain vault permissions are immutable; only newly created gift vaults receive the new router/selector restriction. API-level gift isolation applies to both.
9. The frontend build still reports large third-party authentication/wallet chunks. Functional checks passed; low-bandwidth performance is not exhaustively benchmarked.

## Published submission review

Reviewed [Melt on ETHGlobal](https://ethglobal.com/showcase/melt-ei6ta) against the implementation. Its strongest explanation is the split between AI interpretation, deterministic checks and the vault's native spending limit. Preserve that distinction.

Suggested corrections, not changes made to the published entry:

- Replace the implication of “validates or creates” merchant orders with: “After settlement, Melt attempts merchant order validation and reports the result separately. This release does not create a paid order or issue a live card.”
- Clarify key scope: “Revocable account keys can operate that account's accessible gifts; hosted MCP exposes gift tools, while the stdio client also supports owner-authorized agent jobs.”
- Say remote inventory uses the US catalog and built-in eSIM options are demonstration entries.
- Add a judge hint near the demo: “For the smallest settlement demo, create Gaming up to $1 and search Razer Gold. A food gift under its merchant's minimum correctly returns an affordability explanation.”
- Preserve the honest testnet disclaimer. Do not imply that a successful swap is a completed real-world purchase or that semantic categories are enforced by Solidity.

The live submission itself was reviewed, not edited or resubmitted.
