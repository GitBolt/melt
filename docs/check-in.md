# Check-in draft — not posted

I'm building Melt Envelopes: gift cards without stores. You send purchasing power for a purpose — dinner, a flight home, mobile data for a trip — and their existing assistant chooses how to use it later. The money is locked onchain. They cannot cash it out. You cannot take it back early.

ChatGPT, Claude, Codex or Grok call Melt through MCP, find a qualifying purchase, and Melt converts only the required ETH to USDC on Uniswap. Unused funds stay in the envelope, then return to the sender.

This is not an agent spending-control wallet. Those restrict how an owner’s agent spends the owner’s money. Melt transfers a restricted purchasing right to another person:

```text
sender’s money → immutable purpose → recipient’s chosen agent → qualifying purchase
```

App: [Melt](https://melt-woad.vercel.app)
Public source: [GitBolt/melt](https://github.com/GitBolt/melt)

Would love feedback on the purpose-bound gift primitive, and whether Uniswap-as-settlement (not a swap tab) is the right conversion rail.

---

- App: [Melt](https://melt-woad.vercel.app)
- Public source: [GitBolt/melt](https://github.com/GitBolt/melt)

Complete the dashboard check-in separately; this file is a draft and does not indicate a submitted check-in.
