import { test, expect } from "@playwright/test";
const base = "http://127.0.0.1:5173";
test("real browser mint returns NFT and remainder; receipt remains accessible", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(
    page.getByRole("button", { name: "Create task wallet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create task wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Start task", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({
    path: "docs/screenshots/session-ready.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(page.getByText("Session closed", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(
    page.getByText("1 asset returned · agent spending disabled"),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/session-complete.png",
    fullPage: true,
  });
  const response = await page.request.get(base + "/api/sessions");
  const tasks = await response.json();
  const t = tasks[0];
  expect(t.spent).toBe("0.0001");
  expect(t.returned).toBe("0.0002");
  expect(t.assets[0].recovered).toBe(true);
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
  const first = await req.post(base + "/api/sessions", {
    data: body,
    headers: { ...h, "Idempotency-Key": "permission-test-1" },
  });
  const task = await first.json();
  expect(first.status()).toBe(201);
  const replay = await req.post(base + "/api/sessions", {
    data: body,
    headers: { ...h, "Idempotency-Key": "permission-test-1" },
  });
  expect((await replay.json()).id).toBe(task.id);
  const key = await (
    await req.post(base + "/api/keys", {
      data: { name: "Test agent" },
      headers: h,
    })
  ).json();
  const other = await browser.newContext();
  await other.request.post(base + "/api/auth/local", { data: {}, headers: h });
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
  const keys = await (await req.get(base + "/api/keys")).json();
  await req.delete(base + "/api/keys/" + keys[0].id, { headers: h });
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
  await page.goto(base);
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page
    .getByLabel("Website", { exact: true })
    .fill("http://127.0.0.1:8788/print-shop");
  await page.getByRole("button", { name: "Create task wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Start task", exact: true }),
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
  await page.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(page.getByText("Session closed", { exact: true })).toBeVisible({
    timeout: 60000,
  });
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
  await page.goto(base);
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page
    .getByLabel("Website", { exact: true })
    .fill("http://127.0.0.1:8788/guardrail-check");
  await page.getByRole("button", { name: "Create task wallet" }).click();
  await page.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(page.getByText("Session closed", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  const t = (await (await page.request.get(base + "/api/sessions")).json())[0];
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
  await page.goto(base);
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.getByRole("button", { name: "Create task wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Start task", exact: true }),
  ).toBeVisible();
  const task = (
    await (await page.request.get(base + "/api/sessions")).json()
  )[0];
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
    expect(tools.tools).toHaveLength(8);
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
  const headers = { ...h, "Idempotency-Key": "validation-repeat" };
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
});

test("developer UI creates and revokes a key, clears revealed secret on logout, and serves OpenAPI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.getByRole("link", { name: "Developers", exact: true }).click();
  await page.getByRole("button", { name: "Create API key" }).click();
  await expect(page.getByRole("button", { name: "Copy key" })).toBeVisible();
  await page.getByRole("button", { name: "Revoke Agent 1" }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  const doc = await (await page.request.get(base + "/api/openapi.json")).json();
  expect(doc.openapi).toBe("3.1.0");
  expect(doc.paths["/sessions/{id}/recover"]).toBeDefined();
  await page.locator("button.account").click();
  await expect(
    page.getByRole("button", { name: "Sign in to create an API key" }),
  ).toBeVisible();
  await expect(page.locator(".key-reveal")).toHaveCount(0);
  expect(errors).toEqual([]);
});
