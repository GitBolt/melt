# Melt copy guide

## References

[Link](https://link.com/) and [Link for agents](https://link.com/agents) are the primary writing references: lead with a useful benefit, follow with one short explanation, and make the next action clear. [Wise](https://wise.com/) is a secondary reference for plain financial labels that say what money moves and where it goes. These are style references; Melt uses original wording and describes its own capabilities.

## Voice

Clear, calm, and specific. Address the person using Melt as “you.” Use familiar verbs: set, start, spend, return, review. A short sentence should explain the benefit before introducing the mechanism. Let the interface carry the personality; avoid decorative slogans, wallet-as-home metaphors, and claims such as “one small step” when setup involves several steps.

Keep headings brief. Give supporting text one job. Buttons describe the action, including approvals or movement of funds. Use sentence case and omit periods from headings and labels. Keep terminal states literal: a closed session does not prove the agent completed its task.

## Product vocabulary

- **Envelope:** a purpose-bound gift. Purchasing power for a promise, not unrestricted cash.
- **Discover:** valid ways to use one envelope.
- **Activity:** settlement and delivery history.
- **Policy:** the immutable conditions (purpose, cap, expiry, deny list) hashed onchain in the receipt.
- **Task wallet / vault:** implementation detail that holds the envelope. Not a top-level product.
- **Receipt:** the envelope’s spending, settlement hashes, returned assets and outcome.
- **API key:** access to list, find, propose and redeem existing envelopes; it cannot create envelopes or send unrestricted cash.

Use exact technical terms where they help someone configure the product: contract address, function selector, base units, ERC-20, ERC-721, API, and MCP. Contract locks are optional.

## Examples

| Before                                                        | After                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A wallet for one task.                                        | Let an agent spend without your wallet.                                            |
| Tell Melt the job and how much it may spend.                  | ChatGPT and Claude already have a browser. They should not get your wallet.        |
| A small allowance. An isolated browser. Everything back home. | Set a spending limit, let your agent work, and return unused funds to your wallet. |
| Where are we going?                                           | Start with a task                                                                  |
| Everything accounted for.                                     | See where your funds went.                                                         |
| End & return everything                                       | End & return funds                                                                 |
| All done                                                      | Session closed                                                                     |
| Also speaks MCP.                                              | Connect with MCP                                                                   |

## Claims and states

Describe session-level authorization, not approval of every agent purchase. Do not promise support for every website or token, guaranteed recovery, zero risk, or universal protection of funds. Describe failed or pending recovery explicitly. Keep “Session closed” separate from task outcome. “Transaction confirmed” establishes the permitted onchain action; it does not prove every semantic instruction was satisfied.

Label local development as a local workspace using test ETH. Show “Manual control” when no model is configured; never imply a built-in autonomous run is available in that state. The production app has no scripted driver. “AI agent enabled” describes configured model access, not verified model performance. Funding and swap buttons must disclose their action; preserve approval language before opening a wallet prompt. Never turn a submitted transaction into a confirmed status through wording alone.

## Review

Read the page in order: benefit, explanation, action, result. Remove text that repeats nearby information. Check narrow screens for wrapping, preserve accessible labels, and update existing browser-test labels when buttons change. Keep persisted transaction kinds and API fields stable when refining their display text.
