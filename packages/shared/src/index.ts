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
    tokens: { symbol: string; name: string; address: string; decimals: number }[];
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
