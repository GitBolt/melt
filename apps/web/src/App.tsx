import { MeltLoader, MeltWordmark } from "./components/MeltMotion";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  ChevronDown,
  Copy,
  Check,
  Download,
  Code2,
  Wallet,
  Globe,
  Play,
  Pause,
  Square,
  RotateCcw,
  ArrowLeft,
  ExternalLink,
  KeyRound,
  Trash2,
  X,
  ShieldCheck,
  MousePointer2,
  Repeat,
  Link2,
} from "lucide-react";
import { parseEther, toHex } from "viem";
import type {
  Config,
  Task,
  CreateTask,
  TaskStatus,
} from "../../../packages/shared/src/index";
import { mandateText } from "../../../packages/shared/src/index";
import { BudgetRibbon } from "./components/BudgetRibbon";
import { GooeyNav } from "./components/ui/gooey-nav";
import { SessionSeal } from "./SessionSeal";
import { FundingSwap } from "./FundingSwap";
import "./public-receipt.css";
export interface Auth {
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  passkey?: () => Promise<unknown>;
  linkPasskey?: () => Promise<unknown>;
  signTypedData?: (data: unknown, owner: string) => Promise<string>;
  wait?: (hash: string) => Promise<void>;
  send: (tx: {
    from: string;
    to: string;
    value: string;
    data?: string;
  }) => Promise<string>;
}
const short = (s: string) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "Creating…";
function siteHost(url: string) {
  if (!url) return "Any public site";
  try {
    return new URL(url).hostname;
  } catch {
    return "Website";
  }
}
const statusLabel: Record<TaskStatus, string> = {
  funding: "Needs funding",
  ready: "Ready",
  running: "Agent working",
  paused: "Agent paused",
  closing: "Returning funds",
  closed: "Session closed",
  attention: "Review needed",
};
const pageFromHash = () =>
  ({ "#developers": "Developers", "#receipts": "Receipts" })[
    window.location.hash as "#developers" | "#receipts"
  ] || "Sessions";
const SWAP_PRESET = "melt-swap-preset";
function loadSwapPreset(): {
  symbol?: string;
  amount?: string;
  slippagePct?: number;
  buys?: number;
  intervalSec?: number;
} | null {
  try {
    return JSON.parse(localStorage.getItem(SWAP_PRESET) || "null");
  } catch {
    return null;
  }
}
function confirmedBuys(task: Task) {
  return task.transactions.filter(
    (tx) => tx.kind === "Execute dapp transaction" && tx.status === "success",
  ).length;
}
function formatAmount(n: number, digits = 4) {
  if (!Number.isFinite(n) || n === 0) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function remainingLabel(expiresAt: number, now: number, closed: boolean) {
  if (closed) return "Ended";
  const remaining = Math.max(0, expiresAt - Math.floor(now / 1000));
  if (remaining <= 0) return "Expired";
  return `${Math.floor(remaining / 60)}m ${String(remaining % 60).padStart(2, "0")}s`;
}
function tokenSymbol(
  asset: Pick<Task["assets"][number], "token" | "symbol">,
  registry?: Config["swap"],
) {
  if (asset.symbol) return asset.symbol;
  const known = registry?.tokens.find(
    (t) => t.address.toLowerCase() === asset.token.toLowerCase(),
  );
  return known?.symbol || `${asset.token.slice(0, 6)}…`;
}
function sessionOverview(tasks: Task[], registry?: Config["swap"]) {
  const spent = tasks.reduce((n, t) => n + Number(t.spent || 0), 0);
  const returned = tasks.reduce((n, t) => n + Number(t.returned || 0), 0);
  const succeeded = tasks.filter((t) => t.outcome === "succeeded").length;
  const holdings = new Map<
    string,
    { symbol: string; amount: number; recovered: number }
  >();
  for (const t of tasks)
    for (const a of t.assets.filter((x) => x.kind === "erc20")) {
      const key = a.token.toLowerCase();
      const cur = holdings.get(key) || {
        symbol: tokenSymbol(a, registry),
        amount: 0,
        recovered: 0,
      };
      if (a.amount) cur.amount += Number(a.amount) || 0;
      if (a.recovered) cur.recovered += 1;
      holdings.set(key, cur);
    }
  return { spent, returned, succeeded, tokens: [...holdings.values()] };
}

export default function App({ config, auth }: { config: Config; auth?: Auth }) {
  const [user, setUser] = useState<{ id: string; owner: string } | null>(null),
    [tasks, setTasks] = useState<Task[]>([]),
    [page, setPage] = useState(pageFromHash),
    [selected, setSelected] = useState<string>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [newTask, setNewTask] = useState(false),
    [draft, setDraft] = useState<CreateTask>(),
    [kindFilter, setKindFilter] = useState<"all" | "browse" | "swap">("all"),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const onHashChange = () => {
      setPage(pageFromHash());
      setSelected(undefined);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const refreshing = useRef(false);
  const request = useCallback(
    async (
      path: string,
      body?: unknown,
      method?: string,
      extra?: Record<string, string>,
    ) => {
      const token = await auth?.getToken();
      const r = await fetch(`/api${path}`, {
        method: method || (body ? "POST" : "GET"),
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      if (!r.ok)
        throw Object.assign(Error(data.error || "Request failed"), {
          status: r.status,
        });
      return data;
    },
    [auth?.authenticated],
  );
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const me = await request("/me");
      setUser(me);
      setTasks(await request("/sessions"));
    } catch (e) {
      if ((e as any).status === 401) {
        setUser(null);
        setTasks([]);
      } else setError((e as Error).message);
    } finally {
      refreshing.current = false;
    }
  }, [request]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const signIn = () =>
    auth
      ? auth.login()
      : act("signin", async () => {
          await request("/auth/local", {});
          setNewTask(true);
        });
  const task = tasks.find((t) => t.id === selected),
    listed = tasks.filter((t) => kindFilter === "all" || t.kind === kindFilter),
    active = listed.filter((t) => t.status !== "closed"),
    overview = sessionOverview(listed, config.swap);
  async function download(t: Task) {
    const data = await request(`/sessions/${t.id}/receipt`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `melt-${t.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="app-shell">
      <header className="app-top">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setSelected(undefined);
            setPage("Sessions");
          }}
        >
          <MeltWordmark />
        </a>
        <GooeyNav
          className="app-nav"
          activeColor="#e9edf9"
          activeLabelColor="#5363ac"
          size="sm"
          items={["Sessions", "Receipts", "Developers"].map((label) => ({
            label,
            href: "#" + label.toLowerCase(),
          }))}
          value={["Sessions", "Receipts", "Developers"].indexOf(page)}
          onChange={(i) => {
            setPage(["Sessions", "Receipts", "Developers"][i]);
            setSelected(undefined);
          }}
        />
        <button
          className="account"
          title={user ? `Wallet: ${user.owner}` : undefined}
          onClick={
            user
              ? () =>
                  act("logout", async () => {
                    await request("/auth/logout", {});
                    await auth?.logout();
                    setSelected(undefined);
                  })
              : signIn
          }
          disabled={!!busy || auth?.ready === false}
        >
          <Wallet size={14} />
          {user ? short(user.owner) : "Sign in"}
          {user && <span className="account-exit">Sign out</span>}
        </button>
      </header>
      <div className="environment">
        <span>
          <span className="network-mark">◇</span>
          {config.chain.name}
          <span className="env-detail">
            {config.mode === "local"
              ? "Test funds · no real money"
              : "Task wallets"}
          </span>
        </span>
        <span>
          {config.browserAvailable === false
            ? "Browser unavailable · recovery available"
            : config.modelConfigured
              ? "AI agent enabled"
              : "Manual control"}
        </span>
      </div>
      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      <main>
        {page === "Developers" ? (
          <Developers
            request={request}
            user={user?.id || ""}
            signIn={signIn}
            act={act}
            busy={busy}
            notify={setNotice}
          />
        ) : task ? (
          <>
            <button className="back" onClick={() => setSelected(undefined)}>
              <ArrowLeft size={14} />
              All sessions
            </button>
            <SessionDetail
              task={task}
              config={config}
              request={request}
              busy={busy}
              act={act}
              auth={auth}
              owner={user?.owner || ""}
              notify={setNotice}
              now={now}
              download={() => download(task)}
              share={() => {
                if (!task.receiptToken) {
                  setNotice("Receipt link is not ready yet");
                  return;
                }
                void navigator.clipboard
                  .writeText(`${location.origin}/r/${task.receiptToken}`)
                  .then(() => setNotice("Receipt link copied"))
                  .catch(() => setError("Could not copy the receipt link"));
              }}
              repeat={() => {
                setDraft(task);
                setSelected(undefined);
                setPage("Sessions");
                setNewTask(true);
              }}
            />
          </>
        ) : (
          <>
            <section className="intro">
              <div>
                <h1>
                  {page === "Receipts"
                    ? "See where your funds went."
                    : "Give your agent an allowance."}
                </h1>
                <p>
                  {page === "Receipts"
                    ? "Review spending, returned assets, and share a public receipt — no Melt login required."
                    : "Set a spending limit, let your agent work, and return unused funds to your wallet."}
                </p>
              </div>
              {user && (
                <button
                  className="primary"
                  onClick={() => {
                    setPage("Sessions");
                    setNewTask(true);
                  }}
                >
                  <Plus size={16} />
                  New session
                </button>
              )}
            </section>
            {page === "Sessions" && (!user || newTask || !tasks.length) ? (
              <div
                className={
                  user && tasks.length ? "compose-solo" : "launch-grid"
                }
              >
                <section className="compose panel">
                  <div className="section-top">
                    <h2>Start with a task</h2>
                    <span className="quiet">01</span>
                  </div>
                  {user ? (
                    <Composer
                      key={draft ? JSON.stringify(draft) : "new"}
                      initial={draft}
                      config={config}
                      owner={user.owner}
                      busy={busy}
                      onCancel={
                        tasks.length ? () => setNewTask(false) : undefined
                      }
                      onQuote={(body) => request("/swap/quote", body)}
                      onSubmit={(body) =>
                        act("create", async () => {
                          const t = await request("/sessions", body, "POST", {
                            "Idempotency-Key": crypto.randomUUID(),
                          });
                          setSelected(t.id);
                          setNewTask(false);
                          setDraft(undefined);
                        })
                      }
                    />
                  ) : (
                    <>
                      <p className="sign-in-copy">
                        Tell your agent what to do and set a spending limit. It
                        gets a separate wallet and browser.
                      </p>
                      <div className="example-task">
                        <Globe size={17} />
                        <span>
                          Any job you type
                          <span>Spending limit · leftover funds return</span>
                        </span>
                        <ArrowUpRight size={17} />
                      </div>
                      <button
                        className="primary sign-in-cta"
                        onClick={signIn}
                        disabled={!!busy}
                      >
                        {busy === "signin" ? <MeltLoader size={16} /> : null}
                        {config.mode === "local"
                          ? "Open local workspace"
                          : "Continue with email or wallet"}
                        <ArrowRight size={16} />
                      </button>
                      {auth?.passkey && (
                        <button
                          className="quiet-button"
                          onClick={() => act("passkey", auth.passkey!)}
                        >
                          Sign in with a passkey
                        </button>
                      )}
                      <p className="helper">
                        {config.mode === "local"
                          ? "No wallet or funds needed. Uses local test ETH."
                          : "Sign in to create your first task wallet."}
                      </p>
                    </>
                  )}
                </section>
                {!(user && tasks.length) && (
                  <aside className="welcome-wallet panel">
                    <SessionSeal />
                    <div>
                      <h2>Keep your main wallet separate.</h2>
                      <p>
                        Your agent spends from a task wallet with a limit you
                        set. Unused funds return when the session ends.
                      </p>
                    </div>
                    <div className="wallet-footer">
                      <ShieldCheck size={14} />
                      Spending limits enforced onchain
                    </div>
                  </aside>
                )}
              </div>
            ) : null}
            {user && tasks.length > 0 && (
              <section className="session-list">
                {page === "Receipts" && (
                  <>
                    <div className="overview-grid">
                      <article className="overview-card panel">
                        <span>Spent</span>
                        <strong>
                          {formatAmount(overview.spent, 5)}
                          <small>{config.chain.symbol}</small>
                        </strong>
                      </article>
                      <article className="overview-card panel">
                        <span>Returned</span>
                        <strong>
                          {formatAmount(overview.returned, 5)}
                          <small>{config.chain.symbol}</small>
                        </strong>
                      </article>
                      <article className="overview-card panel">
                        <span>Confirmed jobs</span>
                        <strong>
                          {overview.succeeded}
                          <small>/ {listed.length}</small>
                        </strong>
                      </article>
                      <article className="overview-card panel">
                        <span>Tokens recovered</span>
                        <strong>{overview.tokens.length}</strong>
                      </article>
                    </div>
                    {overview.tokens.length > 0 && (
                      <div className="portfolio-row">
                        {overview.tokens.map((token) => (
                          <span className="portfolio-chip" key={token.symbol}>
                            <strong>
                              {token.amount
                                ? formatAmount(token.amount)
                                : token.recovered}
                            </strong>
                            {token.symbol}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div className="section-top">
                  <h2>
                    {page === "Receipts" ? "Session history" : "Your sessions"}
                  </h2>
                  <span className="quiet">{active.length} open</span>
                </div>
                <div className="filter-row">
                  {(
                    [
                      ["all", "All"],
                      ["swap", "Swaps"],
                      ["browse", "Browser jobs"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={kindFilter === value ? "chosen" : ""}
                      onClick={() => setKindFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {listed.map((t) => (
                  <button
                    key={t.id}
                    className="session-row"
                    onClick={() => setSelected(t.id)}
                  >
                    <div
                      className={`mini-seal ${t.status === "closed" ? "complete" : ""}`}
                    >
                      {t.status === "closed" ? (
                        <Check size={19} />
                      ) : t.kind === "swap" ? (
                        <Repeat size={18} />
                      ) : (
                        <ArrowUpRight size={19} />
                      )}
                    </div>
                    <div className="row-name">
                      <strong>{t.title}</strong>
                      <span>
                        {t.kind === "swap"
                          ? t.swap?.buys && t.swap.buys > 1
                            ? `${confirmedBuys(t)}/${t.swap.buys} buys · ${t.swap.symbol}`
                            : `Uniswap · ${t.swap?.symbol || "token"}`
                          : siteHost(t.url)}{" "}
                        ·{" "}
                        {new Date(t.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                        {t.status !== "closed"
                          ? ` · ${remainingLabel(t.expiresAt, now, false)}`
                          : ""}
                      </span>
                    </div>
                    <span className={`kind-pill ${t.kind}`}>
                      {t.kind === "swap" ? "Swap" : "Browse"}
                    </span>
                    <span className={`status status-${t.status}`}>
                      {statusLabel[t.status]}
                    </span>
                    <span className="row-amount">
                      {t.spent} <small>{config.chain.symbol}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
                {listed.length === 0 && (
                  <p className="helper">No sessions in this view yet.</p>
                )}
              </section>
            )}
            {!user && page === "Receipts" && (
              <div className="empty">
                <Download size={24} />
                <h2>Sign in to see your receipts</h2>
                <button className="secondary" onClick={signIn}>
                  Sign in
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <footer>
        <a href="/">Melt · Task wallets for agents</a>
        {user && auth?.linkPasskey && (
          <button onClick={() => act("passkey", auth.linkPasskey!)}>
            Add a passkey
          </button>
        )}
        <button
          onClick={() => {
            setSelected(undefined);
            setPage("Developers");
          }}
        >
          Developer docs <ArrowUpRight size={12} />
        </button>
      </footer>
    </div>
  );
}
function Composer({
  initial,
  config,
  owner,
  busy,
  onSubmit,
  onCancel,
  onQuote,
}: {
  config: Config;
  owner: string;
  busy: string;
  initial?: CreateTask;
  onSubmit: (body: CreateTask) => void;
  onCancel?: () => void;
  onQuote: (body: {
    tokenOut: string;
    amountIn: string;
    slippageBps: number;
  }) => Promise<any>;
}) {
  const mint = {
    title: "Mint a field note",
    instruction:
      "Connect the wallet and mint one field note. Return the collectible and remaining funds when done.",
    url: config.fixture.url,
    target: config.fixture.target,
    selector: config.fixture.selector,
  };
  const site = {
    title: "Use a site without my wallet",
    instruction:
      "Open the website, connect only the task wallet, and complete the job inside the spending limit. Do not connect any other wallet. Return leftover funds when done.",
    url: "",
    target: "",
    selector: "",
  };
  const pay = config.fixture.pay?.available
    ? {
        title: "Leave a tip",
        instruction:
          "Connect the wallet and leave a tip. Return unused funds when done.",
        url: config.fixture.pay.url,
        target: "",
        selector: "",
      }
    : undefined;
  const swapTokens = config.swap?.tokens || [];
  const swapEnabled = !!config.swap?.available && swapTokens.length > 0;
  const preset = initial?.swap ? null : loadSwapPreset();
  const [example, setExample] = useState(
    initial?.kind === "swap" ? "swap" : "custom",
  );
  const [url, setUrl] = useState(initial?.url || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [instruction, setInstruction] = useState(initial?.instruction || "");
  const [budget, setBudget] = useState(initial?.budget || "0.0003");
  const [budgetRange, setBudgetRange] = useState(
    Math.max(0.001, Math.min(10, Number(initial?.budget) || 0)),
  );
  const [minutes, setMinutes] = useState(initial?.durationMinutes || 15);
  const [target, setTarget] = useState(initial?.target || "");
  const [selector, setSelector] = useState(initial?.selector || "");
  const [swapSymbol, setSwapSymbol] = useState(
    initial?.swap?.symbol || preset?.symbol || swapTokens[0]?.symbol || "USDC",
  );
  const [swapAmount, setSwapAmount] = useState(
    initial?.swap?.amountIn || preset?.amount || "0.05",
  );
  const [slippagePct, setSlippagePct] = useState(
    initial?.swap
      ? (initial.swap.slippageBps ?? 50) / 100
      : (preset?.slippagePct ?? 0.5),
  );
  const [buys, setBuys] = useState(initial?.swap?.buys || preset?.buys || 1);
  const [intervalSec, setIntervalSec] = useState(
    initial?.swap?.intervalSec || preset?.intervalSec || 60,
  );
  const [quote, setQuote] = useState<any>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [quoting, setQuoting] = useState(false);
  const chosenToken = swapTokens.find((t) => t.symbol === swapSymbol);
  useEffect(() => {
    if (example !== "swap" || !swapEnabled) return;
    const amountNumber = Number(swapAmount);
    if (!(amountNumber > 0) || amountNumber > 10) {
      setQuote(null);
      setQuoteErr("");
      return;
    }
    let alive = true;
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const q = await onQuote({
          tokenOut: chosenToken?.address || swapSymbol,
          amountIn: swapAmount,
          slippageBps: Math.round(slippagePct * 100),
        });
        if (alive) {
          setQuote(q);
          setQuoteErr("");
        }
      } catch (e) {
        if (alive) {
          setQuote(null);
          setQuoteErr((e as Error).message);
        }
      } finally {
        if (alive) setQuoting(false);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [example, swapSymbol, swapAmount, slippagePct, swapEnabled]);
  const apply = (next: {
    title: string;
    instruction: string;
    url: string;
    target: string;
    selector: string;
  }) => {
    setTitle(next.title);
    setInstruction(next.instruction);
    setUrl(next.url);
    setTarget(next.target);
    setSelector(next.selector);
  };
  const tabs = (
    <>
      {swapEnabled && (
        <div className="job-modes">
          <button
            className={example !== "swap" ? "chosen" : ""}
            type="button"
            onClick={() => {
              setExample("custom");
              apply({
                title: "",
                instruction: "",
                url: "",
                target: "",
                selector: "",
              });
            }}
          >
            Browser job
          </button>
          <button
            className={example === "swap" ? "chosen" : ""}
            type="button"
            onClick={() => setExample("swap")}
          >
            Uniswap swap
          </button>
        </div>
      )}
      {example !== "swap" && (
        <div className="template-options">
          <button
            className={example === "custom" ? "chosen" : ""}
            type="button"
            onClick={() => {
              setExample("custom");
              apply({
                title: "",
                instruction: "",
                url: "",
                target: "",
                selector: "",
              });
            }}
          >
            Custom
          </button>
          <button
            className={example === "site" ? "chosen" : ""}
            type="button"
            onClick={() => {
              setExample("site");
              apply(site);
            }}
          >
            New site
          </button>
          {config.fixture.available && (
            <button
              className={example === "mint" ? "chosen" : ""}
              type="button"
              onClick={() => {
                setExample("mint");
                apply(mint);
              }}
            >
              Mint
            </button>
          )}
          {pay && (
            <button
              className={example === "pay" ? "chosen" : ""}
              type="button"
              onClick={() => {
                setExample("pay");
                apply(pay);
              }}
            >
              Pay
            </button>
          )}
        </div>
      )}
    </>
  );
  if (example === "swap") {
    const canSwap = !!chosenToken && !!quote && !quoteErr;
    return (
      <form
        className="swap-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (!chosenToken) return;
          const recurring = buys > 1;
          // Ensure the session window covers every scheduled buy.
          const needMinutes = recurring
            ? Math.ceil((buys * intervalSec) / 60) + 2
            : minutes;
          onSubmit({
            url: "",
            title: recurring
              ? `Recurring buy: ${chosenToken.symbol}`
              : `Swap ${config.chain.symbol} for ${chosenToken.symbol}`,
            instruction: recurring
              ? `Buy ${chosenToken.symbol} with ${swapAmount} ${config.chain.symbol}, ${buys} times, on Uniswap`
              : `Swap ${swapAmount} ${config.chain.symbol} for ${chosenToken.symbol} on Uniswap`,
            budget: swapAmount,
            durationMinutes: Math.min(60, Math.max(minutes, needMinutes)),
            target: "",
            selector: "",
            recovery: owner,
            kind: "swap",
            swap: {
              tokenOut: chosenToken.address,
              symbol: chosenToken.symbol,
              amountIn: swapAmount,
              slippageBps: Math.round(slippagePct * 100),
              buys,
              intervalSec,
            },
          });
          try {
            localStorage.setItem(
              SWAP_PRESET,
              JSON.stringify({
                symbol: chosenToken.symbol,
                amount: swapAmount,
                slippagePct,
                buys,
                intervalSec,
              }),
            );
          } catch {
            /* Ignore private-mode storage. */
          }
        }}
      >
        {tabs}
        <p className="swap-lead">
          Your agent swaps from a task wallet with a hard limit. Nothing else
          can be spent, and the token you buy returns to your wallet.
        </p>
        <div className="swap-pair">
          <label className="swap-field">
            You pay
            <span className="amount-input">
              <input
                aria-label="Amount to swap"
                type="number"
                step="any"
                min="0.000000001"
                max="10"
                required
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
              />
              <span>{config.chain.symbol}</span>
            </span>
          </label>
          <div className="swap-arrow">
            <ArrowRight size={18} />
          </div>
          <label className="swap-field">
            You receive
            <span className="amount-input">
              <input
                aria-label="Estimated tokens received"
                readOnly
                value={
                  quote
                    ? Number(quote.amountOut).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })
                    : quoting
                      ? "…"
                      : "—"
                }
              />
              <span>{chosenToken?.symbol || "Token"}</span>
            </span>
          </label>
        </div>
        <div className="token-chips" role="listbox" aria-label="Token to buy">
          {swapTokens
            .filter((t) => t.symbol !== "WETH")
            .map((t) => (
              <button
                key={t.address}
                type="button"
                role="option"
                aria-selected={swapSymbol === t.symbol}
                className={swapSymbol === t.symbol ? "chosen" : ""}
                onClick={() => setSwapSymbol(t.symbol)}
              >
                {t.symbol}
              </button>
            ))}
        </div>
        <div className={`swap-quote ${quoteErr ? "swap-quote-error" : ""}`}>
          {quoteErr ? (
            <span>{quoteErr}</span>
          ) : quote ? (
            <>
              <div className="swap-quote-main">
                <span>Estimated received</span>
                <strong>
                  ≈{" "}
                  {Number(quote.amountOut).toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}{" "}
                  {quote.symbol}
                </strong>
              </div>
              <dl>
                <div>
                  <dt>Rate</dt>
                  <dd>
                    1 {config.chain.symbol} ≈{" "}
                    {Number(quote.rate).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    {quote.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Minimum received</dt>
                  <dd>
                    {Number(quote.minOut).toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    {quote.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd>Uniswap V3 · {(quote.fee / 10000).toFixed(2)}% pool</dd>
                </div>
                {typeof quote.priceImpactBps === "number" && (
                  <div
                    className={
                      quote.priceImpactBps >= 300
                        ? "impact-high"
                        : quote.priceImpactBps >= 100
                          ? "impact-warn"
                          : undefined
                    }
                  >
                    <dt>Price impact</dt>
                    <dd>
                      {quote.priceImpactBps < 1
                        ? "< 0.01%"
                        : `${(quote.priceImpactBps / 100).toFixed(2)}%`}
                      {quote.priceImpactBps >= 300
                        ? " · high"
                        : quote.priceImpactBps >= 100
                          ? " · review size"
                          : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <span className="quiet">
              {quoting
                ? "Fetching best Uniswap price…"
                : "Enter an amount to price this swap."}
            </span>
          )}
        </div>
        <label className="swap-slippage">
          Max slippage
          <select
            value={slippagePct}
            onChange={(e) => setSlippagePct(Number(e.target.value))}
          >
            <option value={0.1}>0.1%</option>
            <option value={0.5}>0.5%</option>
            <option value={1}>1%</option>
          </select>
        </label>
        <label className="swap-slippage">
          Repeat (dollar-cost average)
          <select
            value={buys}
            onChange={(e) => setBuys(Number(e.target.value))}
          >
            <option value={1}>Once</option>
            <option value={3}>3 buys</option>
            <option value={5}>5 buys</option>
            <option value={10}>10 buys</option>
          </select>
        </label>
        {buys > 1 && (
          <>
            <label className="swap-slippage">
              Every
              <select
                value={intervalSec}
                onChange={(e) => setIntervalSec(Number(e.target.value))}
              >
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
                <option value={900}>15 minutes</option>
              </select>
            </label>
            <p className="helper">
              {buys} buys of {swapAmount} {config.chain.symbol} ={" "}
              <strong>
                {(Number(swapAmount) * buys).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}{" "}
                {config.chain.symbol}
              </strong>{" "}
              total, all capped by one onchain limit.
            </p>
          </>
        )}
        {buys <= 1 && (
          <label className="duration-label">
            Session length<span>{minutes} min</span>
            <input
              aria-label="Session length"
              type="range"
              min="5"
              max="60"
              step="5"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
        )}
        <div className="recovery-line">
          <ArrowRight size={14} />
          <span>
            {chosenToken?.symbol || "Tokens"} return to {short(owner)}
          </span>
          <span>Gas is separate</span>
        </div>
        <div className="form-actions">
          {onCancel && (
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="primary" disabled={!!busy || !canSwap}>
            {busy === "create" ? (
              <MeltLoader size={16} />
            ) : (
              <ArrowUpRight size={16} />
            )}
            {buys > 1 ? "Create recurring buy" : "Create swap wallet"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          url,
          title,
          instruction,
          budget,
          durationMinutes: minutes,
          target,
          selector,
          recovery: owner,
          kind: "browse",
        });
      }}
    >
      {tabs}
      <label>
        Task name
        <input
          required
          maxLength={100}
          value={title}
          placeholder="Mint this collectible"
          onChange={(e) => {
            setExample("custom");
            setTitle(e.target.value);
          }}
        />
      </label>
      <label>
        What should your agent do?
        <textarea
          required
          maxLength={2000}
          rows={3}
          value={instruction}
          placeholder="Connect only the task wallet, complete the job inside the spending limit, and return leftover funds."
          onChange={(e) => {
            setExample("custom");
            setInstruction(e.target.value);
          }}
        />
      </label>
      <label>
        Starting website
        <input
          aria-label="Starting website"
          type="url"
          value={url}
          placeholder="https:// — optional if the job already includes a link"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <div className="allowance-picker">
        <div>
          <label>
            Spending limit
            <span className="amount-input">
              <input
                aria-label="Spending limit"
                type="number"
                step="any"
                min="0.000000001"
                max="10"
                required
                value={budget}
                onChange={(e) => {
                  setBudget(e.target.value);
                  setBudgetRange(
                    Math.max(0.001, Math.min(10, Number(e.target.value) || 0)),
                  );
                }}
              />
              <span>{config.chain.symbol}</span>
            </span>
          </label>
        </div>
        <BudgetRibbon
          value={Number(budget)}
          total={budgetRange}
          large
          symbol={config.chain.symbol}
          onChange={(value) => setBudget(String(value))}
        />
      </div>
      <label className="duration-label">
        Session length<span>{minutes} min</span>
        <input
          aria-label="Session length"
          type="range"
          min="5"
          max="60"
          step="5"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </label>
      <details>
        <summary>Limit where it can spend</summary>
        <p className="helper">
          Optional. Leave empty to allow any contract call inside the spending
          limit, except approvals and token transfers.
        </p>
        <label>
          Contract address
          <input
            pattern="0x[0-9a-fA-F]{40}"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <label>
          Function selector
          <input
            pattern="0x[0-9a-fA-F]{8}"
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
          />
        </label>
      </details>
      <div className="recovery-line">
        <ArrowRight size={14} />
        <span>Funds return to {short(owner)}</span>
        <span>Gas costs are separate</span>
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="primary"
          disabled={!!busy || config.browserAvailable === false}
        >
          {busy === "create" ? <MeltLoader size={16} /> : <Plus size={16} />}
          Create task wallet
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
function SessionDetail({
  task: t,
  config,
  request,
  act,
  busy,
  auth,
  owner,
  notify,
  now,
  download,
  share,
  repeat,
}: {
  task: Task;
  config: Config;
  request: any;
  act: any;
  busy: string;
  auth?: Auth;
  owner: string;
  notify: (s: string) => void;
  now: number;
  download: () => void;
  share: () => void;
  repeat: () => void;
}) {
  const [shot, setShot] = useState(""),
    [controls, setControls] = useState<any[]>([]),
    [input, setInput] = useState(""),
    [siteUrl, setSiteUrl] = useState(""),
    [browserError, setBrowserError] = useState(""),
    [fundHash, setFundHash] = useState(
      () => localStorage.getItem("melt-funding:" + t.id) || "",
    );
  const shotRef = useRef("");
  useEffect(() => {
    let alive = true;
    async function load() {
      if (
        document.hidden ||
        t.kind === "swap" ||
        !["running", "paused"].includes(t.status)
      )
        return;
      try {
        const token = await auth?.getToken();
        const r = await fetch(`/api/sessions/${t.id}/screenshot`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (r.ok) {
          const url = URL.createObjectURL(await r.blob());
          if (!alive) {
            URL.revokeObjectURL(url);
            return;
          }
          URL.revokeObjectURL(shotRef.current);
          shotRef.current = url;
          setShot(url);
          setBrowserError("");
        }
      } catch {
        if (alive)
          setBrowserError("Browser preview is temporarily unavailable.");
      }
    }
    void load();
    const timer = setInterval(load, 1400);
    return () => {
      alive = false;
      clearInterval(timer);
      URL.revokeObjectURL(shotRef.current);
    };
  }, [t.id, t.status]);
  async function command(name: string) {
    await act(name, () =>
      request(
        `/sessions/${t.id}/${name}`,
        name === "start" ? { manual: !config.modelConfigured } : {},
      ),
    );
  }
  const gas = t.transactions.reduce(
      (n, tx) => n + Number(tx.gasWei || 0) / 1e18,
      0,
    ),
    returnedAssets = t.assets.filter((asset) => asset.recovered).length,
    recoveredTokens = t.assets.filter(
      (asset) => asset.kind === "erc20" && asset.recovered,
    ),
    buysDone = confirmedBuys(t);
  return (
    <>
      <section className="detail-heading">
        <div>
          <h1>{t.title}</h1>
          <p>
            {t.kind === "swap" ? (
              <>
                Uniswap V3 <span className="divider-dot">·</span> Automated swap
              </>
            ) : (
              <>
                {siteHost(t.url)} <span className="divider-dot">·</span>{" "}
                {t.agentMode === "model"
                  ? "AI browser agent"
                  : "Manual control"}
              </>
            )}
          </p>
        </div>
        <span className={`status status-${t.status}`}>
          {statusLabel[t.status]}
        </span>
      </section>
      <p className="session-mandate">{mandateText(t, config.chain.symbol)}</p>
      <div className="work-grid">
        <aside className="wallet-panel panel">
          <SessionSeal status={t.status} />
          <div className="balance-heading">
            <span>Spending limit</span>
            <h2>
              {t.budget}
              <small>{config.chain.symbol}</small>
            </h2>
          </div>
          <BudgetRibbon
            value={Number(t.spent)}
            total={Number(t.budget)}
            large
          />
          <p className="budget-used">
            {Math.min(
              100,
              Math.round((Number(t.spent) / Number(t.budget)) * 100),
            )}
            % of limit used
          </p>
          <dl className="wallet-facts">
            <div>
              <dt>Spent</dt>
              <dd>
                {t.spent} {config.chain.symbol}
              </dd>
            </div>
            <div>
              <dt>Returned</dt>
              <dd>
                {t.returned} {config.chain.symbol}
              </dd>
            </div>
            <div>
              <dt>Time left</dt>
              <dd>
                {t.status === "closed"
                  ? "Session ended"
                  : remainingLabel(t.expiresAt, now, false)}
              </dd>
            </div>
            {t.kind === "swap" && (t.swap?.buys || 1) > 1 && (
              <div>
                <dt>Buys</dt>
                <dd>
                  {buysDone} / {t.swap?.buys}
                </dd>
              </div>
            )}
            {recoveredTokens.length > 0 && (
              <div>
                <dt>Recovered</dt>
                <dd>
                  {recoveredTokens
                    .map((a) =>
                      a.amount && a.symbol
                        ? `${formatAmount(Number(a.amount))} ${a.symbol}`
                        : tokenSymbol(a, config.swap),
                    )
                    .join(", ")}
                </dd>
              </div>
            )}
            <div>
              <dt>Return wallet</dt>
              <dd>{short(t.recovery)}</dd>
            </div>
          </dl>
          <details>
            <summary>Wallet details</summary>
            <p className="identifier vault-line">
              {t.vault}
              {t.vault && (
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(t.vault)
                      .then(() => notify("Task wallet copied"))
                  }
                >
                  <Copy size={13} />
                  Copy
                </button>
              )}
            </p>
            <p className="helper">
              {t.target && t.selector ? (
                <>
                  Allowed contract: {short(t.target)}
                  <br />
                  Allowed function: {t.selector}
                </>
              ) : (
                "Any contract call inside the spending limit, except approvals and token transfers."
              )}
              <br />
              Gas paid: {gas.toFixed(7)} {config.chain.symbol}
            </p>
          </details>
          {t.receiptToken && (
            <button className="secondary wide" onClick={share}>
              <Link2 size={15} />
              Share receipt
            </button>
          )}
          {t.status === "closed" ? (
            <>
              <button className="secondary wide" onClick={download}>
                <Download size={15} />
                Download receipt
              </button>
              <button
                className="quiet-button wide"
                disabled={!!busy}
                onClick={() => command("close")}
              >
                <RotateCcw size={13} />
                Recover new funds
              </button>
            </>
          ) : (
            <button
              className="quiet-button wide"
              disabled={
                !!busy ||
                t.status === "closing" ||
                (!t.vault &&
                  !t.transactions.some(
                    (tx) =>
                      tx.kind === "Create task wallet" &&
                      tx.status !== "reverted",
                  ))
              }
              onClick={() => command("close")}
            >
              <Square size={12} />
              {t.status === "attention"
                ? "Retry recovery"
                : "End & return funds"}
            </button>
          )}
          {t.vault && (
            <a className="quiet-button wide" href={`/recover?vault=${t.vault}`}>
              <ShieldCheck size={14} /> Recover without Melt
            </a>
          )}
          {t.status === "closed" && (
            <button className="secondary wide" onClick={repeat}>
              <RotateCcw size={14} /> Use this setup again
            </button>
          )}
          {["closed", "attention"].includes(t.status) && (
            <AssetRecovery task={t} request={request} act={act} busy={busy} />
          )}
        </aside>
        <section className="workspace panel">
          <div className="browser-toolbar">
            <span>
              <Globe size={14} />
              {t.browserTitle || "Task browser"}
            </span>
            {t.status === "paused" && t.kind !== "swap" && (
              <form
                className="browser-url"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = siteUrl.trim();
                  if (!next) return;
                  void act("open", () =>
                    request(`/sessions/${t.id}/action`, {
                      type: "open",
                      url: next,
                    }),
                  );
                }}
              >
                <input
                  type="url"
                  value={siteUrl}
                  placeholder={t.browserUrl || "https://"}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  aria-label="Open website"
                />
                <button type="submit" disabled={!!busy}>
                  Open
                </button>
              </form>
            )}
            <div>
              {t.status === "running" && t.kind !== "swap" && (
                <button disabled={!!busy} onClick={() => command("pause")}>
                  <MousePointer2 size={14} />
                  Take control
                </button>
              )}
              {t.status === "paused" && config.modelConfigured && (
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => command("start")}
                >
                  <Play size={14} />
                  Resume agent
                </button>
              )}
            </div>
          </div>
          <div className="browser-stage">
            {shot && ["running", "paused"].includes(t.status) ? (
              <img
                className="browser-shot"
                src={shot}
                alt="Live view of the isolated task browser"
              />
            ) : (
              <div className="browser-idle">
                {t.status === "closed" ? (
                  <div className="result-object">
                    <SessionSeal status="closed" />
                  </div>
                ) : (
                  <div className="browser-window-mark">
                    <i />
                    <i />
                    <i />
                    <ArrowUpRight size={28} />
                  </div>
                )}
                <h2>
                  {t.kind === "swap"
                    ? t.status === "closed"
                      ? t.assets.some((a) => a.recovered)
                        ? recoveredTokens[0]?.amount
                          ? `${formatAmount(Number(recoveredTokens[0].amount))} ${recoveredTokens[0].symbol || t.swap?.symbol} returned to your wallet`
                          : `${t.swap?.symbol || "Token"} returned to your wallet`
                        : "Swap session closed"
                      : t.status === "closing"
                        ? "Returning your token"
                        : t.status === "funding"
                          ? "Add funds to swap"
                          : t.status === "attention"
                            ? "Review your session"
                            : t.status === "running"
                              ? "Swapping on Uniswap"
                              : "Ready to swap"
                    : t.status === "closed"
                      ? t.assets.some((a) => a.recovered)
                        ? "Assets returned"
                        : "Session closed"
                      : t.status === "closing"
                        ? "Returning your funds and assets"
                        : t.status === "funding"
                          ? "Add funds to start"
                          : t.status === "attention"
                            ? "Review your session"
                            : t.status === "ready"
                              ? "Ready to start your task"
                              : "Opening your task browser"}
                </h2>
                <p>
                  {t.kind === "swap"
                    ? t.status === "closed"
                      ? `Swapped ${t.spent} ${config.chain.symbol} for ${t.swap?.symbol || "tokens"} · agent spending disabled`
                      : t.error ||
                        (t.status === "closing"
                          ? "Returning your purchased token and any unused funds."
                          : t.status === "running"
                            ? `Buying ${t.swap?.symbol || "tokens"} inside your spending limit, then returning it to you.`
                            : t.status === "ready"
                              ? `Melt will swap ${t.swap?.amountIn} ${config.chain.symbol} for ${t.swap?.symbol} through Uniswap V3, within your limit.`
                              : "Add the funds this swap can use. Gas costs are separate.")
                    : t.status === "closed"
                      ? `${returnedAssets} ${returnedAssets === 1 ? "asset" : "assets"} returned · agent spending disabled`
                      : t.error ||
                        (t.status === "closing"
                          ? "Ending agent access and returning funds to your wallet."
                          : t.status === "funding"
                            ? "Add the funds this task can use. Gas costs are separate."
                            : t.status === "attention"
                              ? "Check the activity below, then retry recovery."
                              : t.status === "ready"
                                ? t.url
                                  ? "Your agent will open the website using this wallet."
                                  : "Your agent will open a browser using this wallet."
                                : "Your browser preview will appear here.")}
                </p>
                {t.status === "ready" && (
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => command("start")}
                  >
                    {busy === "start" ? (
                      <MeltLoader size={15} />
                    ) : (
                      <Play size={15} />
                    )}
                    {t.kind === "swap"
                      ? "Run swap on Uniswap"
                      : config.modelConfigured
                        ? "Start task"
                        : "Open task browser"}
                  </button>
                )}
                {t.status === "funding" && (
                  <>
                    <button
                      className="primary"
                      disabled={!auth || !!busy || !!fundHash}
                      onClick={() =>
                        act("fund", async () => {
                          const hash = await auth!.send({
                            from: owner,
                            to: t.vault,
                            value: toHex(parseEther(t.budget)),
                          });
                          setFundHash(hash);
                          localStorage.setItem("melt-funding:" + t.id, hash);
                          try {
                            await auth!.wait!(hash);
                          } catch (e) {
                            if (
                              (e as Error).message === "Transaction reverted"
                            ) {
                              setFundHash("");
                              localStorage.removeItem("melt-funding:" + t.id);
                            }
                            throw e;
                          }
                          await request(`/sessions/${t.id}/funding`, { hash });
                        })
                      }
                    >
                      <Wallet size={15} />
                      Add {t.budget} {config.chain.symbol}
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        fundHash
                          ? act("refresh", () =>
                              request(`/sessions/${t.id}/funding`, {
                                hash: fundHash,
                              }),
                            )
                          : command("refresh")
                      }
                    >
                      Check balance
                    </button>
                    {fundHash && (
                      <p className="helper">
                        Transfer sent: {short(fundHash)}. Check its status in
                        your wallet before sending again.
                      </p>
                    )}
                    <details className="funding-help">
                      <summary>
                        Need {config.chain.symbol} in your wallet?
                      </summary>
                      <p>
                        Send {config.chain.symbol} on {config.chain.name} to
                        your return wallet, then fund this task.
                      </p>
                      <code>{owner}</code>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          act("copy-owner", async () => {
                            await navigator.clipboard.writeText(owner);
                          })
                        }
                      >
                        <Copy size={14} /> Copy wallet address
                      </button>
                      {config.chain.id === 11155111 && (
                        <a
                          href="https://ethglobal.com/faucet/sepolia-11155111-eth"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Get test ETH <ExternalLink size={12} />
                        </a>
                      )}
                    </details>
                    <p className="identifier">Task wallet: {t.vault}</p>
                  </>
                )}
              </div>
            )}
          </div>
          {browserError && <p className="helper">{browserError}</p>}
          {t.status === "paused" && t.kind !== "swap" && (
            <div className="manual-controls">
              <button
                className="secondary"
                onClick={() =>
                  act("observe", async () => {
                    const data = await request(`/sessions/${t.id}/browser`);
                    setControls(data.controls);
                  })
                }
              >
                <MousePointer2 size={14} />
                View browser controls
              </button>
              {controls.length > 0 && (
                <div className="control-list">
                  <input
                    placeholder="Enter text for a page field"
                    aria-label="Text for page field"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  {controls.map((c) => (
                    <button
                      key={c.index}
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        act("action", () =>
                          request(`/sessions/${t.id}/action`, {
                            type: ["input", "textarea"].includes(c.tag)
                              ? "fill"
                              : "click",
                            index: c.index,
                            ...(["input", "textarea"].includes(c.tag)
                              ? { value: input }
                              : {}),
                          }),
                        )
                      }
                    >
                      {c.label || c.tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {t.status === "funding" && auth && config.swapsConfigured && (
            <FundingSwap
              request={request}
              auth={auth}
              owner={owner}
              symbol={config.chain.symbol}
              explorer={config.chain.explorer}
              chainId={config.chain.id}
              act={act}
              busy={busy}
            />
          )}
          {t.outcome && t.outcome !== "pending" && (
            <p className="task-outcome">
              <strong>
                {t.outcome === "succeeded"
                  ? "Action confirmed"
                  : t.outcome === "cancelled"
                    ? "Task ended"
                    : "Task incomplete"}
              </strong>
              {t.outcomeReason && <span>{t.outcomeReason}</span>}
            </p>
          )}
          <div className="activity">
            <div className="section-top">
              <h2>Session activity</h2>
              <span className="quiet">{t.events.length} events</span>
            </div>
            <div className="event-list" aria-live="polite">
              {t.events.slice(-7).map((e) => (
                <div key={e.id} className={`event event-${e.kind}`}>
                  <span className="event-icon">
                    {e.kind === "success" ? (
                      <Check size={13} />
                    ) : e.kind === "blocked" ? (
                      <ShieldCheck size={13} />
                    ) : e.kind === "error" ? (
                      <X size={13} />
                    ) : (
                      <ArrowUpRight size={13} />
                    )}
                  </span>
                  <div>
                    <span>{e.text}</span>
                    {e.hash &&
                      (config.chain.explorer ? (
                        <a
                          href={`${config.chain.explorer}/tx/${e.hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {short(e.hash)} <ExternalLink size={11} />
                        </a>
                      ) : (
                        <small>{short(e.hash)}</small>
                      ))}
                  </div>
                  <time>
                    {new Date(e.at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
function Developers({
  request,
  user,
  signIn,
  act,
  busy,
  notify,
}: {
  request: any;
  user: string;
  signIn: () => void;
  act: any;
  busy: string;
  notify: (s: string) => void;
}) {
  const hookEvents = [
      "session.created",
      "session.funded",
      "session.started",
      "swap.executed",
      "session.closed",
      "session.recovered",
    ],
    [keys, setKeys] = useState<any[]>([]),
    [token, setToken] = useState(""),
    [keyError, setKeyError] = useState(""),
    [hooks, setHooks] = useState<any[]>([]),
    [events, setEvents] = useState<any[]>([]),
    [hookUrl, setHookUrl] = useState(""),
    [hookSecret, setHookSecret] = useState(""),
    [selectedEvents, setSelectedEvents] = useState<string[]>(hookEvents);
  async function refresh() {
    if (!user) return;
    const [nextKeys, nextHooks, nextEvents] = await Promise.all([
      request("/keys"),
      request("/webhooks"),
      request("/events"),
    ]);
    setKeys(nextKeys);
    setHooks(nextHooks);
    setEvents(nextEvents);
  }
  useEffect(() => {
    let alive = true;
    setToken("");
    setHookSecret("");
    setKeys([]);
    setHooks([]);
    setEvents([]);
    setKeyError("");
    if (user)
      void Promise.all([
        request("/keys"),
        request("/webhooks"),
        request("/events"),
      ])
        .then(([nextKeys, nextHooks, nextEvents]) => {
          if (!alive) return;
          setKeys(nextKeys);
          setHooks(nextHooks);
          setEvents(nextEvents);
        })
        .catch((e: Error) => {
          if (alive) setKeyError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [user]);
  return (
    <>
      <section className="intro">
        <div>
          <h1>Connect your agent to Melt</h1>
          <p>
            Run sessions over HTTP, share a public receipt, and receive
            HMAC-signed webhooks when spending starts, swaps land, or funds
            return.
          </p>
        </div>
        <a
          className="secondary"
          href="/api/openapi.json"
          target="_blank"
          rel="noreferrer"
        >
          <Code2 size={15} />
          OpenAPI
          <ArrowUpRight size={15} />
        </a>
      </section>
      <div className="developer-grid">
        <section className="panel dev-panel">
          <h2>Use the session API</h2>
          <p>
            Create and fund a session in Melt, then use an API key to run it.
            Keys can’t create wallets or increase spending limits.
          </p>
          <pre>
            <code>{`import { Melt } from './melt-client.mjs';\n\nconst melt = new Melt({\n  baseUrl: '${location.origin}',\n  apiKey: process.env.MELT_API_KEY\n});\n\nawait melt.start(sessionId);\nawait melt.wait(sessionId);\nconst receipt = await melt.receipt(sessionId);`}</code>
          </pre>
          <a className="secondary" href="/api/client.mjs">
            <Download size={14} /> Download JavaScript client
          </a>
          <p className="helper">
            One file, no dependencies. Keep your API key on the server.
          </p>
          <div className="api-endpoints">
            {[
              ["GET", "/api/sessions", "List your sessions"],
              ["POST", "/api/swap/quote", "Quote an ETH→token Uniswap swap"],
              ["GET", "/api/swap/tokens", "List swappable tokens"],
              ["POST", "/api/sessions/:id/start", "Run a session or swap"],
              ["POST", "/api/sessions/:id/pause", "Pause the agent"],
              [
                "GET",
                "/api/sessions/:id/browser",
                "Read visible page controls",
              ],
              [
                "POST",
                "/api/sessions/:id/action",
                "Click or fill a visible control",
              ],
              [
                "POST",
                "/api/sessions/:id/close",
                "End the session and return funds",
              ],
              [
                "GET",
                "/api/sessions/:id/receipt",
                "Download the private receipt",
              ],
              [
                "GET",
                "/api/public/receipts/:token",
                "Open the shareable public receipt",
              ],
              ["GET", "/api/events", "List recent webhook events"],
              ["POST", "/api/webhooks", "Register a signed webhook endpoint"],
            ].map(([method, path, label]) => (
              <div key={path}>
                <span>{method}</span>
                <code>{path}</code>
                <p>{label}</p>
              </div>
            ))}
          </div>
        </section>
        <aside className="panel dev-panel">
          <KeyRound size={22} />
          <h2>API keys</h2>
          {keyError && <p role="alert">{keyError}</p>}
          <p>Each key is shown once. You can revoke access at any time.</p>
          {user ? (
            <>
              <button
                className="primary wide"
                disabled={!!busy}
                onClick={() =>
                  act("key", async () => {
                    const data = await request("/keys", {
                      name: `Agent ${keys.length + 1}`,
                    });
                    setToken(data.token);
                    await refresh();
                  })
                }
              >
                <Plus size={15} />
                Create API key
              </button>
              {token && (
                <div className="key-reveal">
                  <code>{token}</code>
                  <button
                    className="secondary wide"
                    onClick={() =>
                      act("copy", async () => {
                        await navigator.clipboard.writeText(token);
                        notify("Key copied");
                      })
                    }
                  >
                    <Copy size={13} />
                    Copy key
                  </button>
                </div>
              )}
              {keys.map((k) => (
                <div className="key-row" key={k.id}>
                  <span>
                    {k.name}
                    <small>{k.revoked ? "Revoked" : "Active"}</small>
                  </span>
                  <button
                    aria-label={`Revoke ${k.name}`}
                    disabled={!!k.revoked || !!busy}
                    onClick={() =>
                      act("revoke", async () => {
                        await request(`/keys/${k.id}`, undefined, "DELETE");
                        await refresh();
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <button className="secondary" onClick={signIn}>
              Sign in to create an API key
            </button>
          )}
          <div className="mcp-note">
            <h2>Connect with MCP</h2>
            <p>
              Use Melt from an MCP-compatible agent. The included server
              provides Uniswap quotes plus session and browser controls, all
              bounded by limits the agent cannot raise.
            </p>
            <pre>
              <code>npm run agent:mcp</code>
            </pre>
          </div>
        </aside>
      </div>
      <div className="receipt-grid developers-webhooks">
        <section className="panel webhook-log">
          <h2>Events</h2>
          <p className="helper">
            The same event objects Melt posts to your webhook. Agent keys cannot
            read this log.
          </p>
          {user ? (
            events.length ? (
              events.map((item) => (
                <div className="event-row" key={item.id}>
                  <div>
                    <code>{item.type}</code>
                    {item.taskId && (
                      <p className="quiet">{item.taskId.slice(0, 8)}</p>
                    )}
                  </div>
                  <time>
                    {new Date(item.created).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                </div>
              ))
            ) : (
              <p className="helper">
                No events yet. Create a session to see one.
              </p>
            )
          ) : (
            <button className="secondary" onClick={signIn}>
              Sign in to see events
            </button>
          )}
        </section>
        <section className="panel webhook-log">
          <h2>Webhooks</h2>
          <p className="helper">
            Melt signs the raw JSON with HMAC-SHA256 and sends a Melt-Signature
            header in Stripe’s t=,v1= form. HTTPS is required in production.
          </p>
          {user ? (
            <>
              <label className="hook-url">
                Endpoint URL
                <input
                  value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)}
                  placeholder="https://example.com/melt-webhooks"
                />
              </label>
              <div className="hook-events">
                {hookEvents.map((type) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(type)}
                      onChange={() =>
                        setSelectedEvents((current) =>
                          current.includes(type)
                            ? current.filter((item) => item !== type)
                            : [...current, type],
                        )
                      }
                    />
                    {type}
                  </label>
                ))}
              </div>
              <button
                className="primary wide"
                disabled={!!busy || !hookUrl.trim() || !selectedEvents.length}
                onClick={() =>
                  act("webhook", async () => {
                    const created = await request("/webhooks", {
                      url: hookUrl.trim(),
                      events: selectedEvents,
                    });
                    setHookSecret(created.secret);
                    setHookUrl("");
                    await refresh();
                  })
                }
              >
                <Plus size={15} />
                Add endpoint
              </button>
              {hookSecret && (
                <div className="key-reveal">
                  <code>{hookSecret}</code>
                  <button
                    className="secondary wide"
                    onClick={() =>
                      act("copy-secret", async () => {
                        await navigator.clipboard.writeText(hookSecret);
                        notify("Signing secret copied");
                      })
                    }
                  >
                    <Copy size={13} />
                    Copy signing secret
                  </button>
                  <p className="helper">Shown once. Store it on your server.</p>
                </div>
              )}
              <pre>
                <code>{`import { constructEvent } from './melt-client.mjs';\n\nconst event = await constructEvent(\n  rawBody,\n  request.headers['melt-signature'],\n  process.env.MELT_WEBHOOK_SECRET\n);`}</code>
              </pre>
              {hooks.map((hook) => (
                <div className="hook-row" key={hook.id}>
                  <div>
                    <code>{hook.url}</code>
                    <p className="quiet">{hook.events.join(", ")}</p>
                  </div>
                  <div className="hook-actions">
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        act("ping", async () => {
                          const result = await request(
                            `/webhooks/${hook.id}/ping`,
                            {},
                          );
                          notify(
                            result.delivered
                              ? "Test event delivered"
                              : "Endpoint did not accept the test event",
                          );
                          await refresh();
                        })
                      }
                    >
                      Send test
                    </button>
                    <button
                      aria-label={`Delete webhook ${hook.url}`}
                      disabled={!!busy}
                      onClick={() =>
                        act("delete-hook", async () => {
                          await request(
                            `/webhooks/${hook.id}`,
                            undefined,
                            "DELETE",
                          );
                          await refresh();
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <button className="secondary" onClick={signIn}>
              Sign in to add a webhook
            </button>
          )}
        </section>
      </div>
    </>
  );
}

function AssetRecovery({
  task,
  request,
  act,
  busy,
}: {
  task: Task;
  request: any;
  act: any;
  busy: string;
}) {
  const [kind, setKind] = useState("erc721"),
    [token, setToken] = useState(""),
    [tokenId, setTokenId] = useState("");
  return (
    <details className="asset-recovery">
      <summary>Recover another asset</summary>
      <p className="helper">
        Send tokens or collectibles received after this session closed to your
        return wallet.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act("recover", () =>
            request(`/sessions/${task.id}/recover`, {
              kind,
              token,
              ...(kind === "erc721" ? { tokenId } : {}),
            }),
          );
        }}
      >
        <label>
          Asset type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="erc721">Collectible (ERC-721)</option>
            <option value="erc20">Token (ERC-20)</option>
          </select>
        </label>
        <label>
          Asset contract
          <input
            required
            pattern="0x[0-9a-fA-F]{40}"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        {kind === "erc721" && (
          <label>
            Token ID
            <input
              required
              pattern="[0-9]+"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
            />
          </label>
        )}
        <button className="secondary wide" disabled={!!busy}>
          Return asset
        </button>
      </form>
    </details>
  );
}
