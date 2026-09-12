import { test } from "node:test";
import assert from "node:assert/strict";
import { giftEmail } from "./mail.js";
import type { Envelope } from "../../../packages/shared/src/index.js";

function envelope(partial: Partial<Envelope> = {}): Envelope {
  return {
    object: "envelope",
    id: "env_1",
    userId: "user_1",
    sessionId: "task_1",
    vault: "0x123",
    senderAddress: "0xabc",
    senderName: "Maya",
    recipientLabel: "Alex",
    recipientEmail: "heyaabis@gmail.com",
    recipientAddress: "",
    note: "Happy birthday. This is for you.",
    purpose: "Steam games, up to $40",
    category: "game",
    budget: "0.00146",
    remaining: "0.00146",
    spent: "0",
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
    partialUse: true,
    unusedTo: "sender",
    policy: {
      purpose: "Steam games, up to $40",
      category: "game",
      allow: ["steam"],
      deny: [],
      maxUsd: 40,
      partialUse: true,
      unusedTo: "sender",
    },
    policyHash: "0xhash",
    status: "funding",
    createdAt: new Date().toISOString(),
    receiptToken: "ff2441aade658ec2d7d88fb94ebcabf63281b59c4ccee36d",
    quotes: [],
    redemptions: [],
    ...partial,
  };
}

test("gift email keeps the dollar cap when the ETH rate fallback is wrong", () => {
  const mail = giftEmail("sent", envelope(), 2500);
  assert.match(mail.html, /set aside \$40 for you/);
  assert.match(mail.html, /Up to \$40/);
  assert.doesNotMatch(mail.html, /\$3\.65/);
});

test("gift email falls back to ETH when there is no dollar cap or rate", () => {
  const mail = giftEmail(
    "sent",
    envelope({
      budget: "0.5",
      policy: {
        purpose: "Mint the demo NFT",
        category: "other",
        allow: [],
        deny: [],
        partialUse: true,
        unusedTo: "sender",
      },
    }),
  );
  assert.match(mail.html, /0\.5 ETH/);
});
