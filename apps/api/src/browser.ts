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
import {
  toHex,
  toEventSelector,
  formatUnits,
  parseUnits,
  type Hex,
  type Address,
} from "viem";
import { validateTransaction, lockedSpend } from "./policy.js";
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
  signAgentMessage,
  signAgentTypedData,
} from "./chain.js";
import { get, event, serial, save } from "./store.js";
import { emit } from "./webhooks.js";
import { quoteSwap, buildSwapCall, knownToken } from "./swap.js";
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
function fixtureHostname() {
  try {
    return new URL(fixtureOrigin).hostname;
  } catch {
    return "";
  }
}
function navigationHosts() {
  return (process.env.BROWSER_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}
export function jobStartUrl(task: Pick<Task, "url" | "instruction">) {
  const explicit = task.url?.trim();
  if (explicit) return explicit;
  const match = task.instruction.match(/https:\/\/[^\s<>"'`)\]},]+/i);
  if (!match) return "";
  try {
    const parsed = new URL(match[0].replace(/[.,;]+$/, ""));
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
      return parsed.href;
  } catch {
    return "";
  }
  return "";
}
export function privateIP(ip: string) {
  return (
    /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.0\.|198\.(1[89])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/.test(
      ip,
    ) || ip.includes(":")
  );
}
export async function checkURL(
  raw: string,
  kind: "navigation" | "resource" = "navigation",
) {
  if (
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("about:")
  )
    return;
  const u = new URL(raw);
  if (u.username || u.password) throw Error("URLs cannot contain credentials");
  if (local && u.origin === fixtureOrigin) return;
  if (u.protocol !== "https:" || (u.port && u.port !== "443"))
    throw Error("Public browsing requires HTTPS on port 443");
  if (u.hostname === "localhost" || u.hostname.endsWith(".local"))
    throw Error("Private networks are not accessible");
  if (kind === "navigation" && process.env.BROWSERLESS_TOKEN) {
    const approved = navigationHosts();
    const fixtureHost = fixtureHostname();
    if (
      approved.length &&
      !approved.includes(u.hostname) &&
      u.hostname !== fixtureHost
    )
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
          ...(e instanceof HTMLAnchorElement && e.href
            ? { href: e.href.slice(0, 500) }
            : {}),
          ...((e instanceof HTMLInputElement ||
            e instanceof HTMLTextAreaElement) &&
          !(e instanceof HTMLInputElement && e.type === "password")
            ? { value: String(e.value || "").slice(0, 200) }
            : {}),
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
  } else if (action.type === "open") {
    await checkURL(action.url);
    await run.page.goto(action.url, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
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
    method !== "wallet_switchEthereumChain" &&
    method !== "personal_sign" &&
    method !== "eth_signTypedData_v4"
  )
    throw Object.assign(
      Error("This session does not sign permits, or raw transactions"),
      { code: 4200 },
    );
  if (method === "eth_accounts" || method === "eth_requestAccounts")
    return ["running", "paused"].includes(task.status) ? [task.vault] : [];
  if (method === "eth_chainId") return toHex(chain.id);
  if (method === "net_version") return String(chain.id);
  if (method === "personal_sign") {
    const from = String(params[1] || "").toLowerCase();
    if (from && from !== task.vault.toLowerCase()) throw Error("Wrong sender");
    return signAgentMessage(String(params[0] || "0x"));
  }
  if (method === "eth_signTypedData_v4") {
    const from = String(params[0] || "").toLowerCase();
    if (from && from !== task.vault.toLowerCase()) throw Error("Wrong sender");
    let typed: {
      domain: Record<string, unknown>;
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: Record<string, unknown>;
    };
    try {
      typed = JSON.parse(String(params[1]));
    } catch {
      throw Error("Typed data is not valid JSON");
    }
    return signAgentTypedData(typed);
  }
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
        if (
          task.agentMode === "model" &&
          lockedSpend(task) &&
          hasConfirmedExecution(task)
        )
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
      const rawAmount =
        !tokenId && log.data && log.data !== "0x" ? BigInt(log.data) : 0n;
      const known = knownToken(log.address);
      const existing = task.assets.find(
        (a) =>
          a.token.toLowerCase() === log.address.toLowerCase() &&
          a.tokenId === tokenId,
      );
      if (existing) {
        if (existing.kind === "erc20" && rawAmount > 0n) {
          const decimals = known?.decimals ?? 18;
          let prev = 0n;
          try {
            if (existing.amount) prev = parseUnits(existing.amount, decimals);
          } catch {
            prev = 0n;
          }
          existing.amount = formatUnits(prev + rawAmount, decimals);
          existing.symbol ||= known?.symbol;
        }
        continue;
      }
      task.assets.push({
        token: log.address,
        tokenId,
        kind: tokenId ? "erc721" : "erc20",
        recovered: false,
        symbol: known?.symbol,
        amount:
          !tokenId && rawAmount > 0n
            ? formatUnits(rawAmount, known?.decimals ?? 18)
            : undefined,
      });
    }
  }
  save(task);
}
export async function openBrowser(task: Task) {
  const startUrl = jobStartUrl(task);
  if (startUrl) await checkURL(startUrl);
  else if (local) await checkURL(`${fixtureOrigin}/start`);
  const browser = await launchBrowser(["--disable-quic"]);
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
      const kind = route.request().isNavigationRequest()
        ? "navigation"
        : "resource";
      await checkURL(route.request().url(), kind);
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
      if (frame !== frame.page().mainFrame())
        throw Error("Wallet unavailable in this frame");
      const frameUrl = frame.url();
      if (
        frameUrl &&
        frameUrl !== "about:blank" &&
        !frameUrl.startsWith("data:")
      )
        await checkURL(frameUrl);
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
    if (!startUrl && !local) {
      await page.setContent(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Start the task</title><style>body{margin:0;background:#fafafa;color:#35363e;font:16px system-ui}main{max-width:560px;margin:72px auto;padding:0 24px}h1{font-weight:500;font-size:36px;letter-spacing:-1.5px}p{color:#747783;line-height:1.7}label{display:block;margin:24px 0 12px;font-size:13px}input{width:100%;padding:12px 14px;border:1px solid #d7dbe7;border-radius:10px;font:inherit}button{margin-top:16px;border:0;border-radius:9px;background:#424a64;color:#fff;padding:13px 22px;font:inherit;cursor:pointer}</style><main><h1>Open a website</h1><p>This session can spend only the limit you set. Enter the site for the job.</p><label>Website<input id="url" type="url" placeholder="https://"></label><button id="go">Open site</button></main><script>document.getElementById('go').onclick=()=>{const v=document.getElementById('url').value.trim();if(v)location.href=v;}</script></html>`,
      );
    } else {
      await page.goto(startUrl || `${fixtureOrigin}/start`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    }
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
      emit(get(id).userId, "session.closed", get(id));
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
  await reconcile(task);
  // A locked single-purchase session that already executed is complete; a
  // recurring (DCA) swap resumes its remaining buys instead of finishing.
  if (
    lockedSpend(task) &&
    hasConfirmedExecution(task) &&
    (task.swap?.buys ?? 1) <= 1
  )
    return finish(id);
  if (task.kind === "swap") {
    const generation = (generations.get(id) || 0) + 1;
    generations.set(id, generation);
    task.status = "running";
    task.outcome = "pending";
    delete task.outcomeReason;
    delete task.error;
    save(task);
    emit(task.userId, "session.started", task);
    void runSwaps(id, generation).catch((e) => {
      if (task.status === "running" && generations.get(id) === generation) {
        const message = errorMessage(e);
        task.status = "paused";
        task.error = message;
        task.outcome = "failed";
        task.outcomeReason = `The swap did not complete: ${message}`;
        event(
          task,
          "error",
          `Swap paused: ${message}. Your funds are safe and can be returned.`,
        );
      }
    });
    return;
  }
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
  emit(task.userId, "session.started", task);
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
      const message = errorMessage(e);
      const busy = /\(429\)|\(502\)|\(503\)/.test(message);
      task.status = "paused";
      task.error = message;
      if (!busy) {
        task.outcome = "failed";
        task.outcomeReason = `The agent stopped: ${message}`;
      }
      event(
        task,
        "error",
        busy
          ? "Agent paused: the model is busy. Wait a moment, then resume."
          : `Agent paused: ${message}`,
      );
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
    "Agent started. It will work until the job is done or the session ends.",
  );
  const firstEvent = task.events.length;
  const history: BrowserAction[] = [];
  for (
    let step = 0;
    task.status === "running" && generations.get(id) === generation;
    step++
  ) {
    if (lockedSpend(task) && hasConfirmedExecution(task)) {
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
    if (lockedSpend(task) && hasConfirmedExecution(task)) {
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
const confirmedSwaps = (task: Task) =>
  task.transactions.filter(
    (t) => t.kind === "Execute dapp transaction" && t.status === "success",
  ).length;
// Deterministic Uniswap swaps: no browser, no model. The vault forwards its
// native allowance to the Uniswap router (a native-value call that needs no
// approval) and the purchased token is returned to the owner on close. With
// `buys > 1` this dollar-cost-averages across time under one onchain budget.
async function runSwaps(id: string, generation: number) {
  const task = get(id);
  if (!task.swap) throw Error("This session has no swap details");
  const symbol = chain.nativeCurrency.symbol;
  const buys = task.swap.buys ?? 1;
  const intervalSec = task.swap.intervalSec ?? 60;
  const live = () =>
    task.status === "running" && generations.get(id) === generation;
  if (buys > 1)
    event(
      task,
      "info",
      `Recurring buy: ${buys} × ${task.swap.amountIn} ${symbol} → ${task.swap.symbol}, every ${intervalSec}s within one limit.`,
    );
  for (let i = confirmedSwaps(task); i < buys; i++) {
    if (!live()) return;
    if (Date.now() >= task.expiresAt * 1000) {
      event(task, "info", "Session window ended before all buys completed.");
      break;
    }
    const quote = await quoteSwap({
      tokenOut: task.swap.tokenOut,
      amountIn: task.swap.amountIn,
      slippageBps: task.swap.slippageBps,
    });
    if (!live()) return;
    const call = buildSwapCall({
      tokenOut: quote.tokenOut,
      recipient: task.vault as Address,
      amountInWei: BigInt(quote.amountInWei),
      minOutWei: BigInt(quote.minOutWei),
      fee: quote.fee,
    });
    const label = buys > 1 ? `Buy ${i + 1} of ${buys}` : "Swap";
    event(
      task,
      "info",
      `${label}: Uniswap V3 ${(quote.fee / 10000).toFixed(2)}% pool · min ${quote.minOut} ${quote.symbol}.`,
    );
    await serial(task.id, async () => {
      await reconcile(task);
      await refreshBalance(task);
      // Simulate as the vault before the relayer signs anything real.
      await client.call({
        account: task.vault as Address,
        to: call.to,
        value: call.value,
        data: call.data,
      });
      const hash = await vaultCall(
        task,
        "execute",
        [call.to, call.value, call.data],
        "Execute dapp transaction",
      );
      await refreshBalance(task);
      await discoverAssets(task);
      event(
        task,
        "success",
        `${label} confirmed · about ${Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${quote.symbol} received`,
        hash,
      );
      emit(task.userId, "swap.executed", task, {
        buy: i + 1,
        buys,
        amountOut: quote.amountOut,
        symbol: quote.symbol,
        hash,
      });
    });
    if (!live()) return;
    if (i < buys - 1)
      await new Promise((r) =>
        setTimeout(r, Math.min(intervalSec, 3600) * 1000),
      );
  }
  if (!live()) return;
  Object.assign(task, executionOutcome(task));
  await finish(id);
}
export async function shutdownBrowsers() {
  await Promise.all([...browsers.values()].map((b) => b.close()));
  browsers.clear();
}
