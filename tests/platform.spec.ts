import { test, expect, type Page } from "@playwright/test";
const base = "http://127.0.0.1:5173";
const workspace = base + "/app";
async function signInLocal(page: Page) {
  await page.goto(workspace);
  await page.getByRole("button", { name: "Open local workspace" }).click();
}
async function createBrowseSession(
  page: Page,
  extra: {
    title?: string;
    instruction?: string;
    url?: string;
    target?: string;
    selector?: string;
    key?: string;
  } = {},
) {
  const cfg = await (await page.request.get(base + "/api/config")).json();
  const me = await (await page.request.get(base + "/api/me")).json();
  const response = await page.request.post(base + "/api/sessions", {
    headers: {
      Origin: base,
      "Idempotency-Key": extra.key
        ? `${extra.key}-${crypto.randomUUID()}`
        : crypto.randomUUID(),
    },
    data: {
      title: extra.title || "Mint a field note",
      instruction:
        extra.instruction ||
        "Connect the wallet and mint one field note. Return the collectible and remaining funds when done.",
      url: extra.url ?? cfg.fixture.url,
      budget: "0.0003",
      durationMinutes: 15,
      target: extra.target === undefined ? cfg.fixture.target : extra.target,
      selector:
        extra.selector === undefined ? cfg.fixture.selector : extra.selector,
      recovery: me.owner,
      kind: "browse",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function waitForStatus(
  page: Page,
  sessionId: string,
  status: string | RegExp,
  timeout = 30000,
) {
  await expect
    .poll(
      async () => {
        const state = await (
          await page.request.get(`${base}/api/sessions/${sessionId}`)
        ).json();
        return state.status;
      },
      { timeout },
    )
    .toMatch(status instanceof RegExp ? status : new RegExp(`^${status}$`));
}
async function openActivitySession(page: Page, title: string) {
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  const row = page
    .getByRole("button", { name: new RegExp(title) })
    .filter({ hasText: "Ready" })
    .first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.click();
}
// Fixed fixture choices belong only in tests. Production agents choose from observations.
async function mintThroughManualBrowser(page: Page, sessionId?: string) {
  const task = sessionId
    ? { id: sessionId }
    : (await (await page.request.get(base + "/api/sessions")).json())[0];
  await waitForStatus(page, task.id, /ready|paused/);
  const current = await (
    await page.request.get(`${base}/api/sessions/${task.id}`)
  ).json();
  if (current.status === "ready") {
    const started = await page.request.post(
      `${base}/api/sessions/${task.id}/start`,
      {
        headers: { Origin: base },
        data: { manual: true },
      },
    );
    expect(started.ok(), await started.text()).toBeTruthy();
  }
  await waitForStatus(page, task.id, "paused");
  for (const label of ["Connect wallet", "Mint field note"]) {
    const observation = await (
      await page.request.get(`${base}/api/sessions/${task.id}/browser`)
    ).json();
    const control = observation.controls.find(
      (candidate: any) => candidate.label === label,
    );
    expect(control).toBeDefined();
    expect(control.disabled).not.toBe(true);
    const action = await page.request.post(
      `${base}/api/sessions/${task.id}/action`,
      {
        headers: { Origin: base },
        data: { type: "click", index: control.index },
      },
    );
    expect(action.ok()).toBe(true);
  }
  await expect
    .poll(
      async () => {
        const state = await (
          await page.request.get(`${base}/api/sessions/${task.id}`)
        ).json();
        return state.transactions.some(
          (tx: any) =>
            tx.kind === "Execute dapp transaction" && tx.status === "success",
        );
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const finish = await page.request.post(
    `${base}/api/sessions/${task.id}/action`,
    {
      headers: { Origin: base },
      data: { type: "finish", reason: "Confirmed collectible mint" },
    },
  );
  expect(finish.ok()).toBe(true);
  const closed = await finish.json();
  expect(closed.status).toBe("closed");
  expect(closed.outcome).toBe("succeeded");
  return closed;
}

test("product page explains the gift before the workspace", async ({
  page,
}) => {
  await page.goto(base);
  await expect(
    page.getByRole("heading", {
      name: "Send money that knows what it is for.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create an envelope" }).first().click();
  await expect(
    page.getByRole("button", { name: "Open local workspace" }),
  ).toBeVisible();
});

test("real browser mint returns NFT and remainder; receipt remains accessible", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInLocal(page);
  const created = await createBrowseSession(page);
  await openActivitySession(page, "Mint a field note");
  await expect(
    page.getByRole("button", { name: "Open task browser", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({
    path: "docs/screenshots/session-ready.png",
    fullPage: true,
  });
  await mintThroughManualBrowser(page, created.id);
  const t = await (
    await page.request.get(`${base}/api/sessions/${created.id}`)
  ).json();
  expect(t.status).toBe("closed");
  expect(t.spent).toBe("0.0001");
  expect(t.returned).toBe("0.0002");
  expect(t.assets[0].recovered).toBe(true);
  const receipt = await (
    await page.request.get(`${base}/api/sessions/${t.id}/receipt`)
  ).json();
  expect(receipt.chainId).toBe(31337);
  expect(receipt.outcome).toBe("succeeded");
  const { createPublicClient, http, parseAbi } = await import("viem");
  const chain = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });
  const nftOwner = await chain.readContract({
    address: t.assets[0].token,
    abi: parseAbi(["function ownerOf(uint256) view returns (address)"]),
    functionName: "ownerOf",
    args: [BigInt(t.assets[0].tokenId)],
  });
  expect(nftOwner.toLowerCase()).toBe(t.recovery.toLowerCase());
  expect(t.transactions.every((t: any) => t.status === "success")).toBe(true);
  expect(errors).toEqual([]);
});
test("another account cannot read session; API key cannot create allowance; revocation applies immediately", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const req = context.request;
  const h = { Origin: base };
  await req.post(base + "/api/auth/local", { data: {}, headers: h });
  const cfg = await (await req.get(base + "/api/config")).json(),
    me = await (await req.get(base + "/api/me")).json();
  const body = {
    title: "Permission test",
    instruction: "Mint a note",
    url: cfg.fixture.url,
    budget: "0.0003",
    durationMinutes: 15,
    target: cfg.fixture.target,
    selector: cfg.fixture.selector,
    recovery: me.owner,
  };
  const permissionKey = `permission-test-${crypto.randomUUID()}`;
  const first = await req.post(base + "/api/sessions", {
    data: body,
    headers: { ...h, "Idempotency-Key": permissionKey },
  });
  const task = await first.json();
  expect(first.status()).toBe(201);
  const replay = await req.post(base + "/api/sessions", {
    data: body,
    headers: { ...h, "Idempotency-Key": permissionKey },
  });
  expect((await replay.json()).id).toBe(task.id);
  const key = await (
    await req.post(base + "/api/keys", {
      data: { name: "Test agent" },
      headers: h,
    })
  ).json();
  const other = await browser.newContext();
  await other.request.post(base + "/api/auth/local", {
    data: {},
    headers: { ...h, "x-melt-local-user": "isolated" },
  });
  expect(
    (await other.request.get(`${base}/api/sessions/${task.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await req.post(base + "/api/sessions", {
        data: body,
        headers: {
          Authorization: `Bearer ${key.token}`,
          "Idempotency-Key": "permission-test-2",
        },
      })
    ).status(),
  ).toBe(403);
  expect(key.token).toMatch(/^melt_/);
  await req.delete(base + "/api/keys/" + key.id, { headers: h });
  expect(
    (
      await req.get(base + "/api/sessions", {
        headers: { Authorization: `Bearer ${key.token}` },
      })
    ).status(),
  ).toBe(401);
  const close = await req.post(`${base}/api/sessions/${task.id}/close`, {
    data: {},
    headers: h,
  });
  expect((await close.json()).status).toBe("closed");
  await other.close();
  await context.close();
});
test("second fixture layout works and narrow UI has no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInLocal(page);
  const created = await createBrowseSession(page, {
    url: "http://127.0.0.1:8788/print-shop",
    key: "print-shop-mobile",
  });
  await openActivitySession(page, "Mint a field note");
  await expect(
    page.getByRole("button", { name: "Open task browser", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/session-mobile.png",
    fullPage: true,
  });
  await mintThroughManualBrowser(page, created.id);
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`${base}/api/sessions/${created.id}`)
          ).json()
        ).status,
      { timeout: 15000 },
    )
    .toBe("closed");
});

test("browser rejects oversized spend, completes allowed mint, and recovers late funds and NFT", async ({
  page,
}) => {
  const {
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    parseAbi,
    encodeFunctionData,
  } = await import("viem");
  const { mnemonicToAccount } = await import("viem/accounts");
  const { foundry } = await import("viem/chains");
  const wallet = createWalletClient({
    chain: foundry,
    transport: http("http://127.0.0.1:8545"),
    account: mnemonicToAccount(
      "test test test test test test test test test test test junk",
      { addressIndex: 1 },
    ),
  });
  const chain = createPublicClient({
    chain: foundry,
    transport: http("http://127.0.0.1:8545"),
  });
  await signInLocal(page);
  const created = await createBrowseSession(page, {
    url: "http://127.0.0.1:8788/guardrail-check",
    key: "guardrail-mint",
  });
  await openActivitySession(page, "Mint a field note");
  await expect(
    page.getByRole("button", { name: "Open task browser", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await mintThroughManualBrowser(page, created.id);
  const t = await (
    await page.request.get(`${base}/api/sessions/${created.id}`)
  ).json();
  expect(t.status).toBe("closed");
  expect(
    t.events.some(
      (e: any) => e.kind === "blocked" && e.text.includes("allowance"),
    ),
  ).toBe(true);
  expect(t.spent).toBe("0.0001");
  const fundingHash = await wallet.sendTransaction({
    to: t.vault,
    value: parseEther("0.00005"),
  });
  await chain.waitForTransactionReceipt({ hash: fundingHash });
  const funding = await page.request.post(
    `${base}/api/sessions/${t.id}/funding`,
    { headers: { Origin: base }, data: { hash: fundingHash } },
  );
  expect(funding.ok()).toBe(true);
  expect(
    (await funding.json()).transactions.some(
      (tx: any) =>
        tx.hash === fundingHash && tx.kind === "Owner funded task wallet",
    ),
  ).toBe(true);
  const abi = parseAbi([
    "function mint() payable",
    "function safeTransferFrom(address,address,uint256)",
  ]);
  const mint = await chain.waitForTransactionReceipt({
    hash: await wallet.sendTransaction({
      to: t.target,
      data: encodeFunctionData({ abi, functionName: "mint" }),
      value: parseEther("0.0001"),
    }),
  });
  const tokenId = BigInt(mint.logs[0].topics[3]!);
  await chain.waitForTransactionReceipt({
    hash: await wallet.sendTransaction({
      to: t.target,
      data: encodeFunctionData({
        abi,
        functionName: "safeTransferFrom",
        args: [wallet.account.address, t.vault, tokenId],
      }),
    }),
  });
  const res = await page.request.post(`${base}/api/sessions/${t.id}/recover`, {
    headers: { Origin: base },
    data: { kind: "erc721", token: t.target, tokenId: tokenId.toString() },
  });
  const recovered = await res.json();
  expect(recovered.status).toBe("closed");
  expect(recovered.returned).toBe("0.00025");
  expect(recovered.assets.filter((a: any) => a.recovered)).toHaveLength(2);
  const repeat = await (
    await page.request.post(`${base}/api/sessions/${t.id}/close`, {
      headers: { Origin: base },
      data: {},
    })
  ).json();
  expect(repeat.transactions.length).toBe(recovered.transactions.length);
  expect(repeat.returned).toBe(recovered.returned);
});

test("manual agent controls and MCP operate only owner-authorized sessions", async ({
  page,
}) => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } =
    await import("@modelcontextprotocol/sdk/client/stdio.js");
  await signInLocal(page);
  const created = await createBrowseSession(page, { key: "mcp-mint" });
  await expect
    .poll(
      async () => {
        const state = await (
          await page.request.get(`${base}/api/sessions/${created.id}`)
        ).json();
        return state.status;
      },
      { timeout: 30000 },
    )
    .toBe("ready");
  const task = created;
  const key = await (
    await page.request.post(base + "/api/keys", {
      headers: { Origin: base },
      data: { name: "MCP integration test" },
    })
  ).json();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "packages/sdk/src/mcp.ts"],
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH!,
      MELT_API_KEY: key.token,
      MELT_API_URL: "http://127.0.0.1:8787",
    },
    stderr: "pipe",
  });
  const mcp = new Client({ name: "test-client", version: "1.0.0" });
  try {
    await mcp.connect(transport);
    const tools = await mcp.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_envelopes",
        "get_envelope",
        "find_options",
        "propose_purchase",
        "redeem",
        "get_redemption_status",
        "list_sessions",
        "start_session",
        "read_session",
        "read_receipt",
      ]),
    );
    expect(names).not.toContain("transfer");
    const started = await mcp.callTool({
      name: "start_session",
      arguments: { sessionId: task.id },
    });
    expect(started.isError).not.toBe(true);
    const state = await (
      await page.request.get(`${base}/api/sessions/${task.id}`)
    ).json();
    expect(state.status).toBe("paused");
    expect(state.spent).toBe("0");
    const observed = await mcp.callTool({
      name: "observe_browser",
      arguments: { sessionId: task.id },
    });
    expect(observed.isError).not.toBe(true);
    await mcp.callTool({
      name: "close_session",
      arguments: { sessionId: task.id },
    });
    const closed = await (
      await page.request.get(`${base}/api/sessions/${task.id}`)
    ).json();
    expect(closed.status).toBe("closed");
    expect(closed.returned).toBe("0.0003");
    expect(closed.outcome).toBe("cancelled");
    const receiptResult = await mcp.callTool({
      name: "read_receipt",
      arguments: { sessionId: task.id },
    });
    expect(receiptResult.isError).not.toBe(true);
  } finally {
    await mcp.close();
  }
});

test("request validation blocks private URLs, changed idempotency bodies and cross-site writes", async ({
  request,
}) => {
  const h = { Origin: base };
  await request.post(base + "/api/auth/local", { data: {}, headers: h });
  const cfg = await (await request.get(base + "/api/config")).json(),
    me = await (await request.get(base + "/api/me")).json();
  const body = {
    title: "Validation test",
    instruction: "Mint one note",
    url: cfg.fixture.url,
    budget: "0.0003",
    target: cfg.fixture.target,
    selector: cfg.fixture.selector,
    recovery: me.owner,
  };
  expect(
    (
      await request.post(base + "/api/keys", {
        headers: { Origin: "https://untrusted.example" },
        data: { name: "forged" },
      })
    ).status(),
  ).toBe(403);
  for (const url of ["https://127.0.0.1/"]) {
    const r = await request.post(base + "/api/sessions", {
      headers: { ...h, "Idempotency-Key": crypto.randomUUID() },
      data: { ...body, url },
    });
    expect(r.status()).toBe(400);
  }
  const headers = {
    ...h,
    "Idempotency-Key": `validation-repeat-${crypto.randomUUID()}`,
  };
  const made = await (
    await request.post(base + "/api/sessions", { headers, data: body })
  ).json();
  expect(
    (
      await request.post(base + "/api/sessions", {
        headers,
        data: { ...body, budget: "0.0005" },
      })
    ).status(),
  ).toBe(409);
  await request.post(`${base}/api/sessions/${made.id}/close`, {
    headers: h,
    data: {},
  });
  const openJob = await request.post(base + "/api/sessions", {
    headers: { ...h, "Idempotency-Key": crypto.randomUUID() },
    data: {
      title: "Open job",
      instruction: "Leave a tip within the spending limit",
      url: cfg.fixture.pay.url,
      budget: "0.0003",
      recovery: me.owner,
    },
  });
  expect(openJob.status()).toBe(201);
  const created = await openJob.json();
  expect(created.target).toBe("");
  expect(created.selector).toBe("");
  await request.post(`${base}/api/sessions/${created.id}/close`, {
    headers: h,
    data: {},
  });
});

test("a spending-limit session can complete a different job without a contract lock", async ({
  page,
}) => {
  await signInLocal(page);
  const cfg = await (await page.request.get(base + "/api/config")).json();
  const created = await createBrowseSession(page, {
    title: "Leave a tip",
    instruction:
      "Connect the wallet and leave a tip. Return unused funds when done.",
    url: cfg.fixture.pay.url,
    target: "",
    selector: "",
    key: "tip-session",
  });
  await openActivitySession(page, "Leave a tip");
  await expect(
    page.getByRole("button", { name: "Open task browser", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const task = created;
  expect(task.target).toBe("");
  await waitForStatus(page, task.id, "ready");
  const started = await page.request.post(
    `${base}/api/sessions/${task.id}/start`,
    {
      headers: { Origin: base },
      data: { manual: true },
    },
  );
  expect(started.ok(), await started.text()).toBeTruthy();
  await expect
    .poll(
      async () => {
        const state = await (
          await page.request.get(`${base}/api/sessions/${task.id}`)
        ).json();
        return state.status;
      },
      { timeout: 30000 },
    )
    .toBe("paused");
  for (const label of ["Connect wallet", "Leave a tip"]) {
    const observation = await (
      await page.request.get(`${base}/api/sessions/${task.id}/browser`)
    ).json();
    const control = observation.controls.find(
      (candidate: any) => candidate.label === label,
    );
    expect(control).toBeDefined();
    const action = await page.request.post(
      `${base}/api/sessions/${task.id}/action`,
      {
        headers: { Origin: base },
        data: { type: "click", index: control.index },
      },
    );
    expect(action.ok()).toBe(true);
  }
  await expect
    .poll(
      async () => {
        const state = await (
          await page.request.get(`${base}/api/sessions/${task.id}`)
        ).json();
        return state.transactions.some(
          (tx: any) =>
            tx.kind === "Execute dapp transaction" && tx.status === "success",
        );
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const finish = await page.request.post(
    `${base}/api/sessions/${task.id}/action`,
    {
      headers: { Origin: base },
      data: { type: "finish", reason: "Tip confirmed" },
    },
  );
  expect(finish.ok()).toBe(true);
  const closed = await finish.json();
  expect(closed.status).toBe("closed");
  expect(closed.spent).toBe("0.0001");
  expect(closed.returned).toBe("0.0002");
  expect(closed.outcome).toBe("succeeded");
});

test("envelope create, discover matching options, and reject cash-out", async ({
  page,
}) => {
  await signInLocal(page);
  await expect(
    page.getByRole("heading", { name: "Send a gift they can spend later." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Uniswap swap" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Browser job" })).toHaveCount(
    0,
  );
  const before = await (await page.request.get(base + "/api/envelopes")).json();
  const toField = page.getByRole("textbox", { name: "To", exact: true });
  if (!(await toField.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "New envelope" }).click();
  }
  await toField.fill("Alex");
  await page.getByRole("button", { name: "Mobile data", exact: true }).click();
  await page.getByRole("button", { name: "Create envelope" }).click();
  await expect
    .poll(
      async () =>
        (
          (await (
            await page.request.get(base + "/api/envelopes")
          ).json()) as any
        ).sent.length,
      { timeout: 30000 },
    )
    .toBe(before.sent.length + 1);
  const created = await (
    await page.request.get(base + "/api/envelopes")
  ).json();
  const envelope = created.sent[0];
  expect(envelope.category).toBe("esim");
  expect(envelope.policyHash).toMatch(/^[0-9a-f]{64}$/);
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await page.getByLabel("Envelope").click();
  await page
    .getByRole("option")
    .filter({ hasText: envelope.purpose })
    .first()
    .click();
  await page
    .getByLabel("What do you want this gift to become")
    .fill("an eSIM for Japan");
  await page.getByRole("button", { name: "Find options" }).click();
  await expect(page.getByText(/Japan eSIM/i).first()).toBeVisible({
    timeout: 20000,
  });
  const cash = await page.request.get(
    `${base}/api/envelopes/${envelope.id}/options?q=${encodeURIComponent("just transfer the money")}`,
  );
  const cashBody = await cash.json();
  expect(cashBody.options).toEqual([]);
  expect(cashBody.note).toMatch(/unrestricted cash/i);
  const transfer = await page.request.post(
    `${base}/api/envelopes/${envelope.id}/redeem`,
    {
      headers: { Origin: base },
      data: { to: envelope.senderAddress, amount: "0.01" },
    },
  );
  expect(transfer.status()).toBe(400);
  const proposed = await page.request.post(
    `${base}/api/envelopes/${envelope.id}/propose`,
    {
      headers: { Origin: base },
      data: { sku: "esim-jp-1gb", request: "an eSIM for Japan" },
    },
  );
  expect(proposed.ok(), await proposed.text()).toBeTruthy();
  const quote = await proposed.json();
  const redeemed = await page.request.post(
    `${base}/api/envelopes/${envelope.id}/redeem`,
    {
      headers: { Origin: base },
      data: { quoteId: quote.quote.id },
    },
  );
  expect(redeemed.ok(), await redeemed.text()).toBeTruthy();
  const settled = await redeemed.json();
  expect(settled.redemption.status).toBe("succeeded");
  expect(settled.redemption.symbol).toBe("USDC");
  expect(settled.redemption.hash).toMatch(/^0x[0-9a-fA-F]{64}$/);

  // An agent can propose an item it found on the open web; the policy gate
  // still decides. Without a configured model the item must plainly relate
  // to the promise.
  const external = await page.request.post(
    `${base}/api/envelopes/${envelope.id}/propose`,
    {
      headers: { Origin: base },
      data: {
        item: {
          title: "Japan travel eSIM · 3 GB mobile data",
          merchant: "Airalo",
          priceUsd: 9,
          url: "https://www.airalo.com/japan-esim",
        },
      },
    },
  );
  expect(external.ok(), await external.text()).toBeTruthy();
  const externalQuote = await external.json();
  expect(externalQuote.option.source).toBe("agent");
  const externalRedeem = await page.request.post(
    `${base}/api/envelopes/${envelope.id}/redeem`,
    { headers: { Origin: base }, data: { quoteId: externalQuote.quote.id } },
  );
  expect(externalRedeem.ok(), await externalRedeem.text()).toBeTruthy();
  const offTopic = await page.request.post(
    `${base}/api/envelopes/${envelope.id}/propose`,
    {
      headers: { Origin: base },
      data: {
        item: {
          title: "PlayStation 5 console",
          merchant: "GameStop",
          priceUsd: 15,
        },
      },
    },
  );
  expect(offTopic.status()).toBe(409);
  const overCap = await page.request.post(
    `${base}/api/envelopes/${envelope.id}/propose`,
    {
      headers: { Origin: base },
      data: {
        item: {
          title: "Unlimited mobile data plan for a year",
          merchant: "Airalo",
          priceUsd: 500,
        },
      },
    },
  );
  expect(overCap.status()).toBe(409);
  const badUrl = await page.request.post(
    `${base}/api/envelopes/${envelope.id}/propose`,
    {
      headers: { Origin: base },
      data: {
        item: {
          title: "Japan mobile data eSIM",
          merchant: "Airalo",
          priceUsd: 9,
          url: "http://airalo.com/japan",
        },
      },
    },
  );
  expect(badUrl.status()).toBe(400);
});

test("developer console creates and revokes a key, clears revealed secret on logout, and serves OpenAPI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/developers/keys");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await page.getByRole("button", { name: "Create API key" }).click();
  await expect(page.getByRole("button", { name: "Copy key" })).toBeVisible();
  await page
    .getByRole("button", { name: /^Revoke Agent / })
    .first()
    .click();
  await expect(page.getByText("Revoked").first()).toBeVisible();
  const doc = await (await page.request.get(base + "/api/openapi.json")).json();
  expect(doc.openapi).toBe("3.1.0");
  expect(doc.paths["/envelopes"]).toBeDefined();
  expect(doc.paths["/envelopes/{id}/redeem"]).toBeDefined();
  expect(doc.paths["/sessions/{id}/recover"]).toBeDefined();
  expect(doc.paths["/client.mjs"]).toBeDefined();
  expect(doc.paths["/usage"]).toBeDefined();
  expect(doc.paths["/mcp"]).toBeDefined();
  expect(doc.paths["/platform"]).toBeDefined();
  const download = await page.request.get(base + "/api/client.mjs");
  expect(download.ok()).toBe(true);
  expect(download.headers()["content-type"]).toContain("javascript");
  expect(download.headers()["content-disposition"]).toContain(
    "melt-client.mjs",
  );
  expect(await download.text()).toContain("export class Melt");
  const platform = await (
    await page.request.get(base + "/api/platform")
  ).json();
  expect(platform.mcp).toContain("/api/mcp");
  expect(platform.docs).toContain("/developers");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to create an API key" }),
  ).toBeVisible();
  await expect(page.locator(".key-reveal")).toHaveCount(0);
  expect(errors).toEqual([]);
});
