# Check-in draft — not posted

Building **Melt: a wallet for one task**. Give a browser agent an allowance and a permitted contract action; it completes the task, closes its spending access, and returns the result plus unused funds to your wallet. Owner recovery still works for late arrivals.

The local end-to-end flow is working: a real Chromium browser mints on local Ethereum, an oversized spend is rejected, and the NFT/remainder come home. We also have manual takeover, persistent receipts, restart recovery, and an API/MCP interface. Privy onboarding/signing and an owner-controlled Uniswap funding conversion are implemented; live credential-backed verification is next. The default no-key demo is a labelled scripted driver.

Would love feedback on the lifecycle/recovery distinction from other agent wallets, and whether the full convert → fund → act → recover flow is compelling for the financial-flow tracks. Happy to show the working demo.

---

Before posting, add the actual public demo/repository links when available. Complete the **dashboard check-in** separately. This file is a draft only and does not indicate that check-in has been submitted.
