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
} from "lucide-react";
import { parseEther, toHex } from "viem";
import type {
  Config,
  Task,
  CreateTask,
  TaskStatus,
} from "../../../packages/shared/src/index";
import { BudgetRibbon } from "./components/BudgetRibbon";
import { GooeyNav } from "./components/ui/gooey-nav";
import { SessionSeal } from "./SessionSeal";
import { FundingSwap } from "./FundingSwap";
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

export default function App({ config, auth }: { config: Config; auth?: Auth }) {
  const [user, setUser] = useState<{ id: string; owner: string } | null>(null),
    [tasks, setTasks] = useState<Task[]>([]),
    [page, setPage] = useState(pageFromHash),
    [selected, setSelected] = useState<string>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [newTask, setNewTask] = useState(false),
    [draft, setDraft] = useState<CreateTask>();
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
    active = tasks.filter((t) => t.status !== "closed");
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
      <header>
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
              download={() => download(task)}
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
                    ? "Review spending, returned assets, and transaction details for every session."
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
              <div className="launch-grid">
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
                        className="primary wide"
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
                          className="quiet-button wide"
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
                <aside className="welcome-wallet panel">
                  <SessionSeal />
                  <div>
                    <h2>Keep your main wallet separate.</h2>
                    <p>
                      Your agent spends from a task wallet with a limit you set.
                      Unused funds return when the session ends.
                    </p>
                  </div>
                  <div className="wallet-footer">
                    <ShieldCheck size={14} />
                    Spending limits enforced onchain
                  </div>
                </aside>
              </div>
            ) : null}
            {user && tasks.length > 0 && (
              <section className="session-list">
                <div className="section-top">
                  <h2>
                    {page === "Receipts" ? "Session history" : "Your sessions"}
                  </h2>
                  <span className="quiet">{active.length} open</span>
                </div>
                {tasks.map((t) => (
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
                      ) : (
                        <ArrowUpRight size={19} />
                      )}
                    </div>
                    <div className="row-name">
                      <strong>{t.title}</strong>
                      <span>
                        {siteHost(t.url)} ·{" "}
                        {new Date(t.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <span className={`status status-${t.status}`}>
                      {statusLabel[t.status]}
                    </span>
                    <span className="row-amount">
                      {t.spent} <small>{config.chain.symbol}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
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
}: {
  config: Config;
  owner: string;
  busy: string;
  initial?: CreateTask;
  onSubmit: (body: CreateTask) => void;
  onCancel?: () => void;
}) {
  const mint = {
    title: "Mint a field note",
    instruction:
      "Connect the wallet and mint one field note. Return the collectible and remaining funds when done.",
    url: config.fixture.url,
    target: config.fixture.target,
    selector: config.fixture.selector,
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
  const swap = config.swapsConfigured
    ? {
        title: "Swap tokens",
        instruction:
          "Open Uniswap, connect the task wallet, and swap within the spending limit. Return leftover funds when done.",
        url: "https://app.uniswap.org",
        target: "",
        selector: "",
      }
    : undefined;
  const [example, setExample] = useState("custom");
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
        });
      }}
    >
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
        {swap && (
          <button
            className={example === "swap" ? "chosen" : ""}
            type="button"
            onClick={() => {
              setExample("swap");
              apply(swap);
            }}
          >
            Swap
          </button>
        )}
      </div>
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
          placeholder="Connect, complete the job inside the spending limit, and return leftover funds."
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
          placeholder="Optional"
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
  download,
  repeat,
}: {
  task: Task;
  config: Config;
  request: any;
  act: any;
  busy: string;
  auth?: Auth;
  owner: string;
  download: () => void;
  repeat: () => void;
}) {
  const [shot, setShot] = useState(""),
    [controls, setControls] = useState<any[]>([]),
    [input, setInput] = useState(""),
    [browserError, setBrowserError] = useState(""),
    [fundHash, setFundHash] = useState(
      () => localStorage.getItem("melt-funding:" + t.id) || "",
    );
  const shotRef = useRef("");
  useEffect(() => {
    let alive = true;
    async function load() {
      if (document.hidden || !["running", "paused"].includes(t.status)) return;
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
  const remaining = Math.max(0, t.expiresAt - Math.floor(Date.now() / 1000)),
    gas = t.transactions.reduce(
      (n, tx) => n + Number(tx.gasWei || 0) / 1e18,
      0,
    ),
    returnedAssets = t.assets.filter((asset) => asset.recovered).length;
  return (
    <>
      <section className="detail-heading">
        <div>
          <h1>{t.title}</h1>
          <p>
            {siteHost(t.url)} <span className="divider-dot">·</span>{" "}
            {t.agentMode === "model" ? "AI browser agent" : "Manual control"}
          </p>
        </div>
        <span className={`status status-${t.status}`}>
          {statusLabel[t.status]}
        </span>
      </section>
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
                  : `${Math.floor(remaining / 60)}m ${remaining % 60}s`}
              </dd>
            </div>
            <div>
              <dt>Return wallet</dt>
              <dd>{short(t.recovery)}</dd>
            </div>
          </dl>
          <details>
            <summary>Wallet details</summary>
            <p className="identifier">{t.vault}</p>
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
            <div>
              {t.status === "running" && (
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
                  {t.status === "closed"
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
                  {t.status === "closed"
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
                    {config.modelConfigured
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
          {t.status === "paused" && (
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
  const [keys, setKeys] = useState<any[]>([]),
    [token, setToken] = useState(""),
    [keyError, setKeyError] = useState("");
  async function refresh() {
    if (user) setKeys(await request("/keys"));
  }
  useEffect(() => {
    let alive = true;
    setToken("");
    setKeys([]);
    setKeyError("");
    if (user)
      void request("/keys")
        .then((rows: any[]) => {
          if (alive) setKeys(rows);
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
            Start tasks, control the browser, and retrieve receipts through the
            API.
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
              ["POST", "/api/sessions/:id/start", "Start the browser agent"],
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
              ["GET", "/api/sessions/:id/receipt", "Get the session receipt"],
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
              provides the same session and browser controls.
            </p>
            <pre>
              <code>npm run agent:mcp</code>
            </pre>
          </div>
        </aside>
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
