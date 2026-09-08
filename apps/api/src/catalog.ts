import {
  optionFitsPolicy,
  looksLikeCashOut,
  type CatalogOption,
  type EnvelopePolicy,
} from "../../../packages/shared/src/index.js";

const MELT =
  "Melt catalog. Settlement converts only the required ETH to USDC on Uniswap. This is not a store gift card.";
const CRYPTOREFILLS =
  "Powered by Cryptorefills. Cryptorefills is the merchant of record for this product.";

const LOCAL: CatalogOption[] = [
  {
    sku: "esim-jp-1gb",
    title: "Japan eSIM · 1 GB / 7 days",
    merchant: "Melt catalog",
    category: "esim",
    description: "Prepaid mobile data for a short trip to Japan.",
    priceUsd: 8,
    keywords: ["esim", "japan", "mobile", "data", "trip", "roaming"],
    tags: ["esim", "travel"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "esim-trip-5gb",
    title: "Travel eSIM · 5 GB / 30 days",
    merchant: "Melt catalog",
    category: "esim",
    description: "A month of mobile data in supported countries.",
    priceUsd: 18,
    keywords: ["esim", "mobile", "data", "trip", "travel"],
    tags: ["esim", "travel"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "esim-global-1gb",
    title: "Global eSIM · 1 GB",
    merchant: "Melt catalog",
    category: "esim",
    description: "Low-value data pack for testing a real trip envelope.",
    priceUsd: 5,
    keywords: ["esim", "mobile", "data", "global"],
    tags: ["esim"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "dinner-italian",
    title: "Italian dinner for two",
    merchant: "Any Italian restaurant",
    category: "dinner",
    description:
      "A sit-down Italian meal. The recipient picks the place later.",
    priceUsd: 85,
    keywords: ["dinner", "italian", "restaurant", "for two", "pasta"],
    tags: ["dinner"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "dinner-omakase",
    title: "Dinner for two, any kitchen",
    merchant: "Any restaurant",
    category: "dinner",
    description: "Open-ended dinner. Cuisine is up to the recipient.",
    priceUsd: 120,
    keywords: ["dinner", "restaurant", "for two", "food"],
    tags: ["dinner"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "concert-any",
    title: "Concert ticket",
    merchant: "Any live venue",
    category: "concert",
    description: "One ticket to a show the recipient actually wants.",
    priceUsd: 95,
    keywords: ["concert", "ticket", "show", "live", "gig"],
    tags: ["concert"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "flight-home",
    title: "Flight home",
    merchant: "Any airline",
    category: "flight",
    description: "One-way or return fare home, chosen when they book.",
    priceUsd: 380,
    keywords: ["flight", "home", "thanksgiving", "airfare"],
    tags: ["flight"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "game-hades",
    title: "Hades",
    merchant: "Indie game",
    category: "game",
    description: "A well-known indie game under $40.",
    priceUsd: 25,
    keywords: ["game", "indie", "hades"],
    tags: ["game"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "game-celeste",
    title: "Celeste",
    merchant: "Indie game",
    category: "game",
    description: "An indie platformer well under $40.",
    priceUsd: 20,
    keywords: ["game", "indie", "celeste"],
    tags: ["game"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "apt-lamp",
    title: "Floor lamp",
    merchant: "Home goods",
    category: "apartment",
    description: "Lighting for a new apartment. Not a gadget.",
    priceUsd: 45,
    keywords: ["apartment", "lamp", "furniture", "home"],
    tags: ["apartment", "furniture"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "apt-linens",
    title: "Bedding set",
    merchant: "Home goods",
    category: "apartment",
    description: "Sheets and a duvet for a new place.",
    priceUsd: 60,
    keywords: ["apartment", "bedding", "home", "linens"],
    tags: ["apartment"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "apt-tv",
    title: "32-inch television",
    merchant: "Electronics",
    category: "apartment",
    description: "A TV. Should be rejected by gifts that exclude electronics.",
    priceUsd: 180,
    keywords: ["apartment", "tv", "television", "electronics"],
    tags: ["electronics", "tv"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "ai-claude",
    title: "One month of Claude Pro",
    merchant: "Anthropic",
    category: "ai",
    description: "A month of an AI product the recipient can actually use.",
    priceUsd: 20,
    keywords: ["ai", "claude", "subscription", "month"],
    tags: ["ai"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
  {
    sku: "ai-chatgpt",
    title: "One month of ChatGPT Plus",
    merchant: "OpenAI",
    category: "ai",
    description: "A month of ChatGPT Plus.",
    priceUsd: 20,
    keywords: ["ai", "chatgpt", "subscription", "month"],
    tags: ["ai"],
    settlement: "uniswap",
    tokenSymbol: "USDC",
    source: "melt",
    disclosure: MELT,
  },
];

function withEthPrice(item: CatalogOption, ethUsd: number): CatalogOption {
  const priceEth = (item.priceUsd / Math.max(ethUsd, 1)).toFixed(6);
  return { ...item, priceEth };
}

function parseCryptorefills(body: unknown, ethUsd: number): CatalogOption[] {
  if (!body || typeof body !== "object") return [];
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { products?: unknown }).products)
      ? (body as { products: unknown[] }).products
      : Array.isArray((body as { data?: unknown }).data)
        ? (body as { data: unknown[] }).data
        : [];
  const out: CatalogOption[] = [];
  for (const row of rows.slice(0, 12)) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const title = String(item.name || item.title || item.productName || "");
    const price = Number(item.price || item.amount || item.minPrice || 0);
    if (!title || !(price > 0) || price > 80) continue;
    const hay =
      `${title} ${item.brand || ""} ${item.category || ""}`.toLowerCase();
    const esim = /esim|e-sim|data|airalo|mobile/.test(hay);
    out.push(
      withEthPrice(
        {
          sku: `cr-${String(item.id || item.sku || title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 48)}`,
          title,
          merchant: String(item.brand || "Cryptorefills"),
          category: esim ? "esim" : "other",
          description: String(
            item.description ||
              "Delivered by Cryptorefills after crypto payment.",
          ),
          priceUsd: price,
          keywords: hay.split(/\W+/).filter((part) => part.length > 2),
          tags: esim ? ["esim"] : ["catalog"],
          settlement: "uniswap",
          tokenSymbol: "USDC",
          source: "cryptorefills",
          disclosure: CRYPTOREFILLS,
        },
        ethUsd,
      ),
    );
  }
  return out;
}

export async function remoteCatalog(
  query: string,
  ethUsd: number,
): Promise<CatalogOption[]> {
  if (
    !process.env.CRYPTOREFILLS_API_KEY &&
    process.env.MELT_REMOTE_CATALOG !== "1"
  )
    return [];
  const q = encodeURIComponent(query || "esim");
  const urls = [
    `https://api.cryptorefills.com/v5/products?search=${q}&country=US`,
    `https://api.cryptorefills.com/v5/products?q=${q}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
        redirect: "error",
      });
      if (!response.ok) continue;
      const type = response.headers.get("content-type") || "";
      if (!type.includes("json")) continue;
      return parseCryptorefills(await response.json(), ethUsd);
    } catch {
      /* Public catalog is optional; Melt's own catalog still works. */
    }
  }
  return [];
}

export async function findCatalogOptions(
  policy: EnvelopePolicy,
  remainingEth: number,
  request: string,
  ethUsd: number,
): Promise<{
  options: (CatalogOption & { score: number })[];
  rejected: { sku: string; title: string; reason: string }[];
  note?: string;
}> {
  if (looksLikeCashOut(request))
    return {
      options: [],
      rejected: [],
      note: "An envelope cannot send unrestricted cash. Propose a purchase that matches the gift.",
    };
  const priced = LOCAL.map((item) => withEthPrice(item, ethUsd));
  const remote = await remoteCatalog(request || policy.purpose, ethUsd).catch(
    () => [],
  );
  const seen = new Set<string>();
  const rejected: { sku: string; title: string; reason: string }[] = [];
  const options: (CatalogOption & { score: number })[] = [];
  for (const item of [...remote, ...priced]) {
    if (seen.has(item.sku)) continue;
    seen.add(item.sku);
    const match = optionFitsPolicy(policy, item, remainingEth, request);
    if (!match.ok) {
      rejected.push({
        sku: item.sku,
        title: item.title,
        reason: match.reason || "Does not match",
      });
      continue;
    }
    options.push({ ...item, score: match.score });
  }
  options.sort((a, b) => b.score - a.score || a.priceUsd - b.priceUsd);
  return { options: options.slice(0, 12), rejected: rejected.slice(0, 8) };
}

export function catalogBySku(sku: string, ethUsd: number) {
  const local = LOCAL.find((item) => item.sku === sku);
  if (local) return withEthPrice(local, ethUsd);
  return undefined;
}
