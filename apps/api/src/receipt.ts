import { formatEther, parseEther } from "viem";
import {
  mandateText,
  publicReceiptStatus,
  type Task,
} from "../../../packages/shared/src/index.js";

export function appOrigin() {
  return process.env.APP_ORIGIN || "http://127.0.0.1:5173";
}

function remaining(budget: string, spent: string) {
  try {
    const left = parseEther(budget) - parseEther(spent || "0");
    return formatEther(left < 0n ? 0n : left);
  } catch {
    return budget;
  }
}

export function publicReceipt(
  task: Task,
  chain: {
    id: number;
    name: string;
    symbol: string;
    explorer?: string;
  },
) {
  const origin = appOrigin();
  const token = task.receiptToken || "";
  return {
    object: "receipt" as const,
    id: task.id,
    receiptToken: token,
    url: token ? `${origin}/r/${token}` : "",
    status: publicReceiptStatus(task),
    outcome: task.outcome || "pending",
    outcomeReason: task.outcomeReason,
    title: task.title,
    instruction: task.instruction,
    mandate: mandateText(task, chain.symbol),
    kind: task.kind,
    swap: task.swap,
    budget: task.budget,
    spent: task.spent,
    remaining: remaining(task.budget, task.spent),
    returned: task.returned,
    balance: task.balance,
    vault: task.vault,
    recovery: task.recovery,
    createdAt: task.createdAt,
    expiresAt: task.expiresAt,
    chain,
    transactions: task.transactions.map((tx) => ({
      hash: tx.hash,
      kind: tx.kind,
      status: tx.status,
    })),
    assets: task.assets.map((asset) => ({
      token: asset.token,
      tokenId: asset.tokenId,
      kind: asset.kind,
      recovered: asset.recovered,
      symbol: asset.symbol,
      amount: asset.amount,
    })),
    events: task.events.map((item) => ({
      at: item.at,
      kind: item.kind,
      text: item.text,
      hash: item.hash,
    })),
    recover: {
      url: task.vault
        ? `${origin}/recover?vault=${task.vault}`
        : `${origin}/recover`,
      vault: task.vault,
      owner: task.recovery,
      chainId: chain.id,
      note: "Call close() then recoverNative() / recoverERC20() from the owner wallet. Melt does not need to be running.",
    },
  };
}
