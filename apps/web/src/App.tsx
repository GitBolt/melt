import { MeltLoader, MeltWordmark } from "./components/MeltMotion";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Copy,
  Check,
  Download,
  Code2,
  Wallet,
  Globe,
  Play,
  Square,
  RotateCcw,
  ArrowLeft,
  ExternalLink,
  KeyRound,
  Trash2,
  X,
  ShieldCheck,
  MousePointer2,
  Link2,
} from "lucide-react";
import { parseEther, toHex } from "viem";
import type {
  Config,
  Task,
  TaskStatus,
  Envelope,
} from "../../../packages/shared/src/index";
import { mandateText, networkKind } from "../../../packages/shared/src/index";
import { BudgetRibbon } from "./components/BudgetRibbon";
import { GooeyNav } from "./components/ui/gooey-nav";
import { SessionSeal } from "./SessionSeal";
import { FundingSwap } from "./FundingSwap";
import { NetworkStrip } from "./NetworkStrip";
import {
  DiscoverPanel,
  EnvelopeComposer,
  EnvelopeDetail,
  EnvelopeList,
  formatRemaining,
} from "./Envelopes";
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
const PAGES = ["Envelopes", "Discover", "Activity", "Developers"] as const;
type Page = (typeof PAGES)[number];
const pageFromHash = (): Page => {
  const hash = window.location.hash.toLowerCase();
  if (hash === "#developers") return "Developers";
  if (hash === "#discover") return "Discover";
  if (hash === "#activity" || hash === "#receipts") return "Activity";
  return "Envelopes";
};
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
  return formatRemaining(expiresAt, now, closed);
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
    [envelopes, setEnvelopes] = useState<{
      sent: Envelope[];
      received: Envelope[];
    }>({ sent: [], received: [] }),
    [page, setPage] = useState<Page>(pageFromHash),
    [selected, setSelected] = useState<string>(),
    [selectedEnvelope, setSelectedEnvelope] = useState<string>(),
    [discoverId, setDiscoverId] = useState<string>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [newTask, setNewTask] = useState(false),
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
  const refreshAgain = useRef(false);
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
      const text = await r.text();
      let data: any = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          throw Object.assign(Error("Request failed"), { status: r.status });
        }
      }
      if (!r.ok)
        throw Object.assign(Error(data.error || "Request failed"), {
          status: r.status,
        });
      return data;
    },
    [auth?.authenticated],
  );
  const refresh = useCallback(async () => {
    if (refreshing.current) {
      refreshAgain.current = true;
      return;
    }
    refreshing.current = true;
    try {
      do {
        refreshAgain.current = false;
        try {
          const me = await request("/me");
          setUser(me);
          const [nextTasks, nextEnvelopes] = await Promise.all([
            request("/sessions"),
            request("/envelopes").catch(() => ({ sent: [], received: [] })),
          ]);
          setTasks(nextTasks);
          setEnvelopes(nextEnvelopes);
        } catch (e) {
          if ((e as any).status === 401) {
            setUser(null);
            setTasks([]);
            setEnvelopes({ sent: [], received: [] });
          } else setError((e as Error).message);
        }
      } while (refreshAgain.current);
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
    listed = tasks,
    active = listed.filter((t) => t.status !== "closed"),
    overview = sessionOverview(listed, config.swap),
    allEnvelopes = [
      ...envelopes.sent,
      ...envelopes.received.filter(
        (item) => !envelopes.sent.some((sent) => sent.id === item.id),
      ),
    ],
    envelope = allEnvelopes.find((item) => item.id === selectedEnvelope);
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
            setSelectedEnvelope(undefined);
            setPage("Envelopes");
            window.location.hash = "envelopes";
          }}
        >
          <MeltWordmark />
        </a>
        <GooeyNav
          className="app-nav"
          activeColor="#e9edf9"
          activeLabelColor="#5363ac"
          size="sm"
          items={PAGES.map((label) => ({
            label,
            href: "#" + label.toLowerCase(),
          }))}
          value={PAGES.indexOf(page)}
          onChange={(i) => {
            setPage(PAGES[i]);
            setSelected(undefined);
            if (PAGES[i] !== "Envelopes") setSelectedEnvelope(undefined);
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
        <NetworkStrip
          network={config.network || networkKind(config.chain.id)}
          chainName={config.chain.name}
          faucetUrl={config.faucetUrl}
          onExplainMainnet={() =>
            setNotice(
              "This hosted Melt is Sepolia. Mainnet would spend real ETH and is not this deployment.",
            )
          }
        />
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
        ) : page === "Activity" && task ? (
          <>
            <button className="back" onClick={() => setSelected(undefined)}>
              <ArrowLeft size={14} />
              Activity
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
                setSelected(undefined);
                setPage("Envelopes");
                setNewTask(true);
              }}
            />
          </>
        ) : page === "Envelopes" && envelope ? (
          <>
            <button
              className="back"
              onClick={() => setSelectedEnvelope(undefined)}
            >
              <ArrowLeft size={14} />
              All envelopes
            </button>
            <EnvelopeDetail
              envelope={envelope}
              config={config}
              busy={busy}
              owner={user?.owner || ""}
              now={now}
              act={act}
              request={request}
              auth={auth}
              onDiscover={() => {
                setDiscoverId(envelope.id);
                setSelectedEnvelope(undefined);
                setPage("Discover");
                window.location.hash = "discover";
              }}
              onShare={() => {
                if (!envelope.receiptToken) {
                  setNotice("Receipt link is not ready yet");
                  return;
                }
                void navigator.clipboard
                  .writeText(`${location.origin}/r/${envelope.receiptToken}`)
                  .then(() => setNotice("Receipt link copied"))
                  .catch(() => setError("Could not copy the receipt link"));
              }}
            />
          </>
        ) : page === "Discover" ? (
          <>
            <section className="intro">
              <div>
                <h1>Use a gift.</h1>
                <p>
                  Search for what they actually want. Melt only lists purchases
                  that still match the original promise.
                </p>
              </div>
            </section>
            {user ? (
              <DiscoverPanel
                envelopes={allEnvelopes}
                selectedId={discoverId || allEnvelopes[0]?.id}
                onSelect={setDiscoverId}
                request={request}
                act={act}
                busy={busy}
                symbol={config.chain.symbol}
              />
            ) : (
              <div className="empty">
                <h2>Sign in to use a gift</h2>
                <button className="secondary" onClick={signIn}>
                  Sign in
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <section className="intro">
              <div>
                <h1>
                  {page === "Activity"
                    ? "See what got used."
                    : "Send a gift they can spend later."}
                </h1>
                <p>
                  {page === "Activity"
                    ? "Settlements, deliveries, and leftover funds."
                    : "Lock a purpose and an amount. They pick the restaurant, the flight, or the eSIM when they need it."}
                </p>
              </div>
              {user && page === "Envelopes" && (
                <button
                  className="primary"
                  onClick={() => {
                    setPage("Envelopes");
                    setSelectedEnvelope(undefined);
                    setNewTask(true);
                  }}
                >
                  <Plus size={16} />
                  New envelope
                </button>
              )}
            </section>
            {page === "Envelopes" &&
            (!user || newTask || !allEnvelopes.length) ? (
              <div
                className={
                  user && allEnvelopes.length ? "compose-solo" : "launch-grid"
                }
              >
                <section className="compose panel">
                  <div className="section-top">
                    <h2>Create an envelope</h2>
                    <span className="quiet">01</span>
                  </div>
                  {user ? (
                    <EnvelopeComposer
                      config={config}
                      owner={user.owner}
                      busy={busy}
                      onCancel={
                        allEnvelopes.length
                          ? () => setNewTask(false)
                          : undefined
                      }
                      onSubmit={(body) =>
                        act("create", async () => {
                          const created = await request(
                            "/envelopes",
                            body,
                            "POST",
                            { "Idempotency-Key": crypto.randomUUID() },
                          );
                          setSelectedEnvelope(created.id);
                          setDiscoverId(created.id);
                          setNewTask(false);
                        })
                      }
                    />
                  ) : (
                    <>
                      <p className="sign-in-copy">
                        Dinner for two. A flight home. An eSIM for Japan. Not
                        unrestricted cash. They spend it later in Melt or in
                        ChatGPT.
                      </p>
                      <div className="example-task">
                        <Globe size={17} />
                        <span>
                          Dinner for two, anywhere you like
                          <span>Up to $120 · before New Year</span>
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
                          : "Sign in with email to create an embedded wallet."}
                      </p>
                    </>
                  )}
                </section>
                {!(user && allEnvelopes.length) && (
                  <aside className="welcome-wallet panel">
                    <SessionSeal />
                    <div>
                      <h2>Dinner now. Restaurant later.</h2>
                      <p>
                        You lock $120 for dinner. They pick the place in ChatGPT
                        next Friday. Headphones cannot come out of this gift.
                      </p>
                    </div>
                    <div className="wallet-footer">
                      <ShieldCheck size={14} />
                      Purpose locked onchain
                    </div>
                  </aside>
                )}
              </div>
            ) : null}
            {user &&
              page === "Envelopes" &&
              allEnvelopes.length > 0 &&
              !newTask && (
                <section className="session-list">
                  <div className="section-top">
                    <h2>Sent</h2>
                    <span className="quiet">{envelopes.sent.length}</span>
                  </div>
                  <EnvelopeList
                    envelopes={envelopes.sent}
                    now={now}
                    symbol={config.chain.symbol}
                    onOpen={setSelectedEnvelope}
                  />
                  {envelopes.received.length > 0 && (
                    <>
                      <div className="section-top">
                        <h2>Received</h2>
                        <span className="quiet">
                          {envelopes.received.length}
                        </span>
                      </div>
                      <EnvelopeList
                        envelopes={envelopes.received}
                        now={now}
                        symbol={config.chain.symbol}
                        onOpen={setSelectedEnvelope}
                      />
                    </>
                  )}
                </section>
              )}
            {page === "Activity" && (
              <section className="session-list">
                {user && listed.length > 0 && (
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
                      <span>Envelopes</span>
                      <strong>{allEnvelopes.length}</strong>
                    </article>
                    <article className="overview-card panel">
                      <span>Open vaults</span>
                      <strong>{active.length}</strong>
                    </article>
                  </div>
                )}
                <div className="section-top">
                  <h2>Settlement history</h2>
                  <span className="quiet">{listed.length}</span>
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
                      ) : (
                        <ArrowUpRight size={19} />
                      )}
                    </div>
                    <div className="row-name">
                      <strong>{t.title}</strong>
                      <span>
                        {t.envelopeId ? "Envelope vault" : t.kind} ·{" "}
                        {new Date(t.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                        {t.status !== "closed"
                          ? ` · ${remainingLabel(t.expiresAt, now, false)}`
                          : ""}
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
                {!user && (
                  <div className="empty">
                    <Download size={24} />
                    <h2>Sign in to see activity</h2>
                    <button className="secondary" onClick={signIn}>
                      Sign in
                    </button>
                  </div>
                )}
                {user && listed.length === 0 && (
                  <p className="helper">No settlements yet.</p>
                )}
              </section>
            )}
          </>
        )}
      </main>
      <footer>
        <a href="/">Melt · Gift cards without stores</a>
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
                  {t.envelopeId
                    ? t.status === "closed"
                      ? "Envelope vault closed"
                      : t.status === "funding"
                        ? "Fund this envelope"
                        : t.status === "attention"
                          ? "Review this envelope vault"
                          : "This vault holds the gift"
                    : t.kind === "swap"
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
                  {t.envelopeId
                    ? t.error ||
                      "Matching purchases settle on Uniswap. Leftover funds stay until this gift expires."
                    : t.kind === "swap"
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
                {t.status === "ready" && t.kind === "swap" && (
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
                    Run swap on Uniswap
                  </button>
                )}
                {t.status === "ready" && t.kind !== "swap" && !t.envelopeId && (
                  <>
                    {config.modelConfigured && (
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() =>
                          act("start", () =>
                            request(`/sessions/${t.id}/start`, {
                              manual: false,
                            }),
                          )
                        }
                      >
                        {busy === "start" ? (
                          <MeltLoader size={15} />
                        ) : (
                          <Play size={15} />
                        )}
                        Start task
                      </button>
                    )}
                    <button
                      className={
                        config.modelConfigured ? "secondary" : "primary"
                      }
                      disabled={!!busy}
                      onClick={() =>
                        act("start", () =>
                          request(`/sessions/${t.id}/start`, { manual: true }),
                        )
                      }
                    >
                      {busy === "start" ? (
                        <MeltLoader size={15} />
                      ) : (
                        <Play size={15} />
                      )}
                      Open task browser
                    </button>
                  </>
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
      "envelope.created",
      "envelope.funded",
      "envelope.redeemed",
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
          <h1>Connect ChatGPT, Claude, or Codex</h1>
          <p>
            Their assistant can find options, propose a purchase, and redeem an
            existing envelope. It cannot create one, raise the amount, or send
            cash.
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
          <h2>Let their assistant spend the gift</h2>
          <p>
            Create and fund an envelope in Melt. ChatGPT, Claude, Codex, or Grok
            can redeem it through MCP. Keys cannot create envelopes or increase
            the gift.
          </p>
          <pre>
            <code>{`import { Melt } from './melt-client.mjs';\n\nconst melt = new Melt({\n  baseUrl: '${location.origin}',\n  apiKey: process.env.MELT_API_KEY\n});\n\nconst { sent } = await melt.envelopes();\nconst found = await melt.findOptions(sent[0].id, 'an eSIM for Japan');\nconst quote = await melt.proposePurchase(sent[0].id, { sku: found.options[0].sku });\nawait melt.redeem(sent[0].id, quote.quote.id);`}</code>
          </pre>
          <a className="secondary" href="/api/client.mjs">
            <Download size={14} /> Download JavaScript client
          </a>
          <p className="helper">
            One file, no dependencies. Keep your API key on the server.
          </p>
          <div className="api-endpoints">
            {[
              ["GET", "/api/envelopes", "List sent and received envelopes"],
              [
                "GET",
                "/api/envelopes/:id/options",
                "Find purchases that match the gift",
              ],
              [
                "POST",
                "/api/envelopes/:id/propose",
                "Propose a catalog option",
              ],
              [
                "POST",
                "/api/envelopes/:id/redeem",
                "Settle a quote; no generic transfer",
              ],
              ["GET", "/api/envelopes/:id/redemptions", "Settlement status"],
              ["POST", "/api/swap/quote", "Quote ETH→USDC for settlement"],
              [
                "GET",
                "/api/public/receipts/:token",
                "Open the shareable public receipt",
              ],
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
              Use Melt from ChatGPT, Claude, Codex, or Grok. The MCP server can
              list gifts, find options, propose, and redeem. It cannot send
              cash.
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
