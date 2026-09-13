export type GiftFulfillment = {
  provider: "cryptorefills";
  status: "issued" | "awaiting_mainnet" | "needs_email" | "unpayable";
  brand: string;
  amountUsd: number;
  email?: string;
  delivery: string;
  payload: Record<string, unknown>;
  createdOrder: boolean;
  validation?: { ok: boolean; detail?: string };
};

const CR_ORDERS = "https://api.cryptorefills.com/v5/orders";
const CR_VALIDATE = "https://api.cryptorefills.com/v5/orders/validations";

export function issuerPaysOnChain(chainId: number) {
  return chainId === 1;
}

export function giftOrderPayload(input: {
  brand: string;
  usd: number;
  email: string;
}) {
  const amount = Math.round(input.usd * 100) / 100;
  return {
    deliveries: [
      {
        brand_name: input.brand,
        country_code: "US",
        denomination: "range",
        product_value: amount,
        beneficiary_account: input.email,
      },
    ],
    payment: {
      type: "via",
      coin: "USDC",
      network: "Ethereum",
      payment_via: "USER_WALLET",
    },
    user: {
      email: input.email,
      has_accepted_newsletter: false,
    },
    lang: "en",
    acquisition: { utm_source: "melt" },
  };
}

function crHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Cr-Application": process.env.CRYPTOREFILLS_API_KEY || "melt",
    "X-Cr-Version": "1.0",
    "User-Agent": "Melt/1.0",
    "X-Forwarded-For": "127.0.0.1",
  };
}

async function validateOrder(payload: Record<string, unknown>) {
  try {
    const response = await fetch(CR_VALIDATE, {
      method: "POST",
      headers: crHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      problems?: { problem?: string }[];
      detail?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        detail:
          body.detail || body.problems?.[0]?.problem || response.statusText,
      };
    }
    if (body.problems?.length)
      return {
        ok: false,
        detail: body.problems[0]?.problem || "Invalid order",
      };
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Could not reach issuer",
    };
  }
}

export async function fulfillGiftCard(input: {
  brand: string;
  usd: number;
  email?: string;
  chainId: number;
}): Promise<GiftFulfillment> {
  const chainId = input.chainId;
  const brand = input.brand.trim();
  const amountUsd = Math.round(input.usd * 100) / 100;
  const email = input.email?.trim();
  if (!email) {
    const payload = giftOrderPayload({
      brand,
      usd: amountUsd,
      email: "recipient@melt.local",
    });
    return {
      provider: "cryptorefills",
      status: "needs_email",
      brand,
      amountUsd,
      payload,
      createdOrder: false,
      delivery:
        "Swap confirmed. No recipient email was provided, so merchant validation was skipped. No card was purchased or issued; USDC stays in the vault for recovery.",
    };
  }
  const payload = giftOrderPayload({ brand, usd: amountUsd, email });
  const validation = await validateOrder(payload);
  if (!issuerPaysOnChain(chainId)) {
    return {
      provider: "cryptorefills",
      status: "awaiting_mainnet",
      brand,
      amountUsd,
      email,
      payload,
      createdOrder: false,
      validation,
      delivery: validation.ok
        ? "Testnet swap confirmed and merchant order validation passed. No real card was purchased or issued. USDC stays in the vault for recovery."
        : `Testnet swap confirmed. Merchant validation did not pass: ${validation.detail || "issuer unavailable"}. No card was issued. USDC stays in the vault; do not repeat the swap.`,
    };
  }
  // An order is not a payment or proof of delivery.
  return {
    provider: "cryptorefills",
    status: "unpayable",
    brand,
    amountUsd,
    email,
    payload,
    createdOrder: false,
    validation,
    delivery:
      "Live merchant payment and delivery are not enabled in this release. No merchant order was created or card issued.",
  };
}

export const issuerEndpoints = { validate: CR_VALIDATE, orders: CR_ORDERS };
