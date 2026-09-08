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
export const envelopeCategories = [
  "esim",
  "dinner",
  "concert",
  "flight",
  "game",
  "apartment",
  "ai",
  "other",
] as const;
export type EnvelopeCategory = (typeof envelopeCategories)[number];
export const createEnvelope = z
  .object({
    recipientLabel: z.string().trim().min(1).max(120),
    recipientAddress: z
      .union([address, z.literal("")])
      .optional()
      .default(""),
    purpose: z.string().trim().min(8).max(500),
    budget: amount,
    expiresAt: z.number().int(),
    partialUse: z.boolean().default(true),
    unusedTo: z.literal("sender").default("sender"),
    category: z.enum(envelopeCategories).optional(),
  })
  .superRefine((data, ctx) => {
    const now = Math.floor(Date.now() / 1000);
    if (data.expiresAt < now + 60)
      ctx.addIssue({
        code: "custom",
        message: "Pick an expiry at least a minute from now",
        path: ["expiresAt"],
      });
    if (data.expiresAt > now + 86400 * 730)
      ctx.addIssue({
        code: "custom",
        message: "Envelopes can last at most two years",
        path: ["expiresAt"],
      });
  });
export type CreateEnvelope = z.infer<typeof createEnvelope>;
export type EnvelopeStatus =
  "funding" | "open" | "redeeming" | "exhausted" | "expired" | "closed";
export interface EnvelopePolicy {
  purpose: string;
  category: EnvelopeCategory;
  allow: string[];
  deny: string[];
  maxUsd?: number;
  partialUse: boolean;
  unusedTo: "sender";
}
export interface EnvelopeQuote {
  id: string;
  envelopeId: string;
  sku: string;
  title: string;
  merchant: string;
  amountEth: string;
  amountUsd?: number;
  settlement: "uniswap" | "catalog";
  tokenSymbol?: string;
  source: string;
  disclosure: string;
  createdAt: string;
  expiresAt: number;
  status: "proposed" | "redeemed" | "rejected" | "expired";
}
export interface EnvelopeRedemption {
  id: string;
  quoteId: string;
  sku: string;
  title: string;
  merchant: string;
  amountEth: string;
  amountOut?: string;
  symbol?: string;
  hash?: string;
  status: "succeeded" | "failed";
  delivery?: string;
  createdAt: string;
  disclosure?: string;
}
export interface Envelope {
  object: "envelope";
  id: string;
  userId: string;
  sessionId: string;
  vault: string;
  senderAddress: string;
  recipientLabel: string;
  recipientAddress: string;
  purpose: string;
  category: EnvelopeCategory;
  budget: string;
  remaining: string;
  spent: string;
  expiresAt: number;
  partialUse: boolean;
  unusedTo: "sender";
  policy: EnvelopePolicy;
  policyHash: string;
  status: EnvelopeStatus;
  createdAt: string;
  receiptToken?: string;
  quotes: EnvelopeQuote[];
  redemptions: EnvelopeRedemption[];
}
export interface CatalogOption {
  sku: string;
  title: string;
  merchant: string;
  category: EnvelopeCategory;
  description: string;
  priceUsd: number;
  priceEth?: string;
  keywords: string[];
  tags: string[];
  settlement: "uniswap" | "catalog";
  tokenSymbol?: string;
  source: "melt" | "cryptorefills";
  disclosure: string;
}
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
  envelopeId?: string;
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
  envelopes?: { available: boolean };
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

const CATEGORY_HINTS: Record<EnvelopeCategory, string[]> = {
  esim: [
    "esim",
    "e-sim",
    "e sim",
    "mobile data",
    "data plan",
    "roaming",
    "prepaid data",
    "japan trip",
  ],
  dinner: [
    "dinner",
    "restaurant",
    "italian",
    "meal",
    "food",
    "lunch",
    "brunch",
    "for two",
  ],
  concert: ["concert", "gig", "festival", "tickets", "show", "live music"],
  flight: ["flight", "airfare", "fly home", "thanksgiving", "plane", "airport"],
  game: ["game", "indie", "steam", "nintendo"],
  apartment: ["apartment", "flat", "furniture", "new place", "housewarming"],
  ai: [
    "ai product",
    "chatgpt",
    "claude",
    "grok",
    "codex",
    "cursor",
    "subscription",
  ],
  other: [],
};

export function inferEnvelopePolicy(
  purpose: string,
  extras: Partial<EnvelopePolicy> = {},
): EnvelopePolicy {
  const text = purpose.toLowerCase();
  let category: EnvelopeCategory = extras.category || "other";
  if (!extras.category) {
    for (const key of envelopeCategories) {
      if (key === "other") continue;
      if (CATEGORY_HINTS[key].some((hint) => text.includes(hint))) {
        category = key;
        break;
      }
    }
  }
  const deny = [...(extras.deny || [])];
  const except = purpose.match(/except\s+([^.,;]+)/i);
  if (except) {
    const raw = except[1].toLowerCase();
    deny.push(
      ...raw
        .split(/,| and /)
        .map((part) => part.trim())
        .filter(Boolean),
    );
    if (raw.includes("electronic"))
      deny.push(
        "tv",
        "television",
        "laptop",
        "phone",
        "console",
        "headphones",
        "tablet",
        "camera",
        "electronics",
      );
  }
  const usd = purpose.match(/\$(\d+(?:\.\d+)?)/);
  return {
    purpose: purpose.trim(),
    category,
    allow: extras.allow || [],
    deny: [...new Set(deny)],
    maxUsd: extras.maxUsd ?? (usd ? Number(usd[1]) : undefined),
    partialUse: extras.partialUse ?? true,
    unusedTo: "sender",
  };
}

export function optionFitsPolicy(
  policy: EnvelopePolicy,
  option: CatalogOption,
  remainingEth: number,
  request = "",
): { ok: boolean; reason?: string; score: number } {
  const hay = [
    option.title,
    option.merchant,
    option.description,
    ...(option.keywords || []),
    ...(option.tags || []),
  ]
    .join(" ")
    .toLowerCase();
  for (const word of policy.deny) {
    if (!word) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(hay))
      return {
        ok: false,
        reason: `Blocked by the gift: not ${word}`,
        score: 0,
      };
  }
  if (
    policy.category !== "other" &&
    option.category !== policy.category &&
    option.category !== "other"
  ) {
    const purposeHit = policy.purpose
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3 && hay.includes(word)).length;
    if (purposeHit < 2)
      return {
        ok: false,
        reason: `This is ${option.category}, not ${policy.category}`,
        score: 0,
      };
  }
  const priceEth = Number(option.priceEth || 0);
  if (priceEth > remainingEth + 1e-9)
    return { ok: false, reason: "Over the remaining amount", score: 0 };
  if (policy.maxUsd != null && option.priceUsd > policy.maxUsd + 0.01)
    return {
      ok: false,
      reason: `Over the $${policy.maxUsd} cap`,
      score: 0,
    };
  if (policy.allow.length) {
    const allowHit = policy.allow.some(
      (item) =>
        hay.includes(item.toLowerCase()) ||
        policy.purpose.toLowerCase().includes(item.toLowerCase()),
    );
    if (!allowHit)
      return { ok: false, reason: "Not in the allowed set", score: 0 };
  }
  const query = `${policy.purpose} ${request}`.toLowerCase();
  let score = option.category === policy.category ? 5 : 1;
  for (const keyword of option.keywords)
    if (query.includes(keyword.toLowerCase())) score += 2;
  if (request.trim()) {
    const terms = request
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 2);
    const hits = terms.filter((term) => hay.includes(term));
    if (terms.length && hits.length === 0)
      return { ok: false, reason: "Does not match the request", score: 0 };
    score += hits.length;
  }
  return { ok: true, score };
}

export function looksLikeCashOut(request: string) {
  return /transfer|withdraw|send (me )?(the )?(money|eth|usdc|funds)|cash out|unrestricted/i.test(
    request,
  );
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
  if (task.envelopeId) {
    return `This vault holds a Melt envelope: “${task.instruction}”. Spend at most ${task.budget} ${nativeSymbol} on a purchase that matches that promise. Spending access ends ${until}. Unused funds return to ${dest}.`;
  }
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
