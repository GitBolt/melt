import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fulfillGiftCard,
  giftOrderPayload,
  issuerPaysOnChain,
  issuerEndpoints,
} from "./issuer.js";

test("builds a Cryptorefills USDC order for the recipient email", () => {
  const payload = giftOrderPayload({
    brand: "Uber Eats",
    usd: 25,
    email: "alex@example.com",
  });
  assert.equal(payload.deliveries[0].brand_name, "Uber Eats");
  assert.equal(payload.deliveries[0].product_value, 25);
  assert.equal(payload.deliveries[0].beneficiary_account, "alex@example.com");
  assert.equal(payload.payment.coin, "USDC");
  assert.equal(payload.payment.network, "Ethereum");
  assert.equal(payload.payment.payment_via, "USER_WALLET");
});

test("Sepolia never creates a Cryptorefills order", async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await fulfillGiftCard({
      brand: "Uber Eats",
      usd: 25,
      email: "alex@example.com",
      chainId: 11155111,
    });
    assert.equal(result.status, "awaiting_mainnet");
    assert.equal(result.createdOrder, false);
    assert.equal(
      calls.some((url) => url === issuerEndpoints.orders),
      false,
    );
    assert.ok(calls.includes(issuerEndpoints.validate));
    assert.match(result.delivery, /testnet/i);
  } finally {
    globalThis.fetch = original;
  }
});

test("a missing email does not hit the issuer", async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await fulfillGiftCard({
      brand: "Steam",
      usd: 20,
      chainId: 1,
    });
    assert.equal(result.status, "needs_email");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("only Ethereum mainnet is treated as payable", () => {
  assert.equal(issuerPaysOnChain(1), true);
  assert.equal(issuerPaysOnChain(11155111), false);
  assert.equal(issuerPaysOnChain(31337), false);
});

test("merchant rejection is visible without creating a paid order", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        problems: [{ problem: "Minimum denomination is $15" }],
      }),
      { status: 400 },
    )) as typeof fetch;
  try {
    const result = await fulfillGiftCard({
      brand: "Uber Eats",
      usd: 1,
      email: "alex@example.com",
      chainId: 11155111,
    });
    assert.equal(result.validation?.ok, false);
    assert.equal(result.createdOrder, false);
    assert.match(result.delivery, /Minimum denomination is \$15/);
    assert.match(result.delivery, /No card was issued/);
  } finally {
    globalThis.fetch = original;
  }
});

test("merchant network failure preserves an explicit settlement-only outcome", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw Error("Merchant unavailable");
  }) as typeof fetch;
  try {
    const result = await fulfillGiftCard({
      brand: "Razer Gold USD",
      usd: 1,
      email: "alex@example.com",
      chainId: 11155111,
    });
    assert.equal(result.createdOrder, false);
    assert.equal(result.validation?.ok, false);
    assert.match(result.delivery, /Merchant unavailable/);
    assert.match(result.delivery, /do not repeat the swap/);
  } finally {
    globalThis.fetch = original;
  }
});

test("mainnet does not claim issuance or create an unpaid order", async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  const key = process.env.CRYPTOREFILLS_API_KEY;
  process.env.CRYPTOREFILLS_API_KEY = "test-key";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return new Response(JSON.stringify({ id: "ord_1" }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await fulfillGiftCard({
      brand: "Steam",
      usd: 20,
      email: "alex@example.com",
      chainId: 1,
    });
    assert.equal(result.status, "unpayable");
    assert.equal(result.createdOrder, false);
    assert.ok(calls.includes(issuerEndpoints.validate));
    assert.equal(calls.includes(issuerEndpoints.orders), false);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.CRYPTOREFILLS_API_KEY;
    else process.env.CRYPTOREFILLS_API_KEY = key;
  }
});
