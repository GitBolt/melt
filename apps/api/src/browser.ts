import { errorMessage } from "./errors.js";
import { chromium, type BrowserContext, type Page } from "playwright";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  actionSchema,
  actionSummary,
  decide,
  executionOutcome,
  hasConfirmedExecution,
  hasModelConfiguration,
  type BrowserAction,
} from "./agent.js";
export { actionSchema } from "./agent.js";
import { toHex, toEventSelector, type Hex, type Address } from "viem";
import {
  client,
  chain,
  local,
  vaultCall,
  refreshBalance,
  recover,
  reconcile,
  operator,
  vaultArtifact,
} from "./chain.js";
import { get, event, serial, save } from "./store.js";
import { validateTransaction } from "./policy.js";
import type { Task } from "../../../packages/shared/src/index.js";
async function launchBrowser(args: string[]) {
  if (process.env.BROWSERLESS_TOKEN) {
    const endpoint = new URL(
      "wss://production-sfo.browserless.io/chromium/playwright",
    );
    endpoint.searchParams.set("token", process.env.BROWSERLESS_TOKEN);
    endpoint.searchParams.set("timeout", "120000");
    // Native Playwright sessions have no recording/replay enabled.
    try {
      return await chromium.connect(endpoint.toString(), { timeout: 20000 });
    } catch {
      throw Error(
        "Remote browser could not connect. Check provider availability and remaining free usage.",
      );
    }
  }
  return chromium.launch({
    headless: true,
    chromiumSandbox: true,
    env: Object.fromEntries(
      ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DISPLAY"].flatMap((key) =>
        process.env[key] ? [[key, process.env[key]!]] : [],
      ),
    ),
    args,
  });
}
export async function verifyBrowserRuntime() {
  const browser = await launchBrowser([
    "--host-resolver-rules=MAP * ~NOTFOUND",
  ]);
  try {
    const page = await browser.newPage();
    if ((await page.evaluate(() => 1 + 1)) !== 2)
      throw Error("Browser runtime check failed");
  } finally {
    await browser.close();
  }
}
const generations = new Map<string, number>();
export function pause(id: string) {
  generations.set(id, (generations.get(id) || 0) + 1);
  const task = get(id);
  task.status = "paused";
  event(task, "info", "Agent paused. You can use the browser controls.");
}
const sessions = new Map<string, { context: BrowserContext; page: Page }>();
const browsers = new Map<string, Awaited<ReturnType<typeof chromium.launch>>>();
const fixtureOrigin = process.env.FIXTURE_ORIGIN || "http://127.0.0.1:8788";
export function privateIP(ip: string) {
  return (
    /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.0\.|198\.(1[89])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/.test(
      ip,
    ) || ip.includes(":")
  );
}
export async function checkURL(raw: string) {
  const u = new URL(raw);
  if (u.username || u.password) throw Error("URLs cannot contain credentials");
  if (local && u.origin === fixtureOrigin) return;
  if (u.protocol !== "https:" || (u.port && u.port !== "443"))
    throw Error("Public browsing requires HTTPS on port 443");
  if (u.hostname === "localhost" || u.hostname.endsWith(".local"))
    throw Error("Private networks are not accessible");
  if (process.env.BROWSERLESS_TOKEN) {
    const approved = (process.env.BROWSER_ALLOWED_HOSTS || "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);
    if (!approved.includes(u.hostname))
      throw Error(
        "This site is not enabled on the hosted browser. Contact the operator to enable it.",
      );
  }
  const ips = isIP(u.hostname)
    ? [{ address: u.hostname }]
    : await lookup(u.hostname, { all: true, family: 4 });
  if (!ips.length || ips.some((i) => privateIP(i.address)))
    throw Error("Private networks are not accessible");
}
export async function snapshot(id: string) {
  const run = sessions.get(id);
  if (!run) throw Error("No browser is open");
  return run.page.screenshot({ type: "jpeg", quality: 65, timeout: 5000 });
}
export async function observe(id: string) {
  const run = sessions.get(id);
  if (!run) throw Error("Start the browser first");
  return run.page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll(
        'button,a,input,textarea,select,[role="button"]',
      ),
    )
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .slice(0, 200);
    for (const e of document.querySelectorAll("[data-melt-control]"))
      e.removeAttribute("data-melt-control");
    return {
      url: location.href,
      title: document.title,
      text: document.body.innerText.slice(0, 16000),
      scroll: {
        y: scrollY,
        viewportHeight: innerHeight,
        pageHeight: document.documentElement.scrollHeight,
      },
      controls: elements.map((e, index) => {
        e.setAttribute("data-melt-control", String(index));
        return {
          index,
          tag: e.tagName.toLowerCase(),
          label:
            e.getAttribute("aria-label") ||
            (e instanceof HTMLInputElement ||
            e instanceof HTMLSelectElement ||
            e instanceof HTMLTextAreaElement
              ? e.labels?.[0]?.textContent?.trim()
              : "") ||
            e.textContent?.trim().slice(0, 150) ||
            e.getAttribute("placeholder") ||
            e.getAttribute("name") ||
            "",
          type: e.getAttribute("type"),
          disabled:
            e.matches(":disabled") ||
            e.getAttribute("aria-disabled") === "true",
          ...(e instanceof HTMLSelectElement
            ? {
                options: Array.from(e.options)
                  .slice(0, 100)
                  .map((option) => ({
                    value: option.value,
                    label: option.label,
                    selected: option.selected,
                    disabled: option.disabled,
                  })),
              }
            : {}),
        };
      }),
    };
  });
}
export async function doAction(id: string, raw: unknown) {
  const task = get(id);
  if (!["running", "paused"].includes(task.status))
    throw Error("Session is not active");
  const action = actionSchema.parse(raw),
    run = sessions.get(id);
  if (!run) throw Error("No browser is open");
  if (action.type === "finish") return finish(id);
  if (action.type === "wait") {
    await new Promise((r) => setTimeout(r, 750));
    return;
  }
  if (action.type === "scroll") {
    await run.page.mouse.wheel(0, action.direction === "down" ? 570 : -570);
  } else {
    const control = run.page.locator(`[data-melt-control="${action.index}"]`);
    if (action.type === "click")
      await control.click({ timeout: 8000, noWaitAfter: true });
    else if (action.type === "fill")
      await control.fill(action.value, { timeout: 5000 });
    else if (action.type === "select")
      await control.selectOption(action.value, { timeout: 5000 });
    else await control.press(action.key, { timeout: 5000 });
  }
  task.browserUrl = run.page.url();
  task.browserTitle = await run.page.title();
  save(task);
}
export async function estimatePermittedGas(
  task: Task,
  raw: Record<string, unknown>,
  estimate: (tx: ReturnType<typeof validateTransaction>) => Promise<bigint>,
) {
  const tx = validateTransaction(task, raw);
  const gas = await estimate(tx);
  if (gas > 1000000n) throw Error("Transaction exceeds the session gas limit");
  return toHex(gas);
}
export async function provider(
  task: Task,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const readMethods = [
    "eth_chainId",
    "net_version",
    "eth_accounts",
    "eth_requestAccounts",
    "eth_blockNumber",
    "eth_getBalance",
    "eth_getTransactionReceipt",
    "eth_getTransactionByHash",
    "eth_getTransactionCount",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_gasPrice",
    "eth_maxPriorityFeePerGas",
    "eth_feeHistory",
    "eth_call",
    "eth_getCode",
    "eth_estimateGas",
  ];
  if (
    !readMethods.includes(method) &&
    method !== "eth_sendTransaction" &&
    method !== "wallet_switchEthereumChain"
  )
    throw Object.assign(
      Error("This session does not sign messages, permits, or approvals"),
      { code: 4200 },
    );
  if (method === "eth_accounts" || method === "eth_requestAccounts")
    return ["running", "paused"].includes(task.status) ? [task.vault] : [];
  if (method === "eth_chainId") return toHex(chain.id);
  if (method === "net_version") return String(chain.id);
  if (method === "wallet_switchEthereumChain") {
    if (BigInt((params[0] as any)?.chainId || 0) !== BigInt(chain.id))
      throw Error("This task stays on its approved chain");
    return null;
  }
  if (method === "eth_estimateGas") {
    try {
      return await estimatePermittedGas(
        task,
        params[0] as Record<string, unknown>,
        async (tx) =>
          client.estimateContractGas({
            account: operator,
            address: task.vault as Address,
            abi: vaultArtifact.abi,
            functionName: "execute",
            args: [tx.to, tx.value, tx.data],
          }),
      );
    } catch (error) {
      event(task, "blocked", errorMessage(error));
      throw Error(errorMessage(error));
    }
  }
  if (method === "eth_sendTransaction")
    return serial(task.id, async () => {
      try {
        await reconcile(task);
        if (task.agentMode === "model" && hasConfirmedExecution(task))
          throw Error(
            "This task already has a confirmed transaction. End the session to return your funds.",
          );
        if (
          task.transactions.filter((t) => t.kind === "Execute dapp transaction")
            .length >= 20
        )
          throw Error("Session transaction limit reached");
        await refreshBalance(task);
        const tx = validateTransaction(
          task,
          params[0] as Record<string, unknown>,
        );
        await client.call({
          account: task.vault as Address,
          to: tx.to,
          value: tx.value,
          data: tx.data,
        });
        const hash = await vaultCall(
          task,
          "execute",
          [tx.to, tx.value, tx.data],
          "Execute dapp transaction",
        );
        await refreshBalance(task);
        await discoverAssets(task);
        event(task, "success", "Transaction confirmed", hash);
        return hash;
      } catch (e) {
        event(task, "blocked", errorMessage(e));
        throw Error(errorMessage(e));
      }
    });
  if (method === "eth_getTransactionReceipt") {
    const receipt = await client.request({
      method: method as any,
      params: params as any,
    });
    return receipt;
  }
  return client.request({ method: method as any, params: params as any });
}
export async function discoverAssets(task: Task) {
  for (const tx of task.transactions.filter(
    (t) => t.kind === "Execute dapp transaction" && t.status === "success",
  )) {
    const receipt = await client.getTransactionReceipt({
      hash: tx.hash as Hex,
    });
    for (const log of receipt.logs) {
      if (
        log.topics[0] !==
          toEventSelector("Transfer(address,address,uint256)") ||
        !log.topics[2]
          ?.toLowerCase()
          .endsWith(task.vault.slice(2).toLowerCase())
      )
        continue;
      const tokenId = log.topics[3]
        ? BigInt(log.topics[3]).toString()
        : undefined;
      if (
        !task.assets.some(
          (a) =>
            a.token.toLowerCase() === log.address.toLowerCase() &&
            a.tokenId === tokenId,
        )
      )
        task.assets.push({
          token: log.address,
          tokenId,
          kind: tokenId ? "erc721" : "erc20",
          recovered: false,
        });
    }
  }
  save(task);
}
export async function openBrowser(task: Task) {
  await checkURL(task.url);
  const allowedHosts = new Set([
    new URL(task.url).hostname,
    ...(process.env.BROWSER_RESOURCE_HOSTS || "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  ]);
  const rules: string[] = [];
  for (const host of allowedHosts) {
    if (!/^[a-zA-Z0-9.-]+$/.test(host))
      throw Error("Invalid browser resource hostname");
    if (local && host === "127.0.0.1") {
      rules.push("MAP 127.0.0.1 127.0.0.1");
      continue;
    }
    const ips = await lookup(host, { all: true, family: 4 });
    if (!ips.length || ips.some((i) => privateIP(i.address)))
      throw Error("Private browser address blocked");
    rules.push(`MAP ${host} ${ips[0].address}`);
  }
  const browser = await launchBrowser([
    "--disable-quic",
    `--host-resolver-rules=${rules.join(", ")}, MAP * ~NOTFOUND`,
  ]);
  browsers.set(task.id, browser);
  browser.on("disconnected", () => {
    if (browsers.get(task.id) !== browser) return;
    browsers.delete(task.id);
    sessions.delete(task.id);
    generations.set(task.id, (generations.get(task.id) || 0) + 1);
    if (["running", "paused"].includes(task.status)) {
      task.status = "paused";
      event(
        task,
        "info",
        "Browser connection ended. Reopen the browser to continue, or end the session to return funds.",
      );
    }
  });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 760 },
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  await context.route("**/*", async (route) => {
    try {
      const req = route.request();
      await checkURL(req.url());
      if (!allowedHosts.has(new URL(req.url()).hostname))
        throw Error("Resource host not approved");
      if (
        req.isNavigationRequest() &&
        req.frame() === req.frame().page().mainFrame() &&
        new URL(req.url()).origin !== new URL(task.url).origin
      )
        throw Error("Cross-site navigation is disabled");
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
  await context.routeWebSocket("**/*", (ws) => ws.close());
  context.on("page", (page) => {
    if (sessions.get(task.id)?.page !== page && sessions.has(task.id))
      void page.close();
  });
  await context.exposeBinding(
    "__meltRpc",
    async ({ frame }, arg: { method: string; params?: unknown[] }) => {
      if (
        frame !== frame.page().mainFrame() ||
        new URL(frame.url()).origin !== new URL(task.url).origin
      )
        throw Error("Wallet unavailable in this frame");
      return provider(task, arg.method, arg.params);
    },
  );
  await context.addInitScript({
    content: `(() => {
  const listeners = new Map();
  const wallet = {isMelt:true,
    request: async (args) => { try { return await window.__meltRpc(args); } catch(e) { throw Object.assign(new Error(e.message), {code:4001}); } },
    on: (name,fn) => { if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn); },
    removeListener: (name,fn) => listeners.get(name)?.delete(fn)
  };
  Object.defineProperty(window,'ethereum',{value:wallet,writable:false});
  const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'a5a30404-08c4-45b1-b470-a24a6b963601',name:'Melt task wallet',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',rdns:'app.melt.task'},provider:wallet}}));
  window.addEventListener('eip6963:requestProvider',announce);announce();
 })();`,
  });
  const page = await context.newPage();
  sessions.set(task.id, { context, page });
  try {
    await page.goto(task.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    task.browserUrl = page.url();
    task.browserTitle = await page.title();
    event(task, "info", "Task browser opened");
  } catch (e) {
    await closeBrowser(task.id);
    throw e;
  }
}
export async function closeBrowser(id: string) {
  const s = sessions.get(id);
  sessions.delete(id);
  const browser = browsers.get(id);
  browsers.delete(id);
  // Browser teardown must never prevent on-chain recovery.
  await Promise.allSettled([s?.context.close(), browser?.close()]);
}
export async function finish(id: string) {
  generations.set(id, (generations.get(id) || 0) + 1);
  const task = get(id);
  task.status = "closing";
  save(task);
  await closeBrowser(id);
  return serial(id, async () => {
    try {
      await reconcile(task);
      await discoverAssets(task);
      if (hasConfirmedExecution(task)) {
        Object.assign(task, executionOutcome(task));
      } else if (!task.outcome || task.outcome === "pending") {
        task.outcome = "cancelled";
        task.outcomeReason = "The session ended without a task transaction.";
      }
      await recover(task);
    } catch (e) {
      task.status = "attention";
      task.error = errorMessage(e);
      event(task, "error", task.error);
    }
  });
}
export async function start(id: string, manual = false) {
  const task = get(id);
  if (!["ready", "paused"].includes(task.status))
    throw Error("Fund the session before starting");
  if (Date.now() >= task.expiresAt * 1000)
    throw Error("Session expired; return funds instead");
  if (!manual && task.agentMode === "model" && !hasModelConfiguration())
    throw Error(
      "AI agent is not configured. Start with manual control instead.",
    );
  const generation = (generations.get(id) || 0) + 1;
  generations.set(id, generation);
  task.status = "running";
  task.outcome = "pending";
  delete task.outcomeReason;
  delete task.error;
  save(task);
  try {
    if (!sessions.has(id)) await openBrowser(task);
  } catch (e) {
    await closeBrowser(id);
    if (generations.get(id) === generation) {
      task.status = "attention";
      task.error = errorMessage(e);
      save(task);
    }
    throw e;
  }
  if (task.status !== "running" || generations.get(id) !== generation) {
    if (!["paused", "running"].includes(task.status)) await closeBrowser(id);
    return;
  }
  if (manual || task.agentMode === "manual") {
    pause(id);
    return;
  }
  void runAgent(id, generation).catch((e) => {
    if (task.status === "running" && generations.get(id) === generation) {
      task.status = "paused";
      task.error = errorMessage(e);
      task.outcome = "failed";
      task.outcomeReason = `The agent stopped: ${task.error}`;
      event(task, "error", `Agent paused: ${task.error}`);
    }
  });
}
async function runAgent(id: string, generation: number) {
  const task = get(id);
  if (!hasModelConfiguration())
    throw Error("AI agent is not configured. Use manual browser control.");
  event(
    task,
    "info",
    "Agent started. The session ends after one confirmed task transaction.",
  );
  const firstEvent = task.events.length;
  const history: BrowserAction[] = [];
  for (
    let step = 0;
    task.status === "running" && generations.get(id) === generation;
    step++
  ) {
    if (hasConfirmedExecution(task)) {
      Object.assign(task, executionOutcome(task));
      event(task, "success", task.outcomeReason!);
      await finish(id);
      return;
    }
    const blocked = task.events
      .slice(firstEvent)
      .find((entry) => entry.kind === "blocked");
    if (blocked) throw Error(blocked.text);
    if (
      task.transactions.some(
        (tx) =>
          tx.kind === "Execute dapp transaction" && tx.status === "reverted",
      )
    )
      throw Error(
        "The task transaction reverted. Review the session before trying again.",
      );
    if (Date.now() >= task.expiresAt * 1000) {
      task.outcome = "failed";
      task.outcomeReason =
        "The session expired without a confirmed task transaction.";
      await finish(id);
      return;
    }
    if (task.transactions.some((tx) => tx.status === "pending")) {
      // Pending requests are not a reason to ask the model to purchase again.
      try {
        await reconcile(task);
      } catch {
        /* A submitted transaction may still be mining. */
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      step--;
      continue;
    }
    if (step >= 30) break;
    const obs = await observe(id);
    const action = await decide({
      instruction: task.instruction,
      allowance: task.budget,
      spent: task.spent,
      transactions: task.transactions.map(({ hash, kind, status }) => ({
        hash,
        kind,
        status,
      })),
      step,
      page: obs,
      history: history.slice(-8),
    });
    if (task.status !== "running" || generations.get(id) !== generation) return;
    // A transaction may confirm while the model is choosing its next action.
    if (hasConfirmedExecution(task)) {
      Object.assign(task, executionOutcome(task));
      event(task, "success", task.outcomeReason!);
      await finish(id);
      return;
    }
    const actionBlocked = task.events
      .slice(firstEvent)
      .find((entry) => entry.kind === "blocked");
    if (actionBlocked) throw Error(actionBlocked.text);
    if (task.transactions.some((tx) => tx.status === "pending")) {
      step--;
      continue;
    }
    event(
      task,
      "info",
      `Step ${step + 1} · ${actionSummary(action, obs.controls)}`,
    );
    if (action.type === "finish") {
      Object.assign(task, executionOutcome(task));
      event(
        task,
        task.outcome === "succeeded" ? "success" : "error",
        task.outcomeReason!,
      );
      await finish(id);
      return;
    }
    await doAction(id, action);
    history.push(action);
    await new Promise((r) => setTimeout(r, 800));
  }
  if (task.status === "running" && generations.get(id) === generation) {
    task.status = "paused";
    task.outcome = "failed";
    task.outcomeReason =
      "The agent reached its step limit without a confirmed task transaction.";
    event(
      task,
      "info",
      "Agent paused at its step limit. Review the session before resuming.",
    );
  }
}
export async function shutdownBrowsers() {
  await Promise.all([...browsers.values()].map((b) => b.close()));
  browsers.clear();
}
