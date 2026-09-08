import { z } from "zod";
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const amount = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/)
  .refine(
    (v) => Number(v) > 0 && Number(v) <= 10,
    "Use an amount between 0 and 10",
  );
const website = z
  .string()
  .max(2048)
  .default("")
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }, "Enter a website URL or leave it blank");
const lock = z
  .union([address, z.literal("")])
  .optional()
  .default("");
const selector = z
  .union([z.string().regex(/^0x[0-9a-fA-F]{8}$/), z.literal("")])
  .optional()
  .default("");
export const swapRequest = z.object({
  tokenOut: address,
  symbol: z.string().trim().min(1).max(20),
  amountIn: amount,
  slippageBps: z.number().int().min(1).max(5000).default(50),
  // Recurring buys (dollar-cost averaging): `buys` swaps of `amountIn` spaced
  // `intervalSec` apart, all bounded by one onchain budget.
  buys: z.number().int().min(1).max(20).default(1),
  intervalSec: z.number().int().min(5).max(86400).default(60),
});
export type SwapRequest = z.infer<typeof swapRequest>;
export const createTask = z
  .object({
    title: z.string().trim().min(3).max(100),
    instruction: z.string().trim().min(3).max(2000),
    url: website,
    budget: amount,
    durationMinutes: z.number().int().min(1).max(60).default(15),
    target: lock,
    selector,
    recovery: address,
    kind: z.enum(["browse", "swap"]).default("browse"),
    swap: swapRequest.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "swap" && !data.swap)
      ctx.addIssue({
        code: "custom",
        message: "A swap task needs swap details",
        path: ["swap"],
      });
    if (Boolean(data.target) === Boolean(data.selector)) return;
    ctx.addIssue({
      code: "custom",
      message: "Set both a contract and a function, or leave both empty",
      path: data.target ? ["selector"] : ["target"],
    });
  });
export type CreateTask = z.infer<typeof createTask>;
export type TaskStatus =
  | "funding"
  | "ready"
  | "running"
  | "paused"
  | "closing"
  | "closed"
  | "attention";
export interface TaskEvent {
  id: string;
  at: string;
  kind: "info" | "success" | "blocked" | "error" | "transaction";
  text: string;
  hash?: string;
}
export interface Transaction {
  hash: string;
  kind: string;
  status: "pending" | "success" | "reverted";
  gasWei?: string;
}
export interface Asset {
  token: string;
  tokenId?: string;
  kind: "erc721" | "erc20";
  recovered: boolean;
  symbol?: string;
  amount?: string;
}
export interface Task extends CreateTask {
  id: string;
  userId: string;
  vault: string;
  createdAt: string;
  expiresAt: number;
  status: TaskStatus;
  spent: string;
  returned: string;
  balance: string;
  events: TaskEvent[];
  transactions: Transaction[];
  assets: Asset[];
  browserUrl?: string;
  browserTitle?: string;
  agentMode: "manual" | "model";
  outcome?: "pending" | "succeeded" | "failed" | "cancelled";
  outcomeReason?: string;
  error?: string;
  receiptToken?: string;
}
export interface Config {
  mode: "local" | "configured";
  chain: { id: number; name: string; symbol: string; explorer?: string };
  privyAppId?: string;
  modelConfigured: boolean;
  browserAvailable?: boolean;
  swapsConfigured?: boolean;
  swap?: {
    available: boolean;
    router: string;
    tokens: {
      symbol: string;
      name: string;
      address: string;
      decimals: number;
    }[];
  };
  publicRpcUrl?: string;
  fixture: {
    available: boolean;
    url: string;
    alternateUrl: string;
    target: string;
    selector: string;
    price: string;
    pay?: {
      available: boolean;
      url: string;
      target: string;
      selector: string;
      price: string;
    };
  };
  operator: string;
}
export const terminal = (status: TaskStatus) => status === "closed";

export type PublicReceiptStatus =
  | "requires_funding"
  | "open"
  | "processing"
  | "settling"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "needs_recovery";

export function publicReceiptStatus(task: Task): PublicReceiptStatus {
  if (task.status === "funding") return "requires_funding";
  if (task.status === "ready") return "open";
  if (task.status === "running" || task.status === "paused")
    return "processing";
  if (task.status === "closing") return "settling";
  if (task.status === "attention") return "needs_recovery";
  if (task.outcome === "succeeded") return "succeeded";
  if (task.outcome === "failed") return "failed";
  if (task.outcome === "cancelled") return "cancelled";
  return "succeeded";
}

export function mandateText(task: Task, nativeSymbol = "ETH"): string {
  const until =
    new Date(task.expiresAt * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 16) + " UTC";
  const dest = task.recovery
    ? `${task.recovery.slice(0, 6)}…${task.recovery.slice(-4)}`
    : "the owner wallet";
  if (task.kind === "swap" && task.swap) {
    const dca =
      (task.swap.buys || 1) > 1 ? ` across ${task.swap.buys} buys` : "";
    return `Spend at most ${task.budget} ${nativeSymbol} swapping to ${task.swap.symbol}${dca} on Uniswap V3. Spending ends ${until}. Unused ${nativeSymbol} and ${task.swap.symbol} return to ${dest}.`;
  }
  let site = "";
  if (task.url) {
    try {
      site = ` on ${new URL(task.url).hostname}`;
    } catch {
      site = "";
    }
  }
  return `Spend at most ${task.budget} ${nativeSymbol}${site} for this job. Spending ends ${until}. Unused funds and recovered assets return to ${dest}.`;
}
