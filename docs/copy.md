# Melt copy guide

## References

[Link](https://link.com/) and [Link for agents](https://link.com/agents) are the primary writing references: lead with a useful benefit, follow with one short explanation, and make the next action clear. [Wise](https://wise.com/) is a secondary reference for plain financial labels that say what money moves and where it goes. These are style references; Melt uses original wording and describes its own capabilities.

## Voice

Clear, calm, and specific. Address the person using Melt as “you.” Use familiar verbs: set, start, spend, return, review. A short sentence should explain the benefit before introducing the mechanism. Let the interface carry the personality; avoid decorative slogans, wallet-as-home metaphors, and claims such as “one small step” when setup involves several steps.

Keep headings brief. Give supporting text one job. Buttons describe the action, including approvals or movement of funds. Use sentence case and omit periods from headings and labels. Keep terminal states literal: a closed session does not prove the agent completed its task.

## Product vocabulary

- **Task:** the job the person wants done.
- **Session:** the task wallet, browser, permissions, and activity for one run.
- **Task wallet:** the wallet used by the agent, separate from the main wallet.
- **Spending limit:** the maximum native-token value the wallet may spend. Gas costs are separate.
- **Return wallet:** the fixed destination for returned funds and supported assets.
- **Receipt:** the session’s spending, transactions, returned assets, and recovery status.
- **API key:** access to operate sessions already authorized by the owner; it cannot create wallets or raise spending limits.

Use exact technical terms where they help someone configure the product: contract address, function selector, base units, ERC-20, ERC-721, API, and MCP.

## Examples

| Before                                                        | After                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A small allowance. An isolated browser. Everything back home. | Set a spending limit, let your agent work, and return unused funds to your wallet. |
| Where are we going?                                           | Start with a task                                                                  |
| Everything accounted for.                                     | See where your funds went.                                                         |
| End & return everything                                       | End & return funds                                                                 |
| All done                                                      | Session closed                                                                     |
| Also speaks MCP.                                              | Connect with MCP                                                                   |

## Claims and states

Describe session-level authorization, not approval of every agent purchase. Do not promise support for every website or token, guaranteed recovery, zero risk, or universal protection of funds. Describe failed or pending recovery explicitly. Do not imply that closing the session means the task succeeded.

Label the local experience as a scripted demo using local test ETH. “AI agent enabled” describes configured model access, not verified model performance. Funding and swap buttons must disclose their action; preserve approval language before opening a wallet prompt. Never turn a submitted transaction into a confirmed status through wording alone.

## Review

Read the page in order: benefit, explanation, action, result. Remove text that repeats nearby information. Check narrow screens for wrapping, preserve accessible labels, and update existing browser-test labels when buttons change. Keep persisted transaction kinds and API fields stable when refining their display text.
