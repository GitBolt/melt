import { isAddress, parseEther, type Hex } from "viem";
import type { Task } from "../../../packages/shared/src/index.js";
export const forbiddenSelectors = [
  "0x095ea7b3",
  "0xa22cb465",
  "0xd505accf",
  "0x23b872dd",
  "0xa9059cbb",
];
export function lockedSpend(task: Pick<Task, "target" | "selector">) {
  return Boolean(task.target && task.selector);
}
export function validateTransaction(task: Task, tx: Record<string, unknown>) {
  if (task.status !== "running" && task.status !== "paused")
    throw Error("This session is not active");
  if (Date.now() >= task.expiresAt * 1000) throw Error("Session expired");
  if (typeof tx.to !== "string" || !isAddress(tx.to))
    throw Error("Contract is outside this session’s permission");
  if (lockedSpend(task) && tx.to.toLowerCase() !== task.target.toLowerCase())
    throw Error("Contract is outside this session’s permission");
  if (tx.from && String(tx.from).toLowerCase() !== task.vault.toLowerCase())
    throw Error("Wrong sender");
  if (typeof tx.data !== "string" || !/^0x([0-9a-fA-F]{2}){4,}$/.test(tx.data))
    throw Error("Function is outside this session’s permission");
  const selector = tx.data.slice(0, 10).toLowerCase();
  if (lockedSpend(task) && selector !== task.selector.toLowerCase())
    throw Error("Function is outside this session’s permission");
  if (forbiddenSelectors.includes(selector))
    throw Error(
      "Persistent approvals and arbitrary transfers are not permitted",
    );
  if (
    tx.chainId !== undefined &&
    BigInt(String(tx.chainId)) !== BigInt(process.env.CHAIN_ID || 31337)
  )
    throw Error("Wrong chain");
  const value = BigInt(String(tx.value || "0x0"));
  if (value < 0n || value > parseEther(task.budget) - parseEther(task.spent))
    throw Error("Amount exceeds the remaining allowance");
  return { to: tx.to as Hex, data: tx.data as Hex, value };
}
