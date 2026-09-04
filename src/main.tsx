import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  X,
  Check,
  Wallet,
  CircleHelp,
  Command,
  Layers,
  Clock3,
  ArrowDownToLine,
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  Terminal,
  ChevronDown,
  Leaf,
  Copy,
  LogOut,
} from "lucide-react";
import "./style.css";
import { totalPrice } from "./lib/amount";
import { stringToHex } from "viem";
import { AnimatedCounter } from "./components/ui/animated-counter";
import { GooeyNav } from "./components/ui/gooey-nav";
import {
  CapacityRibbon,
  FrameStack,
  ExpiryFold,
} from "./components/CapacityMotion";
import { WorkshopActivity } from "./components/WorkshopActivity";
import { useDialogFocus } from "./components/useDialogFocus";
type Lot = {
  id: number;
  total: number;
  remaining: number;
  expiresAt: number;
  price: string;
  owned: number;
};
type Listing = {
  id: number;
  seller: string;
  lotId: number;
  units: number;
  price: string;
};
type State = {
  mode: string;
  chain: { id: number; name: string; contract: string };
  user: null | { owner: string; name: string; persona: number };
  lots: Lot[];
  listings: Listing[];
  proceeds: string;
  jobs: any[];
  worker: { active: number; queued: number; concurrency: number };
};
async function api(path: string, body?: unknown, method?: string) {
  const r = await fetch(`/api${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Something went wrong");
  return d;
}

function lotTitle(id: number) {
  return (
    ["A small head start", "Room to explore", "A slower afternoon"][id - 1] ||
    `Workshop batch ${id}`
  );
}
function time(exp: number) {
  const m = Math.max(0, Math.ceil((exp * 1000 - Date.now()) / 60000));
  return m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
function App() {
  const [state, setState] = useState<State | null>(null),
    [page, setPage] = useState("Market"),
    [modal, setModal] = useState<{
      type: string;
      lot?: Lot;
      listing?: Listing;
    } | null>(null),
    [quantity, setQuantity] = useState(10),
    [price, setPrice] = useState("0.00012"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("All capacity"),
    [key, setKey] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [receipt, setReceipt] = useState<any>(null);
  const refresh = async () => {
    try {
      setState(await api("/state"));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useDialogFocus(modal?.type, busy, () => setModal(null));
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setReceipt(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(type: string, lot?: Lot, listing?: Listing) {
    if (type !== "receipt") setNotice("");
    setQuantity(
      type === "list"
        ? lot?.owned || 1
        : Math.min(10, listing?.units || lot?.remaining || 10),
    );
    setFile(null);
    setModal({ type, lot, listing });
  }
  async function transact(action: string, id?: number) {
    const result = await api("/transactions", {
      action,
      id,
      units: quantity,
      price,
    });
    if (result.transaction) {
      const provider = (window as any).ethereum;
      if (!provider) throw Error("An Ethereum wallet is required");
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${state!.chain.id.toString(16)}` }],
      });
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: state!.user!.owner,
            to: result.transaction.to,
            data: result.transaction.data,
            value: result.transaction.value,
          },
        ],
      });
      setNotice(`Transaction sent · ${hash.slice(0, 10)}…`);
      let confirmed = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        const mined = await api(`/receipts/${hash}`);
        if (mined.status !== "pending") {
          if (mined.status !== "success")
            throw Error(
              "The wallet transaction reverted. Your reservation was not changed.",
            );
          setReceipt(mined);
          setNotice(`Confirmed on Ethereum · ${hash.slice(0, 10)}…`);
          confirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!confirmed)
        setNotice(
          `Still pending · ${hash.slice(0, 10)}… Check your wallet before retrying.`,
        );
    } else {
      setNotice(`Confirmed on Ethereum · ${result.hash.slice(0, 10)}…`);
      setReceipt(await api(`/receipts/${result.hash}`));
    }
    setModal(null);
  }
  async function wallet() {
    const provider = (window as any).ethereum;
    if (!provider)
      throw Error("Open Melt in a browser with an Ethereum wallet extension.");
    const [address] = await provider.request({ method: "eth_requestAccounts" });
    const { message } = await api("/session/challenge", { address });
    const signature = await provider.request({
      method: "personal_sign",
      params: [stringToHex(message), address],
    });
    await api("/session/verify", { address, signature });
    setModal(null);
  }
  const owned =
    state?.lots
      .filter((l) => l.expiresAt * 1000 > Date.now())
      .reduce((a, l) => a + l.owned, 0) || 0;
  const live = state?.lots.filter((l) => l.expiresAt * 1000 > Date.now()) || [];
  return (
    <>
      <div className="app-shell">
        <header>
          <a
            className="wordmark"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage("Market");
            }}
          >
            melt
          </a>
          <GooeyNav
            aria-label="Main navigation"
            items={[
              "Market",
              "Your capacity",
              "Jobs",
              "Agent API",
              ...(state?.user?.persona === 0 ? ["Workshop"] : []),
            ]}
            value={[
              "Market",
              "Your capacity",
              "Jobs",
              "Agent API",
              "Workshop",
            ].indexOf(page)}
            onChange={(i) =>
              setPage(
                ["Market", "Your capacity", "Jobs", "Agent API", "Workshop"][i],
              )
            }
            size="sm"
            activeColor="#e7ebff"
            activeLabelColor="#3e4fbc"
            separation={9}
          />

          <button className="account" onClick={() => open("connect")}>
            <Wallet size={15} />
            {state?.user ? state.user.name : "Connect wallet"}
            <ChevronDown size={13} />
          </button>
        </header>
        <div className="environment">
          <span>
            <span className="environment-icon">↳</span>
            {state?.mode === "playground"
              ? "Local Ethereum playground"
              : "Ethereum connected"}
            <span className="env-detail">
              {state?.mode === "playground" ? "Test ETH" : state?.chain.name}
            </span>
          </span>
          <button onClick={() => open("about")}>
            <CircleHelp size={13} />
            How it works
          </button>
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <Check size={16} />
            {notice}
            {receipt && (
              <button onClick={() => open("receipt")}>
                View receipt <ArrowUpRight size={12} />
              </button>
            )}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {!state ? (
          <main className="loading">
            <Loader2 className="spin" /> Warming up the workshop…
            <button onClick={refresh}>Try again</button>
          </main>
        ) : (
          <main key={page} className="page-surface">
            {page === "Market" && (
              <>
                <section className="intro">
                  <div>
                    <h1>Compute, by the batch.</h1>
                    <p>Book what you need. Sell what’s left.</p>
                  </div>
                  <WorkshopActivity
                    worker={state.worker}
                    available={live.reduce((n, l) => n + l.remaining, 0)}
                    onViewJobs={() => setPage("Jobs")}
                  />
                </section>
                <section className="market-section">
                  <div className="section-top">
                    <div>
                      <h2>Image processing</h2>
                    </div>
                    <div className="segmented">
                      {["All capacity", "Passed along"].map((f) => (
                        <button
                          key={f}
                          className={filter === f ? "active" : ""}
                          onClick={() => setFilter(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="cards">
                    {filter === "All capacity" &&
                      live.map((lot, i) => (
                        <article className="offer capacity-offer" key={lot.id}>
                          <div className="offer-main">
                            <span className="workload-icon">
                              <FrameStack />
                            </span>
                            <div>
                              <h3>{lotTitle(lot.id)}</h3>
                              <p>
                                Resize & WebP{" "}
                                <span className="provider-inline">
                                  · Melt Workshop
                                </span>
                              </p>
                            </div>
                          </div>
                          <div className="offer-inventory">
                            <div>
                              <AnimatedCounter value={lot.remaining} />
                              <span> / {lot.total} jobs</span>
                            </div>
                            <CapacityRibbon
                              value={lot.remaining}
                              total={lot.total}
                            />
                          </div>
                          <div className="offer-expiry">
                            <span>
                              <ExpiryFold expiresAt={lot.expiresAt} />
                              {time(lot.expiresAt)}
                            </span>
                            <small>until expiry</small>
                          </div>
                          <div className="offer-price">
                            <strong>
                              {lot.price}
                              <span> ETH</span>
                            </strong>
                            <small>per job</small>
                          </div>
                          <button
                            className="reserve-button"
                            aria-label={`Reserve ${lotTitle(lot.id)}`}
                            disabled={!lot.remaining}
                            onClick={() =>
                              state.user ? open("buy", lot) : open("connect")
                            }
                          >
                            Reserve <ArrowUpRight size={15} />
                          </button>
                        </article>
                      ))}
                    {state.listings
                      .filter((l) => live.some((a) => a.id === l.lotId))
                      .map((item) => (
                        <article className="offer resale" key={`r${item.id}`}>
                          <div className="offer-top">
                            <span className="workload-icon">
                              <RefreshCw size={18} />
                            </span>
                            <span className="expiry">Passed along</span>
                          </div>

                          <div className="offer-body">
                            <span className="provider">
                              From {item.seller.slice(0, 6)}…
                              {item.seller.slice(-4)}
                            </span>
                            <h3>A little room, shared</h3>
                            <p>
                              {item.units} unused image jobs, ready for you.
                            </p>
                            <div className="capacity-line">
                              <span>Original expiry stays with it</span>
                              <span>
                                {time(
                                  live.find((l) => l.id === item.lotId)!
                                    .expiresAt,
                                )}
                              </span>
                            </div>
                            <div className="offer-bottom">
                              <div>
                                <strong>
                                  {item.price} <span>ETH</span>
                                </strong>
                                <small>per image · resale</small>
                              </div>
                              {item.seller.toLowerCase() ===
                              state.user?.owner.toLowerCase() ? (
                                <button
                                  className="quiet"
                                  onClick={() =>
                                    act(() => transact("cancel", item.id))
                                  }
                                >
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  className="round-button"
                                  aria-label="Buy passed-along capacity"
                                  onClick={() =>
                                    state.user
                                      ? open(
                                          "take",
                                          live.find((l) => l.id === item.lotId),
                                          item,
                                        )
                                      : open("connect")
                                  }
                                >
                                  <ArrowUpRight size={21} />
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    {filter === "Passed along" && !state.listings.length && (
                      <div className="empty wide">
                        <RefreshCw />
                        <h3>Nothing passed along just yet.</h3>
                        <p>
                          Unused reservations show up here when their owner
                          lists them.
                        </p>
                        <button
                          className="quiet"
                          onClick={() => setPage("Your capacity")}
                        >
                          Open your capacity <ArrowRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
            {page === "Your capacity" && (
              <>
                <div className="page-heading">
                  <h1>Room for what’s next.</h1>
                  <p>
                    {owned} available jobs · {state.proceeds} ETH ready to
                    withdraw
                  </p>
                  {Number(state.proceeds) > 0 && (
                    <button
                      className="primary"
                      onClick={() => act(() => transact("withdraw"))}
                    >
                      Withdraw proceeds
                    </button>
                  )}
                </div>
                <div className="cards">
                  {state.lots
                    .filter((l) => l.owned > 0)
                    .map((l) => (
                      <article className="reservation" key={l.id}>
                        <div className="reservation-head">
                          <FrameStack />
                          <span>
                            Reservation #{l.id.toString().padStart(3, "0")}
                          </span>
                        </div>
                        <strong className="big-number">
                          <AnimatedCounter value={l.owned} />
                          <span>image jobs</span>
                        </strong>
                        <p>Melt Workshop · resize & WebP</p>
                        <CapacityRibbon value={l.owned} total={l.total} large />
                        <div className="reservation-details">
                          <span>Use before</span>
                          <strong>
                            {new Date(l.expiresAt * 1000).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </strong>
                        </div>
                        <div className="button-row">
                          <button
                            className="primary"
                            disabled={l.expiresAt * 1000 < Date.now()}
                            onClick={() => open("job", l)}
                          >
                            Use a job <ArrowUpRight size={16} />
                          </button>
                          <button
                            className="secondary"
                            disabled={l.expiresAt * 1000 < Date.now()}
                            onClick={() => open("list", l)}
                          >
                            Pass along
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
                {state.listings.filter(
                  (l) =>
                    l.seller.toLowerCase() === state.user?.owner.toLowerCase(),
                ).length > 0 && (
                  <section className="listed-section">
                    <h2>Out in the market</h2>
                    <p>
                      Your listed jobs are held aside. Cancel an unsold listing
                      to use them again.
                    </p>
                    {state.listings
                      .filter(
                        (l) =>
                          l.seller.toLowerCase() ===
                          state.user?.owner.toLowerCase(),
                      )
                      .map((l) => (
                        <div className="job-row" key={l.id}>
                          <RefreshCw size={20} />
                          <div className="job-info">
                            <h3>{l.units} jobs passed along</h3>
                            <p>
                              Reservation #{l.lotId} · {l.price} ETH per job
                            </p>
                          </div>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => act(() => transact("cancel", l.id))}
                          >
                            Cancel listing
                          </button>
                        </div>
                      ))}
                  </section>
                )}
                {!owned && (
                  <div className="empty">
                    <FrameStack large />
                    <h3>A little empty, for now.</h3>
                    <p>
                      Reserve a batch to start making. Unused jobs can be passed
                      along.
                    </p>
                    <button
                      className="primary"
                      onClick={() => setPage("Market")}
                    >
                      Find capacity <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
            {page === "Jobs" && (
              <>
                <div className="page-heading">
                  <h1>Little jobs. Real results.</h1>
                  <p>
                    {state.worker.active} running · {state.worker.queued} queued
                    · two processing slots
                  </p>
                </div>
                <div className="job-list">
                  {state.jobs.map((j) => (
                    <article className="job-row" key={j.id}>
                      <div className="job-icon">
                        <FrameStack
                          active={j.status === "running"}
                          complete={j.status === "completed"}
                        />
                      </div>
                      <div className="job-info">
                        <h3>{j.filename}</h3>
                        <p>
                          {new Date(j.created).toLocaleString()} · reservation #
                          {j.lot}
                        </p>
                      </div>
                      <span className={`status ${j.status}`}>
                        {j.status === "completed" ? (
                          <Check size={13} />
                        ) : (
                          <Clock3 size={13} />
                        )}{" "}
                        {j.status}
                      </span>
                      {j.status === "completed" && (
                        <a
                          className="secondary"
                          href={`/api/jobs/${j.id}/output`}
                        >
                          <ArrowDownToLine size={15} />
                          Download
                        </a>
                      )}
                    </article>
                  ))}
                </div>
                {!state.jobs.length && (
                  <div className="empty">
                    <FrameStack large />
                    <h3>Your first small thing starts here.</h3>
                    <p>
                      Use a reservation to resize and convert an image. No
                      second payment.
                    </p>
                    <button
                      className="primary"
                      onClick={() => setPage("Your capacity")}
                    >
                      Open your capacity
                    </button>
                  </div>
                )}
              </>
            )}
            {page === "Workshop" && (
              <>
                <div className="page-heading">
                  <h1>Make a little room.</h1>
                  <p>
                    Two worker slots · {state.worker.active} running ·{" "}
                    {state.worker.queued} queued
                  </p>
                </div>
                <section className="panel provider-panel">
                  <h2>Offer another batch</h2>
                  <p>
                    Issue at most 200 image jobs per batch, within the
                    workshop’s 1,000-job outstanding reservation limit. Choose a
                    window you can fulfill.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      act(async () => {
                        const d = await api("/provider/offers", {
                          units: Number(data.get("units")),
                          hours: Number(data.get("hours")),
                          price: data.get("price"),
                        });
                        setReceipt(await api(`/receipts/${d.hash}`));
                        setNotice("A new batch is available in the market.");
                      });
                    }}
                  >
                    <div className="provider-fields">
                      <label className="field">
                        Jobs
                        <input
                          name="units"
                          type="number"
                          min="1"
                          max="200"
                          defaultValue="24"
                          required
                        />
                      </label>
                      <label className="field">
                        Window (hours)
                        <input
                          name="hours"
                          type="number"
                          min="1"
                          max="48"
                          defaultValue="4"
                          required
                        />
                      </label>
                      <label className="field">
                        Price per job (ETH)
                        <input name="price" defaultValue="0.0002" required />
                      </label>
                    </div>
                    <button className="primary" disabled={busy}>
                      {busy ? (
                        <Loader2 className="spin" size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      Issue capacity
                    </button>
                  </form>
                </section>
              </>
            )}
            {page === "Agent API" && (
              <>
                <div className="page-heading">
                  <h1>A workspace for agents, too.</h1>
                  <p>
                    Reserve, transfer, and redeem capacity through a small HTTP
                    API.
                  </p>
                </div>
                <div className="api-grid">
                  <section className="panel">
                    <Terminal size={24} />
                    <h2>One key. Your capacity.</h2>
                    <p>
                      Keys inherit your wallet’s rights. A job spends one owned
                      credit, with no extra charge. Keep the key private.
                    </p>
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={!state.user || busy}
                        onClick={() =>
                          act(async () =>
                            setKey((await api("/keys", {})).token),
                          )
                        }
                      >
                        Create API key <Plus size={16} />
                      </button>
                      <button
                        className="quiet"
                        disabled={!state.user}
                        onClick={() =>
                          act(async () => {
                            await api("/keys", undefined, "DELETE");
                            setKey("");
                            setNotice("All your API keys revoked");
                          })
                        }
                      >
                        Revoke all
                      </button>
                    </div>
                    {!state.user && <p>Connect an account first.</p>}
                    {key && (
                      <div className="key-box">
                        <code>{key}</code>
                        <button
                          aria-label="Copy API key"
                          onClick={() => navigator.clipboard.writeText(key)}
                        >
                          <Copy size={15} />
                        </button>
                      </div>
                    )}
                    <div className="api-note">
                      <Check size={15} />
                      Ownership checked on Ethereum for every job.
                    </div>
                  </section>
                  <section className="code-panel">
                    <span>REDEEM ONE PREPAID JOB</span>
                    <pre>{`curl -X POST 'http://127.0.0.1:8787/api/jobs?lot=1' \\\n  -H 'Authorization: Bearer $MELT_API_KEY' \\\n  -F 'file=@photo.png'\n\n# → 202 Accepted\n# { id, status: "queued", transaction }`}</pre>
                    <p>
                      PNG, JPEG, WebP, AVIF · up to 10 MB
                      <br />
                      WebP output · longest edge 1,600 px
                    </p>
                  </section>
                </div>
                <div className="panel endpoints">
                  <h2>A deliberately small surface</h2>
                  <a
                    className="text-link"
                    href="/api/openapi.yaml"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open API specification <ArrowUpRight size={14} />
                  </a>
                  {[
                    [
                      "POST",
                      "/api/mcp",
                      "MCP discovery and authenticated agent tools",
                    ],
                    [
                      "GET",
                      "/api/state",
                      "Inventory, your rights, jobs and chain details",
                    ],
                    [
                      "POST",
                      "/api/transactions",
                      "Buy, list, take, cancel or withdraw",
                    ],
                    [
                      "POST",
                      "/api/jobs?lot=1",
                      "Redeem an owned credit and process an image",
                    ],
                    [
                      "GET",
                      "/api/jobs/:id/output",
                      "Download your completed result",
                    ],
                  ].map(([m, p, d]) => (
                    <div key={p}>
                      <code>{m}</code>
                      <strong>{p}</strong>
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </main>
        )}
        <footer>
          <span className="footer-brand">melt</span>

          <div>
            <span>Ethereum</span>
            <button onClick={() => open("about")}>
              A note on the workshop <ArrowUpRight size={13} />
            </button>
          </div>
        </footer>
      </div>
      {modal && (
        <div className="modal-backdrop" onClick={() => !busy && setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close dialog"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal.type === "connect" ? (
              <>
                <h2 id="modal-title">Your corner of Melt.</h2>
                {state?.user && (
                  <p className="wallet-address">{state.user.owner}</p>
                )}
                <p>
                  Connect your wallet, or try the complete flow with two local
                  Ethereum accounts.
                </p>
                <button className="primary full" onClick={() => act(wallet)}>
                  <Wallet size={17} />
                  Connect Ethereum wallet
                </button>
                {state?.mode === "playground" && (
                  <>
                    <div className="divider-label">
                      LOCAL PLAYGROUND · TEST FUNDS
                    </div>
                    <div className="personas">
                      {[1, 2].map((p) => (
                        <button
                          key={p}
                          onClick={() =>
                            act(async () => {
                              await api("/session/demo", { persona: p });
                              setModal(null);
                              setNotice(
                                `You’re now ${p === 1 ? "Alice" : "Bob"}. Local test ETH only.`,
                              );
                            })
                          }
                        >
                          <span className={`avatar avatar-${p}`}>
                            {p === 1 ? "A" : "B"}
                          </span>
                          <strong>{p === 1 ? "Alice" : "Bob"}</strong>
                          <small>
                            {p === 1
                              ? "Reserve & pass along"
                              : "Pick up & make"}
                          </small>
                        </button>
                      ))}
                    </div>
                    <button
                      className="quiet full"
                      onClick={() =>
                        act(async () => {
                          await api("/session/demo", { persona: 0 });
                          setModal(null);
                          setPage("Workshop");
                        })
                      }
                    >
                      Manage the local workshop <ArrowUpRight size={14} />
                    </button>
                  </>
                )}
                {state?.user && (
                  <button
                    className="quiet full"
                    onClick={() =>
                      act(async () => {
                        await api("/session", undefined, "DELETE");
                        setModal(null);
                      })
                    }
                  >
                    <LogOut size={15} />
                    Disconnect
                  </button>
                )}
              </>
            ) : modal.type === "receipt" ? (
              <>
                <h2 id="modal-title">A small thing, settled.</h2>
                <div className="receipt-stamp">
                  <Check size={30} />
                  <span>{receipt?.status}</span>
                </div>
                <div className="summary-row">
                  <span>Block</span>
                  <strong>{receipt?.block}</strong>
                </div>
                <div className="summary-row">
                  <span>Gas used</span>
                  <strong>{receipt?.gasUsed}</strong>
                </div>
                <div className="summary-row">
                  <span>Chain</span>
                  <strong>{receipt?.chainId}</strong>
                </div>
                <p className="receipt-hash">{receipt?.hash}</p>
                <button
                  className="secondary full"
                  onClick={() => navigator.clipboard.writeText(receipt?.hash)}
                >
                  Copy transaction hash <Copy size={14} />
                </button>
              </>
            ) : modal.type === "about" ? (
              <>
                <h2 id="modal-title">Real work. A little more shared.</h2>
                <p>
                  Melt sells expiring rights to image-processing jobs in a
                  bounded, two-slot worker. Buy a batch, use some, and resell
                  the unused portion.
                </p>
                <p>
                  Ethereum tracks ownership, payment, resale and consumption.
                  Failed jobs restore their credit. Expired credits cannot be
                  used, and expiry never resets on resale.
                </p>
                <p className="note">
                  This playground uses local test ETH. The operator is trusted
                  to fulfill jobs; this is not a decentralized verification
                  system. Public-network and sponsor integrations require
                  separate configuration and verification.
                </p>
                <button className="primary" onClick={() => setModal(null)}>
                  Sounds good <Check size={16} />
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">
                  Melt Workshop · reservation #{modal.lot?.id}
                </span>
                <h2 id="modal-title">
                  {modal.type === "job"
                    ? "Make one small thing."
                    : modal.type === "list"
                      ? "Let the rest keep moving."
                      : "A little capacity, all yours."}
                </h2>
                <p>
                  {modal.type === "job"
                    ? "One image. One prepaid credit. Your result is a WebP up to 1,600 pixels."
                    : modal.type === "list"
                      ? "These jobs leave your available balance while listed. You can cancel an unsold listing."
                      : "Your reservation can be used or resold until its original expiry."}
                </p>
                {modal.type === "job" ? (
                  <label className="upload">
                    <ImageIcon size={27} />
                    <strong>
                      {file?.name || "Choose an image to work on"}
                    </strong>
                    <span>PNG, JPEG, WebP, AVIF · up to 10 MB</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                ) : (
                  <>
                    <label className="field">
                      Number of jobs
                      <input
                        type="number"
                        min="1"
                        max={
                          modal.type === "list"
                            ? modal.lot?.owned
                            : modal.listing?.units || modal.lot?.remaining
                        }
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </label>
                    <div className="credit-picker">
                      <CapacityRibbon
                        value={quantity}
                        total={Math.max(
                          1,
                          modal.type === "list"
                            ? modal.lot!.owned
                            : modal.listing?.units || modal.lot!.remaining,
                        )}
                        large
                      />
                      <input
                        aria-label="Adjust job quantity"
                        type="range"
                        min="1"
                        max={
                          modal.type === "list"
                            ? modal.lot?.owned
                            : modal.listing?.units || modal.lot?.remaining
                        }
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </div>
                    {modal.type === "list" && (
                      <label className="field">
                        Price per job (ETH)
                        <input
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          inputMode="decimal"
                        />
                      </label>
                    )}
                    <div className="summary-row">
                      <span>
                        {modal.type === "list" ? "Listing value" : "Total"}
                      </span>
                      <strong>
                        {totalPrice(
                          quantity,
                          modal.type === "list"
                            ? price
                            : modal.listing?.price || modal.lot?.price,
                        )}{" "}
                        ETH
                      </strong>
                    </div>
                  </>
                )}
                <div className="summary-row muted">
                  <span>Expires in</span>
                  <span>{time(modal.lot!.expiresAt)} · original expiry</span>
                </div>
                <button
                  className="primary full"
                  disabled={
                    busy ||
                    (modal.type === "job"
                      ? !file
                      : !Number.isInteger(quantity) ||
                        quantity < 1 ||
                        quantity >
                          (modal.type === "list"
                            ? modal.lot!.owned
                            : modal.listing?.units || modal.lot!.remaining) ||
                        (modal.type === "list" &&
                          (totalPrice(quantity, price) === "—" ||
                            Number(price) <= 0)))
                  }
                  onClick={() =>
                    act(async () => {
                      if (modal.type === "job") {
                        const form = new FormData();
                        form.append("file", file!);
                        const r = await fetch(
                          `/api/jobs?lot=${modal.lot!.id}`,
                          { method: "POST", body: form },
                        );
                        const d = await r.json();
                        if (!r.ok) throw Error(d.error);
                        setModal(null);
                        setPage("Jobs");
                        setReceipt(await api(`/receipts/${d.transaction}`));
                        setNotice(
                          "Your image is in the workshop. One credit reserved.",
                        );
                      } else
                        await transact(
                          modal.type,
                          modal.listing?.id || modal.lot?.id,
                        );
                    })
                  }
                >
                  {busy ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <ArrowUpRight size={17} />
                  )}{" "}
                  {busy
                    ? "Working on it…"
                    : modal.type === "job"
                      ? "Process image · 1 credit"
                      : modal.type === "list"
                        ? "List unused capacity"
                        : "Reserve capacity"}
                </button>
              </>
            )}
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
