import { test } from "node:test";
import assert from "node:assert/strict";
import {
  meltSignature,
  verifyMeltSignature,
  assertWebhookUrl,
} from "./webhooks.js";

test("Melt-Signature matches Stripe-style HMAC over timestamp and raw body", () => {
  const secret = "whsec_test";
  const payload = '{"id":"evt_1","type":"session.closed"}';
  const header = meltSignature(secret, payload, 1_700_000_000);
  assert.match(header, /^t=1700000000,v1=[0-9a-f]{64}$/);
  const original = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    assert.equal(verifyMeltSignature(secret, payload, header), true);
    assert.equal(verifyMeltSignature(secret, payload + " ", header), false);
    assert.equal(verifyMeltSignature("whsec_other", payload, header), false);
  } finally {
    Date.now = original;
  }
});

test("webhook URLs reject credentials and require HTTPS except local http", () => {
  process.env.RPC_URL = "";
  assert.equal(
    assertWebhookUrl("https://hooks.example.com/melt"),
    "https://hooks.example.com/melt",
  );
  assert.throws(() =>
    assertWebhookUrl("https://user:pass@hooks.example.com/melt"),
  );
  assert.throws(() => assertWebhookUrl("not-a-url"));
});
