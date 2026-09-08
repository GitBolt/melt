import { MeltLoader } from "./components/MeltMotion";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Gift,
  Check,
  Wallet,
  Search,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { parseEther, toHex } from "viem";
import type { Config, Envelope } from "../../../packages/shared/src/index";
import { BudgetRibbon } from "./components/BudgetRibbon";
import { SessionSeal } from "./SessionSeal";

const short = (s: string) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "Creating…";

export const PRESETS = [
  {
    label: "Dinner",
    purpose: "Dinner for two, anywhere you like, up to $120",
    budget: "0.05",
  },
  {
    label: "Flight home",
    purpose: "A flight home for Thanksgiving, up to $400",
    budget: "0.16",
  },
  {
    label: "Concert",
    purpose: "Any concert you want this summer, up to $150",
    budget: "0.06",
  },
  {
    label: "Apartment",
    purpose: "Something for your new apartment, except electronics",
    budget: "0.08",
  },
  {
    label: "Mobile data",
    purpose: "Mobile data for your trip, up to $20",
    budget: "0.01",
  },
  {
    label: "Indie game",
    purpose: "Any indie game under $40",
    budget: "0.02",
  },
  {
    label: "AI month",
    purpose: "One month of an AI product you actually want",
    budget: "0.01",
  },
];

function defaultUntil() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

function newYearUntil() {
  const year = new Date().getUTCFullYear();
  const next = new Date().getUTCMonth() === 11 ? year + 1 : year;
  return `${next}-12-31`;
}

function endOfDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, 23, 59, 59) / 1000);
}

export function formatRemaining(
  expiresAt: number,
  now: number,
  closed: boolean,
) {
  if (closed) return "Ended";
  const remaining = Math.max(0, expiresAt - Math.floor(now / 1000));
  if (remaining <= 0) return "Expired";
  if (remaining >= 86400) {
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
  return `${Math.floor(remaining / 60)}m ${String(remaining % 60).padStart(2, "0")}s`;
}

const statusCopy: Record<Envelope["status"], string> = {
  funding: "Needs funding",
  open: "Ready to use",
  redeeming: "Settling",
  exhausted: "Used up",
  expired: "Expired",
  closed: "Closed",
};

export function EnvelopeComposer({
  config,
  owner,
  busy,
  onSubmit,
  onCancel,
}: {
  config: Config;
  owner: string;
  busy: string;
  onSubmit: (body: {
    recipientLabel: string;
    purpose: string;
    budget: string;
    expiresAt: number;
    partialUse: boolean;
  }) => void;
  onCancel?: () => void;
}) {
  const [preset, setPreset] = useState("Mobile data");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [purpose, setPurpose] = useState(PRESETS[4].purpose);
  const [budget, setBudget] = useState(PRESETS[4].budget);
  const [until, setUntil] = useState(defaultUntil);
  const [partialUse, setPartialUse] = useState(true);
  return (
    <form
      className="envelope-compose"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          recipientLabel,
          purpose,
          budget,
          expiresAt: endOfDay(until),
          partialUse,
        });
      }}
    >
      <p className="swap-lead">
        Start from a preset or write your own. They spend it later. Leftover
        funds come back to you.
      </p>
      <div className="template-options">
        {PRESETS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={preset === item.label ? "chosen" : ""}
            onClick={() => {
              setPreset(item.label);
              setPurpose(item.purpose);
              setBudget(item.budget);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label>
        To
        <input
          required
          maxLength={120}
          value={recipientLabel}
          placeholder="Alex, or an email"
          onChange={(e) => setRecipientLabel(e.target.value)}
        />
      </label>
      <label>
        The promise
        <textarea
          required
          maxLength={500}
          rows={3}
          value={purpose}
          placeholder="Dinner for two, anywhere you like, up to $120, before New Year"
          onChange={(e) => {
            setPreset("");
            setPurpose(e.target.value);
          }}
        />
      </label>
      <div className="allowance-picker">
        <div>
          <label>
            Up to
            <span className="amount-input">
              <input
                aria-label="Envelope budget"
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
        <BudgetRibbon
          value={Number(budget) || 0}
          total={Math.max(0.02, Number(budget) || 0)}
          large
          symbol={config.chain.symbol}
          onChange={(value) => setBudget(String(value))}
        />
      </div>
      <label>
        Use by
        <input
          type="date"
          required
          value={until}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setUntil(e.target.value)}
        />
      </label>
      <div className="template-options">
        <button
          type="button"
          className={until === newYearUntil() ? "chosen" : ""}
          onClick={() => setUntil(newYearUntil())}
        >
          New Year
        </button>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={partialUse}
          onChange={(e) => setPartialUse(e.target.checked)}
        />
        Allow partial use. Leftover funds stay in the envelope, then return to{" "}
        {short(owner)}.
      </label>
      <div className="recovery-line">
        <ArrowRight size={14} />
        <span>Unused {config.chain.symbol} returns to you after expiry</span>
        <span>They cannot cash it out</span>
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="primary" disabled={!!busy}>
          {busy === "create" ? <MeltLoader size={16} /> : <Gift size={16} />}
          Create envelope
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

export function EnvelopeList({
  envelopes,
  now,
  symbol,
  onOpen,
}: {
  envelopes: Envelope[];
  now: number;
  symbol: string;
  onOpen: (id: string) => void;
}) {
  if (!envelopes.length)
    return <p className="helper">No gifts in this view yet.</p>;
  return (
    <>
      {envelopes.map((envelope) => (
        <button
          key={envelope.id}
          className="session-row"
          onClick={() => onOpen(envelope.id)}
        >
          <div
            className={`mini-seal ${envelope.status === "closed" ? "complete" : ""}`}
          >
            {envelope.status === "closed" || envelope.status === "exhausted" ? (
              <Check size={19} />
            ) : (
              <Gift size={18} />
            )}
          </div>
          <div className="row-name">
            <strong>{envelope.purpose}</strong>
            <span>
              For {envelope.recipientLabel} ·{" "}
              {formatRemaining(
                envelope.expiresAt,
                now,
                envelope.status === "closed",
              )}
            </span>
          </div>
          <span className={`status status-${envelope.status}`}>
            {statusCopy[envelope.status]}
          </span>
          <span className="row-amount">
            {envelope.remaining} <small>{symbol}</small>
          </span>
          <ArrowUpRight size={16} />
        </button>
      ))}
    </>
  );
}

export function EnvelopeDetail({
  envelope,
  config,
  busy,
  owner,
  now,
  act,
  request,
  auth,
  onDiscover,
  onShare,
}: {
  envelope: Envelope;
  config: Config;
  busy: string;
  owner: string;
  now: number;
  act: (name: string, fn: () => Promise<unknown>) => Promise<void>;
  request: (
    path: string,
    body?: unknown,
    method?: string,
    extra?: Record<string, string>,
  ) => Promise<any>;
  auth?: {
    send: (tx: {
      from: string;
      to: string;
      value: string;
      data?: string;
    }) => Promise<string>;
    wait?: (hash: string) => Promise<void>;
  };
  onDiscover: () => void;
  onShare: () => void;
}) {
  const [fundHash, setFundHash] = useState("");
  return (
    <>
      <section className="detail-heading">
        <div>
          <h1>{envelope.purpose}</h1>
          <p>
            For {envelope.recipientLabel}
            {envelope.recipientAddress
              ? ` · ${short(envelope.recipientAddress)}`
              : ""}{" "}
            <span className="divider-dot">·</span> from{" "}
            {short(envelope.senderAddress)}
          </p>
        </div>
        <span className={`status status-${envelope.status}`}>
          {statusCopy[envelope.status]}
        </span>
      </section>
      <p className="session-mandate">
        Locked onchain for{" "}
        {envelope.category === "other" ? "this purpose" : envelope.category}.
        Policy {envelope.policyHash.slice(0, 10)}… · unused funds return to you
        {envelope.partialUse
          ? " · partial use allowed"
          : " · one purchase only"}
        .
      </p>
      <div className="work-grid">
        <aside className="wallet-panel panel">
          <SessionSeal
            status={
              envelope.status === "open"
                ? "ready"
                : envelope.status === "funding"
                  ? "funding"
                  : envelope.status === "closed"
                    ? "closed"
                    : "running"
            }
          />
          <div className="balance-heading">
            <span>Remaining</span>
            <h2>
              {envelope.remaining}
              <small>{config.chain.symbol}</small>
            </h2>
          </div>
          <BudgetRibbon
            value={Number(envelope.spent)}
            total={Number(envelope.budget)}
            large
          />
          <dl className="wallet-facts">
            <div>
              <dt>Budget</dt>
              <dd>
                {envelope.budget} {config.chain.symbol}
              </dd>
            </div>
            <div>
              <dt>Use by</dt>
              <dd>
                {formatRemaining(
                  envelope.expiresAt,
                  now,
                  envelope.status === "closed",
                )}
              </dd>
            </div>
            <div>
              <dt>Purchases</dt>
              <dd>{envelope.redemptions.length}</dd>
            </div>
          </dl>
          {envelope.status === "funding" && envelope.vault && (
            <button
              className="primary wide"
              disabled={!auth || !!busy || !!fundHash}
              onClick={() =>
                act("fund", async () => {
                  const hash = await auth!.send({
                    from: owner,
                    to: envelope.vault,
                    value: toHex(parseEther(envelope.budget)),
                  });
                  setFundHash(hash);
                  try {
                    await auth!.wait?.(hash);
                  } catch (error) {
                    if ((error as Error).message === "Transaction reverted")
                      setFundHash("");
                    throw error;
                  }
                  await request(`/sessions/${envelope.sessionId}/funding`, {
                    hash,
                  });
                })
              }
            >
              <Wallet size={15} />
              Fund {envelope.budget} {config.chain.symbol}
            </button>
          )}
          {envelope.status === "open" && (
            <button className="primary wide" onClick={onDiscover}>
              <Search size={15} />
              Find ways to use this
            </button>
          )}
          {envelope.receiptToken && (
            <button className="secondary wide" onClick={onShare}>
              Share receipt
            </button>
          )}
          {envelope.vault && (
            <a
              className="quiet-button wide"
              href={`/recover?vault=${envelope.vault}`}
            >
              <ShieldCheck size={14} /> Recover without Melt
            </a>
          )}
        </aside>
        <section className="workspace panel envelope-activity">
          <h2>Activity</h2>
          {envelope.redemptions.length === 0 && (
            <p className="helper">
              No purchase yet. The recipient can open Melt or ask ChatGPT,
              Claude, Codex or Grok to use this gift through MCP.
            </p>
          )}
          {envelope.redemptions.map((item) => (
            <article key={item.id} className="event-row">
              <div>
                <strong>{item.title}</strong>
                <p className="quiet">
                  {item.merchant}
                  {item.symbol ? ` · ${item.amountOut} ${item.symbol}` : ""}
                  {item.hash ? ` · Uniswap ${short(item.hash)}` : ""}
                </p>
                {item.delivery && <p className="helper">{item.delivery}</p>}
                {item.disclosure && <p className="helper">{item.disclosure}</p>}
              </div>
              <time>{new Date(item.createdAt).toLocaleString()}</time>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

function EnvelopePicker({
  envelopes,
  selectedId,
  onSelect,
  symbol,
}: {
  envelopes: Envelope[];
  selectedId?: string;
  onSelect: (id: string) => void;
  symbol: string;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const listId = useId();
  const selected = envelopes.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="envelope-picker" ref={root}>
      <span id={labelId}>Envelope</span>
      <button
        type="button"
        className={`picker-trigger${open ? " open" : ""}`}
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <div
          className={`mini-seal ${selected?.status === "closed" || selected?.status === "exhausted" ? "complete" : ""}`}
        >
          {selected?.status === "closed" || selected?.status === "exhausted" ? (
            <Check size={16} />
          ) : (
            <Gift size={16} />
          )}
        </div>
        <div className="row-name">
          <strong>{selected ? selected.purpose : "Choose a gift"}</strong>
          <span>
            {selected
              ? `${selected.remaining} ${symbol} remaining · ${selected.policy.category}`
              : "Pick an envelope to redeem"}
          </span>
        </div>
        <ChevronDown size={16} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            className="picker-menu"
            aria-labelledby={labelId}
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 200, damping: 28, mass: 1 }
            }
          >
            {envelopes.map((item) => (
              <li key={item.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === selectedId}
                  className={item.id === selectedId ? "chosen" : ""}
                  onClick={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                >
                  <div
                    className={`mini-seal ${item.status === "closed" || item.status === "exhausted" ? "complete" : ""}`}
                  >
                    {item.status === "closed" || item.status === "exhausted" ? (
                      <Check size={16} />
                    ) : (
                      <Gift size={16} />
                    )}
                  </div>
                  <div className="row-name">
                    <strong>{item.purpose}</strong>
                    <span>
                      {item.remaining} {symbol} · {item.policy.category}
                      {item.partialUse ? " · partial use" : ""}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function DiscoverPanel({
  envelopes,
  selectedId,
  onSelect,
  request,
  act,
  busy,
  symbol,
}: {
  envelopes: Envelope[];
  selectedId?: string;
  onSelect: (id: string) => void;
  request: (
    path: string,
    body?: unknown,
    method?: string,
    extra?: Record<string, string>,
  ) => Promise<any>;
  act: (name: string, fn: () => Promise<unknown>) => Promise<void>;
  busy: string;
  symbol: string;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [settled, setSettled] = useState<any>(null);
  const envelope = envelopes.find((item) => item.id === selectedId);
  const lastRedemption = envelope?.redemptions?.at(-1);
  async function search(next = query) {
    if (!selectedId) return;
    const found = await request(
      `/envelopes/${selectedId}/options${next ? `?q=${encodeURIComponent(next)}` : ""}`,
    );
    setResult(found);
  }
  useEffect(() => {
    setResult(null);
    setSettled(null);
    if (selectedId) void search("");
  }, [selectedId]);
  if (!envelopes.length)
    return (
      <p className="helper">
        Create a gift first. Discover only shows purchases that match one you
        already funded.
      </p>
    );
  return (
    <div className="discover-grid">
      <section className="compose panel">
        <div className="section-top">
          <h2>Use this gift</h2>
          <span className="quiet">MCP · Melt</span>
        </div>
        <EnvelopePicker
          envelopes={envelopes}
          selectedId={selectedId}
          onSelect={onSelect}
          symbol={symbol}
        />
        <form
          className="discover-search"
          onSubmit={(e) => {
            e.preventDefault();
            void act("search", () => search(query));
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Italian near me, an eSIM for Japan, an indie game…"
            aria-label="What do you want this gift to become"
          />
          <button className="primary" disabled={!selectedId || !!busy}>
            {busy === "search" ? (
              <MeltLoader size={16} />
            ) : (
              <Search size={16} />
            )}
            Find options
          </button>
        </form>
        {result?.note && <p className="helper">{result.note}</p>}
        {result?.settlement && (
          <p className="helper">
            Settlement: {result.settlement}. Uniswap converts only the amount a
            qualifying purchase needs.
          </p>
        )}
        {settled && (
          <div className="settlement-card panel" role="status">
            <div className="mini-seal complete">
              <Check size={16} />
            </div>
            <div>
              <span className="quiet">Settled</span>
              <strong>{settled.title}</strong>
              <p>
                {settled.amountOut} {settled.symbol} via Uniswap. Leftover funds
                stay in the envelope.
              </p>
              {settled.hash && <p className="identifier">{settled.hash}</p>}
              {settled.delivery && <p className="helper">{settled.delivery}</p>}
            </div>
          </div>
        )}
        {lastRedemption && !settled && (
          <p className="helper">
            Last purchase: {lastRedemption.title}
            {lastRedemption.symbol
              ? ` · ${lastRedemption.amountOut} ${lastRedemption.symbol}`
              : ""}
          </p>
        )}
      </section>
      <section className="session-list">
        {(result?.options || []).map((option: any) => (
          <article key={option.sku} className="option-card panel">
            <div>
              <strong>{option.title}</strong>
              <p>
                {option.merchant} · ${option.priceUsd}
                {option.priceEth ? ` · ${option.priceEth} ${symbol}` : ""}
              </p>
              <p className="helper">{option.description}</p>
              <p className="quiet">{option.disclosure}</p>
            </div>
            <button
              className="primary"
              disabled={!!busy || envelope?.status !== "open"}
              onClick={() =>
                act("redeem", async () => {
                  const proposed = await request(
                    `/envelopes/${selectedId}/propose`,
                    { sku: option.sku, request: query },
                  );
                  const done = await request(
                    `/envelopes/${selectedId}/redeem`,
                    {
                      quoteId: proposed.quote.id,
                    },
                  );
                  setSettled(done.redemption);
                  await search(query);
                })
              }
            >
              {busy === "redeem" ? (
                <MeltLoader size={16} />
              ) : (
                <Check size={15} />
              )}
              Use this
            </button>
          </article>
        ))}
        {result && !result.options?.length && (
          <p className="helper">
            Nothing in the catalog matches this promise
            {query ? ` for “${query}”` : ""}.
          </p>
        )}
        {result?.rejected?.length > 0 && (
          <details>
            <summary>Rejected by the gift</summary>
            {result.rejected.map((item: any) => (
              <p key={item.sku} className="helper">
                {item.title}: {item.reason}
              </p>
            ))}
          </details>
        )}
      </section>
    </div>
  );
}
