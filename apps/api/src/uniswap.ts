import { z } from "zod";
import { isAddress } from "viem";
import { randomUUID } from "node:crypto";
import { address } from "../../../packages/shared/src/index.js";
import { chain } from "./chain.js";
const input = z.object({
  tokenIn: address,
  tokenOut: address,
  amount: z
    .string()
    .regex(/^[1-9]\d*$/)
    .max(78),
  slippageTolerance: z.number().min(0.1).max(1).default(0.5),
});
const quotes = new Map<string, { owner: string; expires: number; data: any }>();
async function api(path: string, body: unknown) {
  if (!process.env.UNISWAP_API_KEY)
    throw Error("Add UNISWAP_API_KEY to enable conversion quotes");
  const response = await fetch(
    `https://trade-api.gateway.uniswap.org/v1/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.UNISWAP_API_KEY,
        "x-universal-router-version": "2.0",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw Error(
      `Uniswap ${path} failed (${response.status}); no transaction was sent`,
    );
  return response.json() as Promise<any>;
}
export async function uniswapQuote(body: unknown, owner: string) {
  const data = input.parse(body);
  const result = await api("quote", {
    ...data,
    type: "EXACT_INPUT",
    tokenInChainId: chain.id,
    tokenOutChainId: chain.id,
    swapper: owner,
    recipient: owner,
    protocols: ["V2", "V3"],
    routingPreference: "BEST_PRICE",
    permitAmount: "EXACT",
  });
  if (!["CLASSIC", "WRAP", "UNWRAP"].includes(result.routing))
    throw Error("Unsupported route; no transaction was sent");
  for (const [key, entry] of quotes)
    if (entry.expires < Date.now()) quotes.delete(key);
  if (result.permitData) {
    const permit = result.permitData;
    if (
      permit.values?.details?.token?.toLowerCase() !==
        data.tokenIn.toLowerCase() ||
      BigInt(permit.values.details.amount) !== BigInt(data.amount) ||
      Number(permit.domain.chainId) !== chain.id
    )
      throw Error("Unexpected permit permission; no transaction was sent");
  }
  const id = randomUUID();
  quotes.set(id, { owner, expires: Date.now() + 30000, data: result });
  return { id, expiresAt: Date.now() + 30000, ...result };
}
export async function prepareSwap(body: unknown, owner: string) {
  const { id, signature } = z
    .object({
      id: z.string().uuid(),
      signature: z
        .string()
        .regex(/^0x[0-9a-fA-F]+$/)
        .optional(),
    })
    .parse(body);
  const entry = quotes.get(id);
  if (
    !entry ||
    entry.owner.toLowerCase() !== owner.toLowerCase() ||
    entry.expires < Date.now()
  )
    throw Error("Quote expired; request a new quote");
  if (entry.data.permitData && !signature)
    throw Error("Approve this exact permit in your own wallet first");
  quotes.delete(id);
  const swap = await api("swap", {
    quote: entry.data.quote,
    simulateTransaction: true,
    safetyMode: "SAFE",
    deadline: Math.floor(Date.now() / 1000) + 120,
    ...(entry.data.permitData
      ? { permitData: entry.data.permitData, signature }
      : {}),
  });
  const tx = swap.swap;
  if (
    !tx ||
    tx.from?.toLowerCase() !== owner.toLowerCase() ||
    !isAddress(tx.to) ||
    Number(tx.chainId) !== chain.id ||
    !/^0x([0-9a-fA-F]{2})+$/.test(tx.data) ||
    BigInt(tx.value || 0) < 0n
  )
    throw Error("Unexpected swap transaction; no transaction was sent");
  return swap;
}
export async function checkApproval(body: unknown, owner: string) {
  const { token, amount } = z
    .object({
      token: address,
      amount: z
        .string()
        .regex(/^[1-9]\d*$/)
        .max(78),
    })
    .parse(body);
  return api("check_approval", {
    walletAddress: owner,
    token,
    amount,
    chainId: chain.id,
  });
}
