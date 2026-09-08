import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferEnvelopePolicy,
  optionFitsPolicy,
  looksLikeCashOut,
  mandateText,
  type CatalogOption,
  type Task,
} from "../../../packages/shared/src/index.js";
import { findCatalogOptions, catalogBySku } from "./catalog.js";
import { policyHash } from "./envelopes.js";

const lamp = catalogBySku("apt-lamp", 2500)!;
const tv = catalogBySku("apt-tv", 2500)!;
const esim = catalogBySku("esim-trip-5gb", 2500)!;
const dinner = catalogBySku("dinner-italian", 2500)!;
const game = catalogBySku("game-hades", 2500)!;

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

test("infers a trip data envelope and a dollar cap", () => {
  const policy = inferEnvelopePolicy("mobile data for your trip, up to $20");
  assert.equal(policy.category, "esim");
  assert.equal(policy.maxUsd, 20);
  assert.equal(policy.partialUse, true);
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
  assert.equal(
    optionFitsPolicy(policy, catalogBySku("flight-home", 2500)!, 1).ok,
    false,
  );
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
