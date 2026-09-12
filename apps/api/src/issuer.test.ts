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

test("mainnet with an API key posts a Cryptorefills order", async () => {
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
    assert.equal(result.status, "issued");
    assert.equal(result.createdOrder, true);
    assert.ok(calls.includes(issuerEndpoints.validate));
    assert.ok(calls.includes(issuerEndpoints.orders));
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.CRYPTOREFILLS_API_KEY;
    else process.env.CRYPTOREFILLS_API_KEY = key;
  }
});
