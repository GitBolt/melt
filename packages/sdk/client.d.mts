export type SessionStatus =
  | "funding"
  | "ready"
  | "running"
  | "paused"
  | "closing"
  | "closed"
  | "attention";
export interface Session {
  id: string;
  userId: string;
  title: string;
  instruction: string;
  url: string;
  budget: string;
  durationMinutes: number;
  target: string;
  selector: string;
  recovery: string;
  vault: string;
  createdAt: string;
  expiresAt: number;
  status: SessionStatus;
  spent: string;
  returned: string;
  balance: string;
  receiptToken?: string;
  remaining?: string;
  events: {
    id: string;
    at: string;
    kind: "info" | "success" | "blocked" | "error" | "transaction";
    text: string;
    hash?: string;
  }[];
  transactions: {
    hash: string;
    kind: string;
    status: "pending" | "success" | "reverted";
    gasWei?: string;
  }[];
  assets: {
    token: string;
    tokenId?: string;
    kind: "erc721" | "erc20";
    recovered: boolean;
    symbol?: string;
    amount?: string;
  }[];
  browserUrl?: string;
  browserTitle?: string;
  agentMode: "model" | "manual";
  outcome?: "pending" | "succeeded" | "failed" | "cancelled";
  outcomeReason?: string;
  error?: string;
}
export interface BrowserObservation {
  url: string;
  title: string;
  text: string;
  scroll?: { y: number; viewportHeight: number; pageHeight: number };
  controls: {
    index: number;
    tag: string;
    label: string;
    type?: string | null;
    disabled?: boolean;
    href?: string;
    value?: string;
    options?: {
      value: string;
      label: string;
      selected: boolean;
      disabled: boolean;
    }[];
  }[];
}
export type BrowserAction = (
  | { type: "click"; index: number }
  | { type: "fill"; index: number; value: string }
  | { type: "select"; index: number; value: string }
  | {
      type: "press";
      index: number;
      key: "Enter" | "Tab" | "Escape" | "ArrowUp" | "ArrowDown";
    }
  | { type: "scroll"; direction: "up" | "down" }
  | { type: "open"; url: string }
  | { type: "wait" }
  | { type: "finish" }
) & { reason?: string };
export type Receipt = Session & {
  schemaVersion: 1;
  chainId: number;
  network: string;
};
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface WaitOptions extends RequestOptions {
  intervalMs?: number;
  until?: SessionStatus[];
}
export interface SwapToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}
export interface SwapTokens {
  available: boolean;
  router: string;
  tokens: SwapToken[];
}
export interface SwapQuote {
  tokenOut: string;
  symbol: string;
  decimals: number;
  amountIn: string;
  amountInWei: string;
  fee: number;
  amountOutWei: string;
  amountOut: string;
  minOutWei: string;
  minOut: string;
  slippageBps: number;
  rate: string;
  priceImpactBps?: number;
}
export interface Envelope {
  object: "envelope";
  id: string;
  purpose: string;
  budget: string;
  remaining: string;
  policyHash: string;
  status: string;
}
export interface MeltConfig {
  baseUrl?: string;
  apiKey: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}
export class MeltError extends Error {
  code: string;
  status?: number;
  retryAfterMs?: number;
  uncertain: boolean;
  constructor(
    message: string,
    options?: {
      code?: string;
      status?: number;
      retryAfterMs?: number;
      uncertain?: boolean;
      cause?: unknown;
    },
  );
}
export class Melt {
  constructor(config: MeltConfig);
  sessions(options?: RequestOptions): Promise<Session[]>;
  envelopes(options?: RequestOptions): Promise<{
    sent: Envelope[];
    received: Envelope[];
  }>;
  envelope(id: string, options?: RequestOptions): Promise<Envelope>;
  findOptions(
    id: string,
    request?: string,
    options?: RequestOptions,
  ): Promise<{ options: unknown[]; note?: string }>;
  proposePurchase(
    id: string,
    params: { sku: string; request?: string },
    options?: RequestOptions,
  ): Promise<{ quote: { id: string } }>;
  proposeItem(
    id: string,
    item: {
      title: string;
      merchant: string;
      priceUsd: number;
      url?: string;
      description?: string;
    },
    options?: RequestOptions,
  ): Promise<{ quote: { id: string } }>;
  redeem(
    id: string,
    quoteId: string,
    options?: RequestOptions,
  ): Promise<{ redemption: { id: string; status: string } }>;
  redemptionStatus(
    id: string,
    options?: RequestOptions,
  ): Promise<{ status: string; redemptions: unknown[] }>;
  tokens(options?: RequestOptions): Promise<SwapTokens>;
  quote(
    params: { tokenOut: string; amountIn: string; slippageBps?: number },
    options?: RequestOptions,
  ): Promise<SwapQuote>;
  session(id: string, options?: RequestOptions): Promise<Session>;
  start(
    id: string,
    options?: RequestOptions & { manual?: boolean },
  ): Promise<Session>;
  pause(id: string, options?: RequestOptions): Promise<Session>;
  refresh(id: string, options?: RequestOptions): Promise<Session>;
  close(id: string, options?: RequestOptions): Promise<Session>;
  observe(id: string, options?: RequestOptions): Promise<BrowserObservation>;
  screenshot(id: string, options?: RequestOptions): Promise<Uint8Array>;
  action(
    id: string,
    action: BrowserAction,
    options?: RequestOptions,
  ): Promise<Session>;
  receipt(id: string, options?: RequestOptions): Promise<Receipt>;
  publicReceipt(token: string, options?: RequestOptions): Promise<unknown>;
  wait(id: string, options?: WaitOptions): Promise<Session>;
  static constructEvent(
    payload: string,
    header: string,
    secret: string,
    options?: { toleranceSec?: number },
  ): Promise<unknown>;
  static publicReceipt(
    token: string,
    options?: { baseUrl?: string; fetch?: typeof fetch },
  ): Promise<unknown>;
}
export function publicReceipt(
  token: string,
  options?: { baseUrl?: string; fetch?: typeof fetch },
): Promise<unknown>;
export function constructEvent(
  payload: string,
  header: string,
  secret: string,
  options?: { toleranceSec?: number },
): Promise<unknown>;
