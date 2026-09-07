import { test, expect } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  http,
  hexToString,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
const account = mnemonicToAccount(
  "test test test test test test test test test test test junk",
  { addressIndex: 3 },
);
const wallet = createWalletClient({
  account,
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});
const chain = createPublicClient({
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});
test("injected wallet signature and unsigned calldata complete a real purchase", async ({
  page,
}) => {
  await page.exposeFunction(
    "testWalletRequest",
    async ({ method, params }: { method: string; params: any[] }) => {
      if (method === "eth_requestAccounts") return [account.address];
      if (method === "personal_sign")
        return account.signMessage({ message: hexToString(params[0]) });
      if (method === "wallet_switchEthereumChain") {
        expect(params[0].chainId).toBe("0x7a69");
        return null;
      }
      if (method === "eth_sendTransaction") {
        const tx = params[0];
        const hash = await wallet.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: BigInt(tx.value),
        });
        await chain.waitForTransactionReceipt({ hash });
        return hash;
      }
      throw Error(`Unexpected wallet method ${method}`);
    },
  );
  await page.addInitScript(() => {
    (window as any).ethereum = { request: (window as any).testWalletRequest };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Ethereum wallet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const before = await (await page.request.get("/api/state")).json();
  expect(before.user.persona).toBe(-1);
  expect(before.user.owner).toBe(account.address);
  await page
    .getByRole("button", { name: "Reserve Room to explore", exact: true })
    .click();
  await page.getByLabel("Number of jobs").fill("2");
  await page
    .getByRole("button", { name: "Reserve capacity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const after = await (await page.request.get("/api/state")).json();
  expect(after.lots[1].owned).toBe(before.lots[1].owned + 2);
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(page.getByText("success", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/wallet-receipt.png",
    animations: "disabled",
  });
});
test("signed challenge is one use and provider authorization is enforced", async ({
  request,
}) => {
  const c = await (
    await request.post("/api/session/challenge", {
      data: { address: account.address },
    })
  ).json();
  const signature = await account.signMessage({ message: c.message });
  expect(
    (
      await request.post("/api/session/verify", {
        data: { address: account.address, signature },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.post("/api/session/verify", {
        data: { address: account.address, signature },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/provider/offers", {
        data: { units: 10, hours: 2, price: "0.0002" },
      })
    ).status(),
  ).toBe(403);
});
test("provider can issue a bounded new batch through the interface", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Manage the local workshop" }).click();
  await expect(
    page.getByRole("heading", { name: "Make a little room." }),
  ).toBeVisible();
  const before = await (await page.request.get("/api/state")).json();
  await page.getByLabel("Jobs", { exact: true }).fill("12");
  await page.getByLabel("Window (hours)").fill("3");
  await page.getByRole("button", { name: "Issue capacity" }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/state")).json()).lots.length,
    )
    .toBe(before.lots.length + 1);
  await page.screenshot({
    path: "docs/screenshots/provider-desktop.png",
    animations: "disabled",
  });
});
