import { createHash, randomUUID } from "node:crypto";
import { formatEther, parseEther, type Address } from "viem";
import {
  createEnvelope,
  inferEnvelopePolicy,
  optionFitsPolicy,
  requestTerms,
  stemWord,
  type CatalogOption,
  type CreateEnvelope,
  type Envelope,
  type EnvelopePolicy,
  type EnvelopeQuote,
  type EnvelopeStatus,
  type Task,
} from "../../../packages/shared/src/index.js";
import { db, event, get, getByReceiptToken, save, serial } from "./store.js";
import { giftEmail, giftUrl, mailConfigured, sendMail } from "./mail.js";
import {
  client,
  demoOwner,
  deployTask,
  local,
  refreshBalance,
  reconcile,
  vaultCall,
} from "./chain.js";
import { hasModelConfiguration } from "./agent.js";
import { quoteSwap, buildSwapCall, swapAvailable, TOKENS } from "./swap.js";
import {
  aiPurposeCheck,
  catalogBySku,
  findCatalogOptions,
  offeredOption,
  type ExternalItem,
} from "./catalog.js";
import { emit } from "./webhooks.js";
import { errorMessage } from "./errors.js";

db.exec(`
CREATE TABLE IF NOT EXISTS envelopes(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  body TEXT NOT NULL
);
`);

export function policyHash(policy: EnvelopePolicy) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        allow: [...policy.allow].sort(),
        category: policy.category,
        deny: [...policy.deny].sort(),
        maxUsd: policy.maxUsd ?? null,
        partialUse: policy.partialUse,
        purpose: policy.purpose.trim().toLowerCase(),
        unusedTo: policy.unusedTo,
      }),
    )
    .digest("hex");
}

function saveEnvelope(envelope: Envelope) {
  db.prepare(
    "INSERT OR REPLACE INTO envelopes(id,user_id,session_id,body) VALUES(?,?,?,?)",
  ).run(
    envelope.id,
    envelope.userId,
    envelope.sessionId,
    JSON.stringify(envelope),
  );
  return envelope;
}

function readEnvelope(id: string): Envelope {
  const row = db.prepare("SELECT body FROM envelopes WHERE id=?").get(id) as
    { body: string } | undefined;
  if (!row)
    throw Object.assign(Error("Envelope not found"), { statusCode: 404 });
  return JSON.parse(row.body) as Envelope;
}

export function envelopeBySession(sessionId: string) {
  const row = db
    .prepare("SELECT body FROM envelopes WHERE session_id=?")
    .get(sessionId) as { body?: string } | undefined;
  return row?.body ? (JSON.parse(row.body) as Envelope) : undefined;
}

function remainingEth(task: Task) {
  try {
    const left = parseEther(task.balance || "0");
    return Number(formatEther(left < 0n ? 0n : left));
  } catch {
    return 0;
  }
}

function envelopeStatus(
  envelope: Envelope,
  task: Task,
  now = Date.now(),
): EnvelopeStatus {
  if (!task.vault || task.status === "funding") return "funding";
  if (task.status === "closed") return "closed";
  if (envelope.expiresAt * 1000 <= now) return "expired";
  if (remainingEth(task) <= 1e-8) return "exhausted";
  if (task.status === "running") return "redeeming";
  if (
    !envelope.partialUse &&
    envelope.redemptions.some((item) => item.status === "succeeded")
  )
    return "exhausted";
  return "open";
}

export function presentEnvelope(envelope: Envelope, task?: Task): Envelope {
  const session =
    task || (envelope.sessionId ? get(envelope.sessionId) : undefined);
  if (!session) return envelope;
  envelope.vault = session.vault;
  envelope.remaining = session.balance;
  envelope.spent = session.spent;
  envelope.receiptToken = session.receiptToken;
  envelope.status = envelopeStatus(envelope, session);
  envelope.setupError =
    !session.vault && session.status === "attention"
      ? session.error || "Envelope setup failed"
      : undefined;
  saveEnvelope(envelope);
  return envelope;
}

export function getEnvelope(id: string) {
  return presentEnvelope(readEnvelope(id));
}

export function listEnvelopes(userId: string, owner: string) {
  const rows = db.prepare("SELECT body FROM envelopes").all() as {
    body: string;
  }[];
  const sent: Envelope[] = [];
  const received: Envelope[] = [];
  const me = owner.toLowerCase();
  for (const row of rows) {
    const envelope = presentEnvelope(JSON.parse(row.body) as Envelope);
    if (envelope.userId === userId) sent.push(envelope);
    if (
      envelope.recipientAddress &&
      envelope.recipientAddress.toLowerCase() === me
    )
      received.push(envelope);
  }
  const newest = (a: Envelope, b: Envelope) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return { sent: sent.sort(newest), received: received.sort(newest) };
}

export function canAccessEnvelope(
  envelope: Envelope,
  user: { id: string; owner: string },
) {
  if (envelope.userId === user.id) return true;
  if (
    envelope.recipientAddress &&
    envelope.recipientAddress.toLowerCase() === user.owner.toLowerCase()
  )
    return true;
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function inferEmail(parsed: CreateEnvelope) {
  const explicit = parsed.recipientEmail?.trim() || "";
  if (explicit) return explicit;
  const label = parsed.recipientLabel.trim();
  return EMAIL_RE.test(label) ? label : "";
}

export async function notifyGift(
  envelope: Envelope,
  kind: "sent" | "ready" | "spent",
) {
  const to = envelope.recipientEmail?.trim();
  if (!to || !mailConfigured()) return { sent: false as const };
  try {
    await sendMail(
      to,
      giftEmail(kind, envelope, await ethUsdRate({ wait: false })),
    );
    envelope.lastEmailedAt = new Date().toISOString();
    saveEnvelope(envelope);
    return { sent: true as const };
  } catch (error) {
    try {
      event(
        get(envelope.sessionId),
        "info",
        `Gift email did not send: ${errorMessage(error)}`,
      );
    } catch {
      /* envelope may not have a session yet */
    }
    return { sent: false as const, reason: errorMessage(error) };
  }
}

export async function notifyEnvelopeSession(
  sessionId: string,
  kind: "sent" | "ready" | "spent",
) {
  const envelope = envelopeBySession(sessionId);
  if (envelope) await notifyGift(presentEnvelope(envelope), kind);
}

export function giftByToken(token: string) {
  const task = getByReceiptToken(token);
  const envelope = envelopeBySession(task.id);
  if (!envelope)
    throw Object.assign(Error("Gift not found"), { statusCode: 404 });
  return presentEnvelope(envelope, task);
}

export function publicGift(envelope: Envelope, rate?: number) {
  const usd = Number(envelope.budget) * (rate || 0);
  const amount =
    rate && Number.isFinite(usd) && usd > 0
      ? usd.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: usd >= 10 ? 0 : 2,
        })
      : `${envelope.budget} ETH`;
  return {
    object: "gift" as const,
    purpose: envelope.purpose,
    senderName: envelope.senderName || "Someone",
    recipientLabel: envelope.recipientLabel,
    note: envelope.note || "",
    status: envelope.status,
    amount,
    expiresAt: envelope.expiresAt,
    giftOpenedAt: envelope.giftOpenedAt,
    lastEmailedAt: envelope.lastEmailedAt,
    funded: envelope.status !== "funding",
    lastPurchase: envelope.redemptions.at(-1)?.title || "",
    url: giftUrl(envelope.receiptToken),
  };
}

export async function publicGiftByToken(token: string) {
  return publicGift(giftByToken(token), await ethUsdRate({ wait: false }));
}

export async function markGiftOpened(token: string) {
  const envelope = giftByToken(token);
  if (!envelope.giftOpenedAt) {
    envelope.giftOpenedAt = new Date().toISOString();
    saveEnvelope(envelope);
  }
  return publicGift(envelope, await ethUsdRate({ wait: false }));
}

export async function resendGiftEmail(envelope: Envelope) {
  if (!envelope.recipientEmail)
    throw Object.assign(Error("This gift has no recipient email"), {
      statusCode: 400,
    });
  if (!mailConfigured())
    throw Object.assign(Error("Mail is not configured"), { statusCode: 503 });
  const kind = envelope.redemptions.some((item) => item.status === "succeeded")
    ? "spent"
    : envelope.status === "funding"
      ? "sent"
      : "ready";
  const result = await notifyGift(presentEnvelope(envelope), kind);
  if (!result.sent)
    throw Object.assign(Error(result.reason || "Gift email did not send"), {
      statusCode: 502,
    });
  return { sent: true, lastEmailedAt: envelope.lastEmailedAt };
}

let rateCache: { at: number; rate: number } | undefined;

export async function ethUsdRate(opts?: { wait?: boolean }) {
  if (rateCache && Date.now() - rateCache.at < 45_000) return rateCache.rate;
  const wait = opts?.wait !== false;
  if (!wait) {
    void ethUsdRate({ wait: true });
    return rateCache?.rate ?? 2500;
  }
  let rate = 2500;
  if (await swapAvailable()) {
    try {
      const usdc = TOKENS.find((token) => token.symbol === "USDC");
      if (usdc) {
        const quote = await quoteSwap({
          tokenOut: usdc.address,
          amountIn: "0.01",
          slippageBps: 50,
        });
        const usd = Number(quote.amountOut) * 100;
        if (usd > 100) rate = usd;
      }
    } catch {
      rate = 2500;
    }
  }
  rateCache = { at: Date.now(), rate };
  return rate;
}

export async function createFundedEnvelope(
  user: { id: string; owner: string },
  input: CreateEnvelope,
) {
  const parsed = createEnvelope.parse(input);
  const policy = inferEnvelopePolicy(parsed.purpose, {
    category: parsed.category,
    partialUse: parsed.partialUse,
    unusedTo: parsed.unusedTo,
  });
  const now = Math.floor(Date.now() / 1000);
  const durationMinutes = Math.max(1, Math.ceil((parsed.expiresAt - now) / 60));
  const title =
    parsed.purpose.length > 100
      ? `${parsed.purpose.slice(0, 97)}…`
      : parsed.purpose;
  const task: Task = {
    title,
    instruction: parsed.purpose,
    url: "",
    budget: parsed.budget,
    durationMinutes,
    target: "",
    selector: "",
    recovery: user.owner || demoOwner.address,
    kind: "browse",
    id: randomUUID(),
    userId: user.id,
    vault: "",
    createdAt: new Date().toISOString(),
    expiresAt: parsed.expiresAt,
    status: "funding",
    spent: "0",
    balance: "0",
    returned: "0",
    events: [],
    transactions: [],
    assets: [],
    agentMode: hasModelConfiguration() ? "model" : "manual",
    outcome: "pending",
    envelopeId: "",
  };
  const envelope: Envelope = {
    object: "envelope",
    id: randomUUID(),
    userId: user.id,
    sessionId: task.id,
    vault: "",
    senderAddress: user.owner,
    senderName: parsed.senderName || "",
    recipientLabel: parsed.recipientLabel,
    recipientEmail: inferEmail(parsed),
    recipientAddress: parsed.recipientAddress || "",
    note: parsed.note || "",
    purpose: parsed.purpose,
    category: policy.category,
    budget: parsed.budget,
    remaining: parsed.budget,
    spent: "0",
    expiresAt: parsed.expiresAt,
    partialUse: parsed.partialUse,
    unusedTo: "sender",
    policy,
    policyHash: policyHash(policy),
    status: "funding",
    createdAt: task.createdAt,
    quotes: [],
    redemptions: [],
  };
  task.envelopeId = envelope.id;
  save(task);
  event(task, "info", `Envelope created: ${parsed.purpose}`);
  try {
    await deployTask(task);
  } catch (error) {
    task.status = "attention";
    task.error = setupErrorMessage(error);
    event(task, "error", task.error);
    save(task);
  }
  envelope.vault = task.vault;
  envelope.remaining = task.balance;
  envelope.spent = task.spent;
  envelope.receiptToken = task.receiptToken;
  envelope.status = envelopeStatus(envelope, task);
  saveEnvelope(envelope);
  emit(user.id, "envelope.created", task, {
    envelopeId: envelope.id,
    purpose: envelope.purpose,
    policyHash: envelope.policyHash,
  });
  if (envelope.status !== "funding")
    emit(user.id, "envelope.funded", task, { envelopeId: envelope.id });
  if (parsed.notifyRecipient !== false)
    await notifyGift(
      envelope,
      envelope.status === "funding" ? "sent" : "ready",
    );
  return presentEnvelope(envelope, task);
}

/* Public fork RPCs stop serving state for old blocks, so a long-running local
   fork starts failing vault deploys with an opaque "internal error". Translate
   it into something a person can act on. */
function setupErrorMessage(error: unknown) {
  const message = errorMessage(error);
  if (local && /internal error/i.test(message))
    return "The local fork lost access to upstream chain state (free fork RPCs only serve recent blocks). Restart `npm run dev` for a fresh fork, then press Retry setup.";
  return message;
}

export async function retryEnvelopeSetup(envelope: Envelope) {
  return serial(`envelope:${envelope.id}`, async () => {
    const task = get(envelope.sessionId);
    if (task.vault) return presentEnvelope(readEnvelope(envelope.id), task);
    task.status = "funding";
    task.error = undefined;
    save(task);
    try {
      await deployTask(task);
      event(task, "success", "Envelope address created after retry.");
    } catch (error) {
      task.status = "attention";
      task.error = setupErrorMessage(error);
      event(task, "error", task.error);
      save(task);
    }
    return presentEnvelope(readEnvelope(envelope.id), get(envelope.sessionId));
  });
}

export async function findEnvelopeOptions(envelope: Envelope, request = "") {
  const task = get(envelope.sessionId);
  const live = presentEnvelope(envelope, task);
  const ethUsd = await ethUsdRate();
  if (live.status === "funding") {
    return {
      envelopeId: live.id,
      purpose: live.purpose,
      remaining: live.remaining,
      ethUsd,
      settlement: "Uniswap V3 ETH → USDC",
      options: [],
      rejected: [],
      note: "This gift has no funds yet. Send ETH to the envelope address first.",
    };
  }
  const found = await findCatalogOptions(
    live.policy,
    remainingEth(task),
    request,
    ethUsd,
  );
  return {
    envelopeId: live.id,
    purpose: live.purpose,
    remaining: live.remaining,
    ethUsd,
    settlement: "Uniswap V3 ETH → USDC",
    ...found,
  };
}

function assertProposable(live: Envelope) {
  if (live.status === "expired")
    throw Object.assign(Error("This envelope has expired"), {
      statusCode: 409,
    });
  if (live.status === "closed")
    throw Object.assign(Error("This envelope is closed"), { statusCode: 409 });
  if (live.status === "funding")
    throw Object.assign(
      Error("Fund the envelope before proposing a purchase"),
      {
        statusCode: 409,
      },
    );
  if (live.status === "exhausted")
    throw Object.assign(Error("This envelope has no remaining funds"), {
      statusCode: 409,
    });
}

function makeQuote(live: Envelope, option: CatalogOption): EnvelopeQuote {
  return {
    id: randomUUID(),
    envelopeId: live.id,
    sku: option.sku,
    title: option.title,
    merchant: option.merchant,
    amountEth: option.priceEth || "0",
    amountUsd: option.priceUsd,
    settlement: option.settlement,
    tokenSymbol: option.tokenSymbol,
    source: option.source,
    disclosure: option.disclosure,
    createdAt: new Date().toISOString(),
    expiresAt: Math.floor(Date.now() / 1000) + 15 * 60,
    status: "proposed",
  };
}

export async function proposePurchase(
  envelope: Envelope,
  sku: string,
  request = "",
) {
  if (!sku)
    throw Object.assign(Error("Choose a catalog option"), { statusCode: 400 });
  const task = get(envelope.sessionId);
  const live = presentEnvelope(envelope, task);
  assertProposable(live);
  const ethUsd = await ethUsdRate();
  let option: CatalogOption | undefined =
    catalogBySku(sku, ethUsd) || offeredOption(sku, ethUsd);
  if (!option) {
    const found = await findCatalogOptions(
      live.policy,
      remainingEth(task),
      request,
      ethUsd,
    );
    option = found.options.find((item) => item.sku === sku);
  }
  if (!option)
    throw Object.assign(
      Error("That option is not available for this envelope"),
      {
        statusCode: 404,
      },
    );
  /* Enforce only the deterministic policy here (deny list, caps, category,
     remaining funds). The free-text request already shaped the option list;
     re-running keyword matching against it would reject semantic matches. */
  const fit = optionFitsPolicy(live.policy, option, remainingEth(task), "");
  if (!fit.ok)
    throw Object.assign(
      Error(fit.reason || "That purchase does not match the gift"),
      {
        statusCode: 409,
      },
    );
  const quote = makeQuote(live, option);
  live.quotes.push(quote);
  saveEnvelope(live);
  return { quote, option, policyHash: live.policyHash };
}

function assertPublicMerchantUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(Error("Item url must be a valid https URL"), {
      statusCode: 400,
    });
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    host === "localhost" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".")
  )
    throw Object.assign(Error("Item url must be a public https URL"), {
      statusCode: 400,
    });
}

/* An external agent proposes something it found anywhere on the web. The
   model audits purpose fit and classifies the category; the deterministic
   gate then enforces the deny list, caps, and remaining funds exactly as it
   does for catalog options. Without a configured model the item text must
   share a stem with the gift's promise. */
export async function proposeExternalPurchase(
  envelope: Envelope,
  item: ExternalItem,
) {
  const task = get(envelope.sessionId);
  const live = presentEnvelope(envelope, task);
  assertProposable(live);
  if (item.url) assertPublicMerchantUrl(item.url);
  const verdict = await aiPurposeCheck(live.policy, item);
  if (verdict && !verdict.fits)
    throw Object.assign(
      Error(verdict.reason || "That item does not serve this gift's purpose"),
      { statusCode: 409 },
    );
  if (!verdict) {
    const hay =
      `${item.title} ${item.merchant} ${item.description || ""}`.toLowerCase();
    const stems = requestTerms(live.policy.purpose).map(stemWord);
    if (!stems.some((stem) => hay.includes(stem)))
      throw Object.assign(
        Error(
          "Melt could not verify this item against the gift's purpose. Describe the item so it clearly relates to the promise.",
        ),
        { statusCode: 409 },
      );
  }
  const ethUsd = await ethUsdRate();
  const option: CatalogOption = {
    sku: `agent-${randomUUID().slice(0, 12)}`,
    title: item.title,
    merchant: item.merchant,
    category: verdict?.category || live.policy.category,
    description:
      item.description ||
      (item.url ? `Proposed by an agent: ${item.url}` : "Proposed by an agent"),
    priceUsd: item.priceUsd,
    priceEth: (item.priceUsd / ethUsd).toFixed(8),
    keywords: [],
    tags: item.url ? [item.url] : [],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "agent",
    disclosure:
      "Proposed by the recipient's agent, not the Melt catalog. Melt verified the price against the gift's policy; merchant fulfillment happens outside this quote.",
  };
  const fit = optionFitsPolicy(live.policy, option, remainingEth(task), "");
  if (!fit.ok)
    throw Object.assign(
      Error(fit.reason || "That purchase does not match the gift"),
      { statusCode: 409 },
    );
  const quote = makeQuote(live, option);
  live.quotes.push(quote);
  saveEnvelope(live);
  return { quote, option, policyHash: live.policyHash };
}

async function executeSettlement(
  task: Task,
  amountIn: string,
  tokenOut: string,
) {
  const quote = await quoteSwap({
    tokenOut,
    amountIn,
    slippageBps: 50,
  });
  const call = buildSwapCall({
    tokenOut: quote.tokenOut as Address,
    recipient: task.vault as Address,
    amountInWei: BigInt(quote.amountInWei),
    minOutWei: BigInt(quote.minOutWei),
    fee: quote.fee,
  });
  await reconcile(task);
  await refreshBalance(task);
  await client.call({
    account: task.vault as Address,
    to: call.to,
    value: call.value,
    data: call.data,
  });
  const hash = await vaultCall(
    task,
    "execute",
    [call.to, call.value, call.data],
    "Execute dapp transaction",
  );
  await refreshBalance(task);
  const existing = task.assets.find(
    (asset) => asset.token.toLowerCase() === quote.tokenOut.toLowerCase(),
  );
  if (existing) {
    existing.amount = quote.amountOut;
    existing.symbol = quote.symbol;
  } else {
    task.assets.push({
      token: quote.tokenOut,
      kind: "erc20",
      recovered: false,
      symbol: quote.symbol,
      amount: quote.amountOut,
    });
  }
  save(task);
  event(
    task,
    "success",
    `Envelope settled ${quote.amountIn} ETH → ${Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${quote.symbol} on Uniswap`,
    hash,
  );
  emit(task.userId, "swap.executed", task, {
    amountOut: quote.amountOut,
    symbol: quote.symbol,
    hash,
    envelopeId: task.envelopeId,
  });
  return { hash, quote };
}

export async function redeemQuote(envelope: Envelope, quoteId: string) {
  if (!quoteId)
    throw Object.assign(
      Error(
        "Redeem only accepts a quote from propose_purchase. Unrestricted transfers are not allowed.",
      ),
      { statusCode: 400 },
    );
  return serial(`envelope:${envelope.id}`, async () => {
    const live = presentEnvelope(readEnvelope(envelope.id));
    const task = get(live.sessionId);
    const quote = live.quotes.find((item) => item.id === quoteId);
    if (!quote)
      throw Object.assign(Error("Quote not found"), { statusCode: 404 });
    if (quote.status !== "proposed")
      throw Object.assign(Error("This quote is no longer open"), {
        statusCode: 409,
      });
    if (quote.expiresAt < Math.floor(Date.now() / 1000)) {
      quote.status = "expired";
      saveEnvelope(live);
      throw Object.assign(
        Error("This quote expired. Propose the purchase again."),
        {
          statusCode: 409,
        },
      );
    }
    const current = presentEnvelope(live, task);
    if (current.status === "funding")
      throw Object.assign(Error("Fund the envelope before redeeming"), {
        statusCode: 409,
      });
    if (current.status === "expired" || current.status === "closed")
      throw Object.assign(Error("This envelope can no longer be redeemed"), {
        statusCode: 409,
      });
    if (current.status === "exhausted")
      throw Object.assign(Error("This envelope has no remaining funds"), {
        statusCode: 409,
      });
    if (!(await swapAvailable()))
      throw Object.assign(
        Error(
          "Settlement converts the required ETH to USDC on Uniswap. Run on a Uniswap-enabled network.",
        ),
        { statusCode: 503 },
      );
    const usdc = TOKENS.find(
      (token) => token.symbol === (quote.tokenSymbol || "USDC"),
    );
    if (!usdc) throw Error("Settlement token is not available");
    const { hash, quote: swap } = await executeSettlement(
      task,
      quote.amountEth,
      usdc.address,
    );
    quote.status = "redeemed";
    const redemption = {
      id: randomUUID(),
      quoteId: quote.id,
      sku: quote.sku,
      title: quote.title,
      merchant: quote.merchant,
      amountEth: quote.amountEth,
      amountOut: swap.amountOut,
      symbol: swap.symbol,
      hash,
      status: "succeeded" as const,
      delivery: `${quote.title} reserved. ${swap.amountOut} ${swap.symbol} is in the envelope vault.`,
      createdAt: new Date().toISOString(),
      disclosure: quote.disclosure,
    };
    live.redemptions.push(redemption);
    saveEnvelope(presentEnvelope(live, get(task.id)));
    await notifyGift(getEnvelope(live.id), "spent");
    emit(task.userId, "envelope.redeemed", get(task.id), {
      envelopeId: live.id,
      quoteId: quote.id,
      sku: quote.sku,
      hash,
    });
    return {
      envelope: getEnvelope(live.id),
      redemption,
      quote,
    };
  });
}

export function redemptionStatus(envelope: Envelope) {
  const live = presentEnvelope(envelope);
  return {
    envelopeId: live.id,
    status: live.status,
    remaining: live.remaining,
    spent: live.spent,
    redemptions: live.redemptions,
    openQuotes: live.quotes.filter((item) => item.status === "proposed"),
    policyHash: live.policyHash,
  };
}
