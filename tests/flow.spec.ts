import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("buy, consume, pass along, redeem and download actual output", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "A Alice Reserve & pass along" })
    .click();
  await expect(
    page.getByRole("button", { name: "Alice", exact: true }),
  ).toBeVisible();
  const before = await (await page.request.get("/api/state")).json();
  const lot = before.lots.find(
    (l: any) => l.remaining >= 10 && l.expiresAt > Date.now() / 1000,
  );
  expect(lot).toBeTruthy();
  await page
    .getByRole("button", {
      name: `Reserve ${["A small head start", "Room to explore", "A slower afternoon"][lot.id - 1] || `Workshop batch ${lot.id}`}`,
      exact: true,
    })
    .click();
  await page.getByLabel("Number of jobs").fill("10");
  await page
    .getByRole("button", { name: "Reserve capacity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /Your capacity/ }).click();
  await expect(
    page.getByRole("heading", { name: "Room for what’s next." }),
  ).toBeVisible();
  const input = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      background: { r: 136, g: 164, b: 117 },
    },
  })
    .png()
    .toBuffer();
  for (let i = 0; i < 3; i++) {
    await page
      .locator(".reservation")
      .filter({ hasText: `Reservation #${String(lot.id).padStart(3, "0")}` })
      .getByRole("button", { name: "Use a job", exact: false })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: `garden-${i}.png`,
      mimeType: "image/png",
      buffer: input,
    });
    await page
      .getByRole("button", { name: "Process image · 1 credit" })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".status.completed")).toHaveCount(
      before.jobs.filter((j: any) => j.status === "completed").length + i + 1,
      { timeout: 20000 },
    );
    if (i < 2)
      await page.getByRole("button", { name: /Your capacity/ }).click();
  }
  await page.screenshot({
    path: "docs/screenshots/jobs-desktop.png",
    fullPage: true,
    animations: "disabled",
  });

  const afterJobs = await (await page.request.get("/api/state")).json();
  const job = afterJobs.jobs.find((j: any) => j.status === "completed");
  const output = await page.request.get(`/api/jobs/${job.id}/output`);
  expect(output.ok()).toBeTruthy();
  const meta = await sharp(await output.body()).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.width).toBe(1600);
  expect(meta.height).toBe(1200);
  await page.getByRole("button", { name: /Your capacity/ }).click();
  await page.screenshot({
    path: "docs/screenshots/reservations-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Pass along", exact: true })
    .first()
    .click();
  await page.getByLabel("Number of jobs").fill("7");
  await page.getByLabel("Price per job (ETH)").fill("0.00012");
  await page.screenshot({
    path: "docs/screenshots/resale-dialog.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "List unused capacity" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Alice", exact: true }).click();
  await page.getByRole("button", { name: "B Bob Pick up & make" }).click();
  await expect(
    page.getByRole("button", { name: "Bob", exact: true }),
  ).toBeVisible();
  const bobBefore = await (await page.request.get("/api/state")).json();
  await page.getByRole("button", { name: "Market", exact: true }).click();
  await page.getByRole("button", { name: "Passed along", exact: true }).click();
  await page
    .getByRole("button", { name: "Buy passed-along capacity" })
    .first()
    .click();
  await page.getByLabel("Number of jobs").fill("7");
  await page
    .getByRole("button", { name: "Reserve capacity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /Your capacity/ }).click();
  await page
    .locator(".reservation")
    .filter({ hasText: `Reservation #${String(lot.id).padStart(3, "0")}` })
    .getByRole("button", { name: "Use a job", exact: false })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "bob-garden.png",
    mimeType: "image/png",
    buffer: input,
  });
  await page.getByRole("button", { name: "Process image · 1 credit" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect
    .poll(async () => {
      const d = await (await page.request.get("/api/state")).json();
      return d.jobs.filter((j: any) => j.status === "completed").length;
    })
    .toBe(
      bobBefore.jobs.filter((j: any) => j.status === "completed").length + 1,
    );
  const bobAfter = await (await page.request.get("/api/state")).json();
  expect(bobAfter.lots.find((l: any) => l.id === lot.id).owned).toBe(
    bobBefore.lots.find((l: any) => l.id === lot.id).owned + 6,
  );
  expect((await page.request.get(`/api/jobs/${job.id}/output`)).status()).toBe(
    404,
  );
  await request.post("/api/session/demo", { data: { persona: 1 } });
  const soldCredit = await request.post(`/api/jobs?lot=${lot.id}`, {
    multipart: {
      file: { name: "not-owned.png", mimeType: "image/png", buffer: input },
    },
  });
  expect(soldCredit.status()).toBe(400);
  expect((await soldCredit.json()).error).toContain("no capacity owned");
  const key = await (await page.request.post("/api/keys", { data: {} })).json();
  const mcp = await request.post("/api/mcp", {
    headers: { Authorization: `Bearer ${key.token}` },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "melt_inventory", arguments: {} },
    },
  });
  expect(mcp.ok()).toBeTruthy();
  expect(JSON.parse((await mcp.json()).result.content[0].text).user.owner).toBe(
    bobAfter.user.owner,
  );
  await page.request.delete("/api/keys");
  expect(
    (
      await request.post("/api/mcp", {
        headers: { Authorization: `Bearer ${key.token}` },
        data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
      })
    ).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "Agent API", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/agent-api-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("mobile layout, keyboard dialog, empty state and image rejection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Your capacity", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little empty, for now." }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/empty-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeFocused();
  await page.request.post("/api/session/demo", { data: { persona: 2 } });
  const response = await page.request.post("/api/jobs?lot=1", {
    multipart: {
      file: {
        name: "bad.png",
        mimeType: "image/png",
        buffer: Buffer.from("not an image"),
      },
    },
  });
  expect(response.status()).toBe(400);
  const forbidden = await page.request.post("/api/session/demo", {
    headers: { Origin: "https://elsewhere.example" },
    data: { persona: 1 },
  });
  expect(forbidden.status()).toBe(403);
});
