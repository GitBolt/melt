import { z } from "zod";
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const amount = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/)
  .refine(
    (v) => Number(v) > 0 && Number(v) <= 10,
    "Use an amount between 0 and 10",
  );
export const createTask = z.object({
  title: z.string().trim().min(3).max(100),
  instruction: z.string().trim().min(3).max(2000),
  url: z.string().url().max(2048),
  budget: amount,
  durationMinutes: z.number().int().min(1).max(60).default(15),
  target: address,
  selector: z.string().regex(/^0x[0-9a-fA-F]{8}$/),
  recovery: address,
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
  publicRpcUrl?: string;
  fixture: {
    available: boolean;
    url: string;
    alternateUrl: string;
    target: string;
    selector: string;
    price: string;
  };
  operator: string;
}
export const terminal = (status: TaskStatus) => status === "closed";
