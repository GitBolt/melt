import { createHash, randomUUID } from "node:crypto";
import {
  erc20Abi,
  formatEther,
  formatUnits,
  parseEther,
  type Address,
} from "viem";
import {
  createEnvelope,
  inferEnvelopePolicy,
  leftoverUsd,
  envelopeSpentUsd,
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
  chain,
  demoOwner,
  deployTask,
  local,
  refreshBalance,
  reconcile,
  vaultCall,
} from "./chain.js";
import { hasModelConfiguration } from "./agent.js";
import {
  quoteSwap,
  buildSwapCall,
  swapAvailable,
  TOKENS,
  UNISWAP,
} from "./swap.js";
import {
  aiPurposeCheck,
  catalogBySku,
  findCatalogOptions,
  offeredOption,
  previewLocalFit,
  remoteCatalog,
  type ExternalItem,
} from "./catalog.js";
import { emit } from "./webhooks.js";
import { errorMessage } from "./errors.js";
import { fulfillGiftCard } from "./issuer.js";

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
  const prior = db
    .prepare("SELECT body FROM envelopes WHERE id=?")
    .get(envelope.id) as { body: string } | undefined;
  if (prior) {
    // Notes and email receipts can arrive while a swap is awaiting the RPC.
    // Keep their latest values when persisting the serialized purchase state.
    const current = JSON.parse(prior.body) as Envelope;
    envelope.thankYou = current.thankYou;
    envelope.giftOpenedAt = current.giftOpenedAt;
    envelope.lastEmailedAt = current.lastEmailedAt;
  }
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

function updateGiftMetadata(
  id: string,
  fields: Partial<
    Pick<Envelope, "thankYou" | "giftOpenedAt" | "lastEmailedAt">
  >,
) {
  const current = { ...readEnvelope(id), ...fields };
  db.prepare("UPDATE envelopes SET body=? WHERE id=?").run(
    JSON.stringify(current),
    id,
  );
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
    const balance = parseEther(task.balance || "0");
    const allowance = parseEther(task.budget) - parseEther(task.spent || "0");
    const left = balance < allowance ? balance : allowance;
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
  if (task.status === "running" || task.status === "closing")
    return "redeeming";
  if (envelope.quotes.some((quote) => quote.status === "processing"))
    return "redeeming";
  if (
    remainingEth(task) <= 1e-8 ||
    (envelope.policy?.maxUsd != null &&
      envelopeSpentUsd(envelope) >= envelope.policy.maxUsd)
  )
    return "exhausted";
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
  envelope.remaining = String(remainingEth(session));
  envelope.spent = session.spent;
  envelope.receiptToken = session.receiptToken;
  envelope.status = envelopeStatus(envelope, session);
  envelope.setupError =
    !session.vault && session.status === "attention"
      ? session.error || "Envelope setup failed"
      : undefined;
  // Presentation must not write a stale purchase snapshot back to storage.
  envelope.timeline = session.events.slice(-40);
  return envelope;
}

export function getEnvelope(id: string) {
  return presentEnvelope(readEnvelope(id));
}

export function listEnvelopes(
  userId: string,
  owner: string,
  emails: string[] = [],
) {
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
      envelope.userId !== userId &&
      canAccessEnvelope(envelope, { id: userId, owner: me, emails })
    )
      received.push(envelope);
  }
  const newest = (a: Envelope, b: Envelope) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return { sent: sent.sort(newest), received: received.sort(newest) };
}

export function canAccessEnvelope(
  envelope: Envelope,
  user: { id: string; owner: string; emails?: string[] },
) {
  if (envelope.userId === user.id) return true;
  if (
    envelope.recipientEmail &&
    user.emails?.some(
      (email) =>
        email.toLowerCase() === envelope.recipientEmail!.trim().toLowerCase(),
    )
  )
    return true;
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
    updateGiftMetadata(envelope.id, { lastEmailedAt: envelope.lastEmailedAt });
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
  let task;
  try {
    task = getByReceiptToken(token);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404)
      throw Object.assign(Error("Gift not found"), { statusCode: 404 });
    throw error;
  }
  const envelope = envelopeBySession(task.id);
  if (!envelope)
    throw Object.assign(Error("Gift not found"), { statusCode: 404 });
  return presentEnvelope(envelope, task);
}

export function publicGift(envelope: Envelope, rate?: number) {
  const cap = envelope.policy?.maxUsd;
  const sentUsd =
    cap && cap > 0 ? cap : rate ? Number(envelope.budget) * rate : undefined;
  const leftEth = Number(envelope.remaining || envelope.budget || 0);
  const leftUsd = leftoverUsd({
    remainingEth: leftEth,
    budgetEth: Number(envelope.budget || 0),
    maxUsd: cap,
    spentUsd: envelopeSpentUsd(envelope),
    rate,
    unfunded: envelope.status === "funding",
  });
  const amount =
    sentUsd && sentUsd > 0
      ? dollars(sentUsd)
      : moneyLabel(envelope.budget, rate);
  const remaining =
    envelope.status === "funding"
      ? amount
      : leftUsd != null
        ? dollars(leftUsd)
        : moneyLabel(envelope.remaining || envelope.budget, rate);
  return {
    object: "gift" as const,
    purpose: envelope.purpose,
    category: envelope.category || envelope.policy?.category,
    senderName: envelope.senderName || "Someone",
    recipientLabel: envelope.recipientLabel,
    note: envelope.note || "",
    status: envelope.status,
    amount,
    remaining,
    sentUsd,
    leftUsd,
    expiresAt: envelope.expiresAt,
    giftOpenedAt: envelope.giftOpenedAt,
    lastEmailedAt: envelope.lastEmailedAt,
    funded: envelope.status !== "funding",
    lastPurchase: envelope.redemptions.at(-1)?.title || "",
    thankYou: envelope.thankYou,
    leftoverReturns: true,
    createdAt: envelope.createdAt,
    url: giftUrl(envelope.receiptToken),
  };
}

function dollars(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 10 ? 0 : 2,
  });
}

function moneyLabel(eth: string, rate?: number) {
  const usd = Number(eth) * (rate || 0);
  if (rate && Number.isFinite(usd) && usd > 0) return dollars(usd);
  return `${eth} ETH`;
}

export async function publicGiftByToken(token: string) {
  return publicGift(giftByToken(token), await ethUsdRate({ wait: false }));
}

export async function publicFitCheck(token: string, request: string) {
  const ask = request.trim();
  if (ask.length < 2)
    throw Object.assign(Error("Say what you want to use it on"), {
      statusCode: 400,
    });
  const envelope = giftByToken(token);
  if (envelope.status === "funding")
    return {
      fits: false,
      reason: "This gift has no funds yet.",
    };
  if (["closed", "exhausted", "expired"].includes(envelope.status))
    return {
      fits: false,
      reason: "This gift is used up or already returned.",
    };
  const ethUsd = (await ethUsdRate({ wait: false })) || 2500;
  const remote = await remoteCatalog(ask, ethUsd).catch(() => []);
  const localResult = previewLocalFit(
    spendingPolicy(envelope),
    Number(envelope.remaining),
    ask,
    ethUsd,
  );
  if (localResult.fits || !remote.length) return localResult;
  return previewLocalFit(
    spendingPolicy(envelope),
    Number(envelope.remaining),
    ask,
    ethUsd,
    remote,
  );
}

export async function publicPreviewFit(
  purpose: string,
  request: string,
  remainingUsd?: number,
) {
  const ask = request.trim();
  const promise = purpose.trim();
  if (promise.length < 4)
    throw Object.assign(Error("Write the purpose first"), { statusCode: 400 });
  if (ask.length < 2)
    throw Object.assign(Error("Say what you want to use it on"), {
      statusCode: 400,
    });
  const policy = inferEnvelopePolicy(promise);
  const ethUsd = (await ethUsdRate({ wait: false })) || 2500;
  const usd =
    remainingUsd != null && Number.isFinite(remainingUsd)
      ? Math.max(0, remainingUsd)
      : (policy.maxUsd ?? 120);
  return {
    ...previewLocalFit(policy, usd / Math.max(ethUsd, 1), ask, ethUsd),
    purpose: policy.purpose,
    category: policy.category,
  };
}

export async function thankGiftSender(token: string, message: string) {
  const envelope = giftByToken(token);
  envelope.thankYou = { message, at: new Date().toISOString() };
  updateGiftMetadata(envelope.id, { thankYou: envelope.thankYou });
  try {
    const task = get(envelope.sessionId);
    event(task, "info", `Thank-you note from the recipient: “${message}”`);
    emit(envelope.userId, "envelope.thanked", task, {
      envelopeId: envelope.id,
      message,
    });
  } catch {
    /* The note is saved even if the session record is unavailable. */
  }
  return publicGift(envelope, await ethUsdRate({ wait: false }));
}

export async function markGiftOpened(token: string) {
  const envelope = giftByToken(token);
  if (!envelope.giftOpenedAt) {
    envelope.giftOpenedAt = new Date().toISOString();
    updateGiftMetadata(envelope.id, { giftOpenedAt: envelope.giftOpenedAt });
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
  if (parsed.maxUsd) {
    const rate = await ethUsdRate();
    parsed.budget = (Math.ceil((parsed.maxUsd / rate) * 1e12) / 1e12).toFixed(
      12,
    );
  }
  const policy = inferEnvelopePolicy(parsed.purpose, {
    category: parsed.category,
    partialUse: parsed.partialUse,
    unusedTo: parsed.unusedTo,
    maxUsd: parsed.maxUsd,
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
    target: UNISWAP.router,
    selector: "0x04e45aaf", // SwapRouter02.exactInputSingle
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
  if (["expired", "closed", "exhausted", "redeeming"].includes(live.status)) {
    return {
      envelopeId: live.id,
      purpose: live.purpose,
      remaining: live.remaining,
      ethUsd,
      options: [],
      rejected: [],
      note:
        live.status === "redeeming"
          ? "A purchase is already processing. Check its receipt before starting another."
          : `This gift is ${live.status}. It cannot be spent. Open the gift details to view its receipt and recovery options.`,
    };
  }
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
    spendingPolicy(live),
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
  if (live.status === "redeeming")
    throw Object.assign(
      Error(
        "A purchase is already processing. Check its receipt before starting another.",
      ),
      { statusCode: 409 },
    );
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

export function spendingPolicy(envelope: Envelope): EnvelopePolicy {
  const spentUsd = envelopeSpentUsd(envelope);
  return {
    ...envelope.policy,
    maxUsd:
      envelope.policy.maxUsd == null
        ? undefined
        : Math.max(0, envelope.policy.maxUsd - spentUsd),
  };
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
  return serial(envelope.sessionId, async () => {
    envelope = getEnvelope(envelope.id);
    if (!sku)
      throw Object.assign(Error("Choose a catalog option"), {
        statusCode: 400,
      });
    const task = get(envelope.sessionId);
    const live = presentEnvelope(envelope, task);
    assertProposable(live);
    const ethUsd = await ethUsdRate();
    let option: CatalogOption | undefined =
      offeredOption(sku, ethUsd) || catalogBySku(sku, ethUsd);
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
    const fit = optionFitsPolicy(
      spendingPolicy(live),
      option,
      remainingEth(task),
      request,
    );
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
  });
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
  return serial(envelope.sessionId, async () => {
    envelope = getEnvelope(envelope.id);
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
        (item.url
          ? `Proposed by an agent: ${item.url}`
          : "Proposed by an agent"),
      priceUsd: item.priceUsd,
      priceEth: (Math.ceil((item.priceUsd / ethUsd) * 1e12) / 1e12).toFixed(12),
      keywords: [],
      tags: item.url ? [item.url] : [],
      settlement: "uniswap",
      tokenSymbol: "USDC",
      source: "agent",
      disclosure:
        "Agent-supplied item and price, not verified merchant inventory. Melt checks the stated price against the gift cap. Testnet settlement does not buy or deliver this item.",
    };
    const fit = optionFitsPolicy(
      spendingPolicy(live),
      option,
      remainingEth(task),
      "",
    );
    if (!fit.ok)
      throw Object.assign(
        Error(fit.reason || "That purchase does not match the gift"),
        { statusCode: 409 },
      );
    const quote = makeQuote(live, option);
    live.quotes.push(quote);
    saveEnvelope(live);
    return { quote, option, policyHash: live.policyHash };
  });
}

async function executeSettlement(
  task: Task,
  amountIn: string,
  tokenOut: string,
) {
  const quote = {
    ...(await quoteSwap({
      tokenOut,
      amountIn,
      slippageBps: 50,
    })),
  };
  const call = buildSwapCall({
    tokenOut: quote.tokenOut as Address,
    recipient: task.vault as Address,
    amountInWei: BigInt(quote.amountInWei),
    minOutWei: BigInt(quote.minOutWei),
    fee: quote.fee,
  });
  await reconcile(task);
  await refreshBalance(task);
  const readTokenBalance = () =>
    client.readContract({
      address: quote.tokenOut as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [task.vault as Address],
    });
  const before = await readTokenBalance();
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
  const after = await readTokenBalance();
  const decimals = TOKENS.find(
    (token) => token.address.toLowerCase() === quote.tokenOut.toLowerCase(),
  )!.decimals;
  quote.amountOut = formatUnits(after - before, decimals);
  const totalHeld = formatUnits(after, decimals);
  const existing = task.assets.find(
    (asset) => asset.token.toLowerCase() === quote.tokenOut.toLowerCase(),
  );
  if (existing) {
    existing.amount = totalHeld;
    existing.symbol = quote.symbol;
  } else {
    task.assets.push({
      token: quote.tokenOut,
      kind: "erc20",
      recovered: false,
      symbol: quote.symbol,
      amount: totalHeld,
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

export async function redeemQuote(
  envelope: Envelope,
  quoteId: string,
  email?: string,
) {
  if (!quoteId)
    throw Object.assign(
      Error(
        "Redeem only accepts a quote from propose_purchase. Unrestricted transfers are not allowed.",
      ),
      { statusCode: 400 },
    );
  return serial(envelope.sessionId, async () => {
    const live = presentEnvelope(readEnvelope(envelope.id));
    const task = get(live.sessionId);
    const quote = live.quotes.find((item) => item.id === quoteId);
    if (!quote)
      throw Object.assign(Error("Quote not found"), { statusCode: 404 });
    if (quote.status !== "proposed")
      throw Object.assign(
        Error(
          quote.status === "processing"
            ? "This purchase is already processing. Check the receipt before trying another purchase."
            : "This quote was already used or closed. Check the receipt or choose another card.",
        ),
        {
          statusCode: 409,
        },
      );
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
    if (
      current.status === "expired" ||
      current.status === "closed" ||
      current.status === "redeeming"
    )
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
    if (chain.id === 1)
      throw Object.assign(
        Error(
          "Live merchant payment is not enabled in this release. Use the Sepolia demo; no funds were moved.",
        ),
        { statusCode: 409 },
      );
    await reconcile(task);
    await refreshBalance(task);
    const availablePolicy = spendingPolicy(live);
    if (
      availablePolicy.maxUsd != null &&
      (quote.amountUsd || 0) > availablePolicy.maxUsd + 0.01
    )
      throw Object.assign(
        Error(
          `This purchase exceeds the remaining $${availablePolicy.maxUsd.toFixed(2)} gift limit. Choose a smaller card.`,
        ),
        { statusCode: 409 },
      );
    if (Number(quote.amountEth) > remainingEth(task) + 1e-12)
      throw Object.assign(
        Error(
          "This quote exceeds the remaining ETH spending allowance. Search again for a smaller card.",
        ),
        { statusCode: 409 },
      );
    const usdc = TOKENS.find(
      (token) => token.symbol === (quote.tokenSymbol || "USDC"),
    );
    if (!usdc) throw Error("Settlement token is not available");
    quote.status = "processing";
    saveEnvelope(live);
    const txCount = task.transactions.length;
    let settled: Awaited<ReturnType<typeof executeSettlement>>;
    try {
      settled = await executeSettlement(task, quote.amountEth, usdc.address);
    } catch (error) {
      const submitted = task.transactions
        .slice(txCount)
        .some(
          (tx) =>
            tx.kind === "Execute dapp transaction" && tx.status !== "reverted",
        );
      quote.status = submitted ? "processing" : "proposed";
      saveEnvelope(live);
      throw Object.assign(
        Error(
          submitted
            ? "A swap transaction was submitted but confirmation is unresolved. Check the receipt; do not submit another purchase yet."
            : `The swap did not complete: ${errorMessage(error)}. Your gift remains available; refresh and try again.`,
        ),
        { statusCode: 502 },
      );
    }
    const { hash, quote: swap } = settled;
    const deliveryEmail = email?.trim() || live.recipientEmail;
    if (deliveryEmail && !live.recipientEmail)
      live.recipientEmail = deliveryEmail;
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
      delivery:
        "Swap confirmed. Checking merchant order validation; no live card has been issued.",
      createdAt: new Date().toISOString(),
      disclosure: quote.disclosure,
      fulfillment: {
        provider: "cryptorefills" as const,
        status: "awaiting_mainnet" as
          "awaiting_mainnet" | "unpayable" | "needs_email" | "issued",
        brand: quote.merchant,
        amountUsd: quote.amountUsd || 0,
        email: deliveryEmail,
      },
    };
    live.redemptions.push(redemption);
    saveEnvelope(presentEnvelope(live, get(task.id)));
    try {
      const issued = await fulfillGiftCard({
        brand: quote.merchant,
        usd: quote.amountUsd || 0,
        email: deliveryEmail,
        chainId: chain.id,
      });
      redemption.delivery = issued.delivery;
      redemption.fulfillment.status = issued.status;
    } catch {
      redemption.delivery =
        "Swap confirmed, but the merchant could not be reached. USDC stays in the vault; no card was issued. Do not repeat the swap.";
      redemption.fulfillment.status = "unpayable";
    }
    saveEnvelope(live);
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
