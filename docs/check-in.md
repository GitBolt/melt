# Check-in draft — not posted

I'm building Melt, a wallet for one browser task. You give an agent a job and a spending limit. It gets a separate wallet, does the task, and returns the assets and unused funds when the session ends. You can still recover assets that arrive later.

The hosted flow now works on Sepolia: I signed in with email, funded a task wallet with 0.0003 ETH, and let the AI connect to a test dapp and mint a collectible. It spent 0.0001 ETH, then returned the NFT and the remaining 0.0002 ETH. The receipts and final NFT ownership are verified onchain.

There’s manual takeover, recovery after a server restart, late-asset recovery, and an API/MCP interface for other agents. You can download the client as one file, no npm package needed. I also tested creating and revoking an API key against the hosted app. The current mint is on my own test dapp; an independent dapp integration is the next thing to validate.

Would love feedback on the permission and recovery design, and which real dapp would make the strongest first use case.

---

- App: [Melt](https://melt-woad.vercel.app)
- Public source: [GitBolt/melt](https://github.com/GitBolt/melt)

Live evidence is in `docs/evidence/sepolia-live-task.json` and `docs/evidence/sepolia-session-receipt.json`. Complete the dashboard check-in separately; this file is a draft and does not indicate a submitted check-in.
