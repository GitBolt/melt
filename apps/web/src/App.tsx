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
  Loader2,
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
import { CapacityRibbon } from "./components/CapacityMotion";
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
const statusLabel: Record<TaskStatus, string> = {
  funding: "Needs funding",
  ready: "Ready",
  running: "Agent working",
  paused: "Agent paused",
  closing: "Returning funds",
  closed: "Session closed",
  attention: "Review needed",
};
export default function App({ config, auth }: { config: Config; auth?: Auth }) {
  const [user, setUser] = useState<{ id: string; owner: string } | null>(null),
    [tasks, setTasks] = useState<Task[]>([]),
    [page, setPage] = useState("Sessions"),
    [selected, setSelected] = useState<string>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [newTask, setNewTask] = useState(false);
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
    try {
      const me = await request("/me");
      setUser(me);
      setTasks(await request("/sessions"));
    } catch (e) {
      if ((e as any).status === 401) {
        setUser(null);
        setTasks([]);
      } else setError((e as Error).message);
    }
  }, [request]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2000);
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
          melt
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
          {config.modelConfigured
            ? "AI agent enabled"
            : config.mode === "local"
              ? "Scripted demo"
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
            />
          </>
        ) : (
          <>
            <section className="intro">
              <div>
                <h1>
                  {page === "Receipts"
                    ? "See where your funds went."
                    : "Give your agent a wallet for the task."}
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
                        })
                      }
                    />
                  ) : (
                    <>
                      <p className="sign-in-copy">
                        Choose a website and tell your agent what to do. You set
                        the budget before it starts.
                      </p>
                      <div className="example-task">
                        <Globe size={17} />
                        <span>
                          Mint one collectible
                          <span>0.0003 ETH limit · 15 minutes</span>
                        </span>
                        <ArrowUpRight size={17} />
                      </div>
                      <button
                        className="primary wide"
                        onClick={signIn}
                        disabled={!!busy}
                      >
                        {busy === "signin" ? (
                          <Loader2 size={16} className="spin" />
                        ) : null}
                        {config.mode === "local"
                          ? "Try the demo"
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
                      Your agent uses a task wallet with limits you set.
                      Recovery stays available after the session ends.
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
                        {new URL(t.url).hostname} ·{" "}
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
        <span>Melt · Task wallets for agents</span>
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
  config,
  owner,
  busy,
  onSubmit,
  onCancel,
}: {
  config: Config;
  owner: string;
  busy: string;
  onSubmit: (body: CreateTask) => void;
  onCancel?: () => void;
}) {
  const [custom, setCustom] = useState(!config.fixture.available),
    [url, setUrl] = useState(
      config.fixture.available ? config.fixture.url : "",
    ),
    [title, setTitle] = useState("Mint a field note"),
    [instruction, setInstruction] = useState(
      "Connect the wallet and mint one field note. Return the collectible and remaining funds when done.",
    ),
    [budget, setBudget] = useState("0.0003"),
    [minutes, setMinutes] = useState(15),
    [target, setTarget] = useState(config.fixture.target),
    [selector, setSelector] = useState(config.fixture.selector);
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
        {config.fixture.available && (
          <button
            className={!custom ? "chosen" : ""}
            type="button"
            onClick={() => {
              setCustom(false);
              setUrl(config.fixture.url);
              setTarget(config.fixture.target);
              setSelector(config.fixture.selector);
            }}
          >
            Mint a collectible
          </button>
        )}
        <button
          className={custom ? "chosen" : ""}
          type="button"
          onClick={() => setCustom(true)}
        >
          Use another website
        </button>
      </div>
      <label>
        Website
        <input
          aria-label="Website"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      {custom && (
        <label>
          Task name
          <input
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      )}
      <label>
        What should your agent do?
        <textarea
          required
          maxLength={2000}
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
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
                onChange={(e) => setBudget(e.target.value)}
              />
              <span>{config.chain.symbol}</span>
            </span>
          </label>
        </div>
        <CapacityRibbon value={Number(budget)} total={0.001} large />
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
      {custom && (
        <details open>
          <summary>Allowed contract action</summary>
          <p className="helper">
            The wallet can call only this contract and function. Token approvals
            and message signing aren’t supported.
          </p>
          <label>
            Contract address
            <input
              required
              pattern="0x[0-9a-fA-F]{40}"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <label>
            Function selector
            <input
              required
              pattern="0x[0-9a-fA-F]{8}"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
            />
          </label>
        </details>
      )}
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
        <button className="primary" disabled={!!busy}>
          {busy === "create" ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <Plus size={16} />
          )}
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
}: {
  task: Task;
  config: Config;
  request: any;
  act: any;
  busy: string;
  auth?: Auth;
  owner: string;
  download: () => void;
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
    await act(name, () => request(`/sessions/${t.id}/${name}`, {}));
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
            {new URL(t.url).hostname} <span className="divider-dot">·</span>{" "}
            {t.agentMode === "model"
              ? "AI browser agent"
              : config.mode === "local"
                ? "Scripted demo"
                : "Manual control"}
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
          <CapacityRibbon
            value={Math.max(0, Number(t.budget) - Number(t.spent))}
            total={Number(t.budget)}
            large
          />
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
              Allowed contract: {short(t.target)}
              <br />
              Allowed function: {t.selector}
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
              disabled={!!busy || t.status === "closing" || !t.vault}
              onClick={() => command("close")}
            >
              <Square size={12} />
              {t.status === "attention"
                ? "Retry recovery"
                : "End & return funds"}
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
              {t.status === "paused" && (
                <button disabled={!!busy} onClick={() => command("start")}>
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
                              ? "Your agent will open the website using this wallet."
                              : "Your browser preview will appear here.")}
                </p>
                {t.status === "ready" && (
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => command("start")}
                  >
                    {busy === "start" ? (
                      <Loader2 className="spin" size={15} />
                    ) : (
                      <Play size={15} />
                    )}
                    Start task
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
                    <p className="identifier">{t.vault}</p>
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
          {t.status === "funding" && auth && (
            <FundingSwap
              request={request}
              auth={auth}
              owner={owner}
              symbol={config.chain.symbol}
              act={act}
              busy={busy}
            />
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
            <code>{`import { Melt } from '@melt/sdk';\n\nconst melt = new Melt({\n  baseUrl: 'http://127.0.0.1:8787',\n  apiKey: process.env.MELT_API_KEY\n});\n\nawait melt.start(sessionId);\nconst receipt = await melt.wait(sessionId);`}</code>
          </pre>
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
