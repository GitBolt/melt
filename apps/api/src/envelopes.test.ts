import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferEnvelopePolicy,
  optionFitsPolicy,
  looksLikeCashOut,
  mandateText,
  type CatalogOption,
  type Task,
  type Envelope,
} from "../../../packages/shared/src/index.js";
import {
  findCatalogOptions,
  catalogBySku,
  offeredOption,
  previewLocalFit,
} from "./catalog.js";
import { policyHash, publicGift } from "./envelopes.js";

const dinner = catalogBySku("food-ubereats-25", 2500)!;
const game = catalogBySku("game-steam-20", 2500)!;

function option(
  partial: Partial<CatalogOption> & Pick<CatalogOption, "sku" | "title">,
): CatalogOption {
  return {
    merchant: "Test",
    category: "other",
    description: "",
    priceUsd: 10,
    priceEth: "0.004",
    keywords: [],
    tags: [],
    settlement: "uniswap",
    source: "melt",
    disclosure: "test",
    ...partial,
  };
}

const lamp = option({
  sku: "apt-lamp",
  title: "Floor lamp",
  category: "apartment",
  keywords: ["apartment", "lamp", "furniture"],
  priceUsd: 45,
  priceEth: "0.018",
});
const tv = option({
  sku: "apt-tv",
  title: "32-inch television",
  category: "apartment",
  keywords: ["apartment", "tv", "television", "electronics"],
  tags: ["electronics", "tv"],
  priceUsd: 180,
  priceEth: "0.072",
});

test("infers a trip data envelope and a dollar cap", () => {
  const policy = inferEnvelopePolicy("mobile data for your trip, up to $20");
  assert.equal(policy.category, "esim");
  assert.equal(policy.maxUsd, 20);
  assert.equal(policy.partialUse, true);
});

test("except food on a Steam gift stays a game envelope", () => {
  const policy = inferEnvelopePolicy("Steam games, up to $40, except food");
  assert.equal(policy.category, "game");
  assert.ok(policy.deny.some((word) => /food/i.test(word)));
});

test("except electronics becomes a deny list", () => {
  const policy = inferEnvelopePolicy(
    "Something for your new apartment, except electronics",
  );
  assert.equal(policy.category, "apartment");
  assert.ok(policy.deny.includes("electronics"));
  assert.ok(policy.deny.includes("tv"));
  const lampFit = optionFitsPolicy(policy, lamp, 1);
  const tvFit = optionFitsPolicy(policy, tv, 1);
  assert.equal(lampFit.ok, true);
  assert.equal(tvFit.ok, false);
  assert.match(tvFit.reason || "", /tv|electronic/i);
});

test("finds an eSIM and rejects dinner against that gift", async () => {
  const policy = inferEnvelopePolicy(
    "mobile data for your Japan trip, up to $20",
  );
  const found = await findCatalogOptions(
    policy,
    0.05,
    "find an eligible eSIM",
    2500,
  );
  assert.ok(found.options.some((item) => item.sku.startsWith("esim")));
  assert.ok(found.options.some((item) => /japan/i.test(item.title)));
  assert.equal(optionFitsPolicy(policy, dinner, 1, "italian").ok, false);
});

test("indie game envelope stays under $40 and ignores a flight", async () => {
  const policy = inferEnvelopePolicy("Any indie game under $40");
  assert.equal(policy.maxUsd, 40);
  const found = await findCatalogOptions(policy, 1, "an indie game", 2500);
  assert.ok(found.options.every((item) => item.priceUsd <= 40));
  assert.ok(found.options.some((item) => item.sku === game.sku));
  assert.equal(optionFitsPolicy(policy, dinner, 1).ok, false);
});

test("plural and filler words in the request still find matching options", async () => {
  const policy = inferEnvelopePolicy("Any indie game under $40");
  const found = await findCatalogOptions(policy, 1, "find steam games", 2500);
  assert.ok(found.options.some((item) => item.sku === game.sku));
  const food = await findCatalogOptions(
    inferEnvelopePolicy("Food delivery, up to $50"),
    1,
    "get me Uber Eats",
    2500,
  );
  assert.ok(food.options.some((item) => item.sku.startsWith("food-ubereats")));
  const miss = await findCatalogOptions(policy, 1, "skydiving lessons", 2500);
  assert.equal(miss.options.length, 0);
});

function foundFood(found: { options: { category?: string; sku: string }[] }) {
  return found.options.some(
    (item) => item.category === "dinner" || item.sku.startsWith("food-"),
  );
}

test("an option a search served stays proposable via the offered cache", async () => {
  const policy = inferEnvelopePolicy("Any indie game under $40");
  const found = await findCatalogOptions(policy, 1, "an indie game", 2500);
  const served = found.options[0];
  assert.ok(served, "search should return at least one option");
  const cached = offeredOption(served.sku, 2500);
  assert.ok(cached, "served option must be retrievable without re-searching");
  assert.equal(cached!.sku, served.sku);
  assert.equal(cached!.priceUsd, served.priceUsd);
  assert.equal(offeredOption("never-served-sku", 2500), undefined);
});

test("food gifts return Uber Eats cards that fit the remaining funds", async () => {
  const policy = inferEnvelopePolicy("Food delivery, up to $50");
  const funded = await findCatalogOptions(policy, 1, "Uber Eats", 2500);
  assert.ok(foundFood(funded), "a funded food gift must serve Uber Eats");
  assert.ok(funded.options.every((item) => item.priceUsd <= 50));
  const leftover = await findCatalogOptions(
    policy,
    1 / 2500,
    "Uber Eats",
    2500,
  );
  assert.equal(leftover.options.length, 0);
  assert.match(leftover.note || "", /start at/i);
  const lunch = await findCatalogOptions(policy, 1, "DoorDash", 2500);
  assert.ok(foundFood(lunch));
  const gadgets = await findCatalogOptions(policy, 1, "headphones", 2500);
  assert.equal(gadgets.options.length, 0);
});

test("refuses cash-out wording instead of returning a transfer", async () => {
  const policy = inferEnvelopePolicy(
    "Dinner for two, anywhere you like, up to $120",
  );
  const found = await findCatalogOptions(
    policy,
    1,
    "just transfer the money to my wallet",
    2500,
  );
  assert.equal(found.options.length, 0);
  assert.match(found.note || "", /unrestricted cash/i);
  assert.equal(looksLikeCashOut("send me the ETH"), true);
});

test("policy hash is stable for the same conditions", () => {
  const policy = inferEnvelopePolicy(
    "Dinner for two, up to $120, before New Year",
  );
  assert.equal(
    policyHash(policy),
    policyHash({ ...policy, allow: [...policy.allow] }),
  );
  assert.notEqual(
    policyHash(policy),
    policyHash({ ...policy, purpose: "A flight home" }),
  );
});

test("over-budget options are rejected", () => {
  const policy = inferEnvelopePolicy("Dinner for two, up to $120");
  const expensive = option({
    sku: "steak",
    title: "Steak tasting menu",
    category: "dinner",
    priceUsd: 400,
    priceEth: "0.16",
    keywords: ["dinner", "steak"],
  });
  assert.equal(optionFitsPolicy(policy, expensive, 1).ok, false);
  assert.equal(optionFitsPolicy(policy, dinner, 0.0001).ok, false);
});

test("envelope mandate names the promise, not a browser job", () => {
  const text = mandateText(
    {
      envelopeId: "env-1",
      instruction: "mobile data for your trip, up to $20",
      budget: "0.01",
      expiresAt: 1_900_000_000,
      recovery: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      kind: "browse",
    } as Task,
    "ETH",
  );
  assert.match(text, /envelope/i);
  assert.match(text, /mobile data/);
  assert.doesNotMatch(text, /browser job/i);
});

test("public gift quotes the budget in dollars, not leftover remaining", () => {
  const gift = publicGift(
    {
      budget: "0.0004",
      remaining: "0",
      status: "funding",
      purpose: "Any indie game under $40",
      senderName: "Maya",
      recipientLabel: "Alex",
      note: "",
      expiresAt: 1_900_000_000,
      redemptions: [],
      receiptToken: "ab".repeat(24),
    } as unknown as Envelope,
    2500,
  );
  assert.equal(gift.funded, false);
  assert.match(gift.amount, /\$1/);
  assert.doesNotMatch(gift.amount, /ETH/);
  assert.equal(gift.leftoverReturns, true);
  assert.ok(gift.remaining);
});

test("preview fit matches a dinner request and blocks cash-out", () => {
  const policy = inferEnvelopePolicy(
    "Dinner for two, anywhere you like, up to $120",
  );
  const yes = previewLocalFit(policy, 0.05, "Italian near me", 2500);
  assert.equal(yes.fits, true);
  assert.match(yes.reason, /^Yes/);
  assert.doesNotMatch(yes.reason, /Hades/i);
  const cash = previewLocalFit(policy, 0.05, "cash out to my wallet", 2500);
  assert.equal(cash.fits, false);
  const gadgets = previewLocalFit(policy, 0.05, "headphones", 2500);
  assert.equal(gadgets.fits, false);
});

test("preview fit rejects a restaurant against a game gift and never names Hades", () => {
  const policy = inferEnvelopePolicy("Any indie game under $40");
  const restaurant = previewLocalFit(policy, 0.02, "restaurant", 2500);
  assert.equal(restaurant.fits, false);
  assert.match(restaurant.reason, /game/i);
  assert.doesNotMatch(restaurant.reason, /Hades/i);
  const typo = previewLocalFit(policy, 0.02, "restaruent", 2500);
  assert.equal(typo.fits, false);
  const yes = previewLocalFit(policy, 0.02, "indie game", 2500);
  assert.equal(yes.fits, true);
  assert.match(yes.reason, /^Yes/);
  assert.doesNotMatch(yes.reason, /Hades/i);
});

test("public gift uses the typed dollar cap as the sent amount", () => {
  const gift = publicGift(
    {
      budget: "0.0004",
      remaining: "0.01",
      status: "open",
      purpose: "Any indie game under $40",
      category: "game",
      policy: inferEnvelopePolicy("Any indie game under $40"),
      senderName: "Maya",
      recipientLabel: "Alex",
      note: "",
      expiresAt: 1_900_000_000,
      redemptions: [],
      receiptToken: "ab".repeat(24),
    } as unknown as Envelope,
    2500,
  );
  assert.equal(gift.amount, "$40");
  assert.equal(gift.sentUsd, 40);
  assert.ok(gift.leftUsd && gift.leftUsd > 1);
});
