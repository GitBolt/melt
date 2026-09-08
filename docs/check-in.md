# Check-in draft — not posted

I'm building Melt Envelopes: gift cards without stores. You send purchasing power for a purpose — dinner, a flight home, mobile data for a trip — and their existing assistant chooses how to use it later. The money is locked onchain. They cannot cash it out. You cannot take it back early.

ChatGPT, Claude, Codex or Grok call Melt through MCP, find a qualifying purchase, and Melt converts only the required ETH to USDC on Uniswap. Unused funds stay in the envelope, then return to the sender.

App: [Melt](https://melt-woad.vercel.app)
Public source: [GitBolt/melt](https://github.com/GitBolt/melt)

The hosted flow now works on Sepolia: I signed in with email, funded a task wallet with 0.0003 ETH, and let the AI connect to a test dapp and mint a collectible. It spent 0.0001 ETH, then returned the NFT and the remaining 0.0002 ETH. The receipts and final NFT ownership are verified onchain.

There’s manual takeover, recovery after a server restart, late-asset recovery, and an API/MCP interface for other agents. You can download the client as one file, no npm package needed. I also tested creating and revoking an API key against the hosted app. The current mint is on my own test dapp; an independent dapp integration is the next thing to validate.

Would love feedback on the permission and recovery design, and which real dapp would make the strongest first use case.

---

- App: [Melt](https://melt-woad.vercel.app)
- Public source: [GitBolt/melt](https://github.com/GitBolt/melt)

Live evidence is in `docs/evidence/sepolia-live-task.json` and `docs/evidence/sepolia-session-receipt.json`. Complete the dashboard check-in separately; this file is a draft and does not indicate a submitted check-in.
