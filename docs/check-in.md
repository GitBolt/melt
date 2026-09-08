# Check-in draft — not posted

I'm building Melt, a wallet for one browser task. You give an agent a job, a spending limit and one allowed contract action. It gets a separate wallet, does the task, and returns the assets and unused funds when the session ends. You can still recover assets that arrive later.

The browser and contract flow works locally: mint a collectible, reject an oversized spend, then return the NFT and remaining ETH. I've also built manual takeover, receipts that survive a restart, late-asset recovery, and an API/MCP interface for other agents. You can use the API directly or download a small client; there's no npm package needed.

I've removed the scripted driver. The app now uses a configured model or lets you bring your own agent through the browser controls. The browser tests use manual control, so I'm keeping that separate from proof of a live AI run. Public-testnet funding and the full hosted transaction flow still need verification.

Would love feedback on the permission and recovery design, and which real dapp would make the strongest first use case.

---

- App: [Melt](https://melt-woad.vercel.app)
- Public source: [GitBolt/melt](https://github.com/GitBolt/melt)

Update the status paragraph with actual testnet receipts once they exist. The app URL alone is not evidence of a successful public-network run. Complete the dashboard check-in separately; this file is a draft and does not indicate a submitted check-in.
