import { MeltLoader } from "./components/MeltMotion";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Gift,
  Check,
  Wallet,
  Search,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  RotateCcw,
  Heart,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { parseEther, toHex } from "viem";
import {
  inferEnvelopePolicy,
  type Config,
  type Envelope,
} from "../../../packages/shared/src/index";
import { WaxPool } from "./components/WaxPool";
import { ReturnRing } from "./components/ReturnRing";
import { PurposeLoom } from "./components/PurposeLoom";
import { TearStub } from "./components/TearStub";
import { OpenedBlot } from "./components/OpenedBlot";
import { FitNeedle } from "./components/FitNeedle";
import { PoweredByUniswap } from "./components/PoweredByUniswap";

const short = (s: string) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "Creating…";

export const PRESETS = [
  {
    label: "Food",
    purpose: "Food delivery, up to $50",
    usd: "50",
  },
  {
    label: "Mobile data",
    purpose: "Mobile data for your trip, up to $20",
    usd: "20",
  },
  {
    label: "Steam",
    purpose: "Steam games, up to $40",
    usd: "40",
  },
];

const CATEGORY_SAY: Record<string, string> = {
  esim: "mobile data",
  dinner: "food",
  concert: "a concert",
  flight: "a flight",
  game: "Steam",
  apartment: "the apartment",
  ai: "an AI product",
  other: "this purpose",
};

const ASK_FOR: Record<string, string[]> = {
  esim: ["an eSIM for Japan", "data for my trip"],
  dinner: ["Uber Eats", "DoorDash"],
  concert: ["tickets this weekend"],
  flight: ["a flight home"],
  game: ["Steam", "something on Steam under $40"],
  apartment: ["a lamp for the apartment"],
  ai: ["a month of ChatGPT"],
  other: ["what this gift was for"],
};

const LOOM_EXCEPT: Record<string, string[]> = {
  dinner: ["games"],
  concert: ["merch"],
  flight: ["hotels"],
  game: ["food"],
  apartment: ["electronics"],
  esim: ["headphones"],
  ai: ["hardware"],
  other: [],
};

function fulfillLabel(status?: string) {
  if (status === "issued") return "Card emailed";
  if (status === "awaiting_mainnet") return "Swap done · card waits for mainnet";
  if (status === "needs_email") return "Swap done · needs an email";
  if (status === "unpayable") return "Swap done · card not issued";
  return "";
}

function addExcept(purpose: string, word: string) {
  if (purpose.toLowerCase().includes(word.toLowerCase())) return purpose;
  return `${purpose.replace(/[.\s]+$/, "")}, except ${word}`;
}

export function usdToEth(usd: number, rate: number) {
  if (!(usd > 0) || !(rate > 0)) return "";
  const eth = usd / rate;
  if (eth > 10) return "";
  const text = eth.toFixed(5).replace(/\.?0+$/, "");
  return Number(text) > 0 ? text : "";
}

export function formatUsd(eth: string | number, rate?: number) {
  const n = Number(eth);
  if (!rate || !Number.isFinite(n) || n < 0) return "";
  const usd = n * rate;
  return usd.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: usd >= 10 ? 0 : 2,
  });
}

function formatMaxUsd(value: number) {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 10 ? 0 : 2,
  });
}

function formatEnvelopeUsd(
  envelope: Envelope,
  eth: string | number,
  ethUsd?: number,
) {
  if (
    envelope.status === "funding" &&
    envelope.policy?.maxUsd &&
    envelope.policy.maxUsd > 0
  )
    return formatMaxUsd(envelope.policy.maxUsd);
  return formatUsd(eth, ethUsd);
}

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

function toIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function DateField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => fromIso(value));
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = fromIso(value);
  const minDay = fromIso(min);
  useEffect(() => {
    if (open) setCursor(fromIso(value));
  }, [open, value]);
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
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const pad = start.getDay();
  const days = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from({ length: pad + days }, (_, i) =>
    i < pad
      ? null
      : new Date(cursor.getFullYear(), cursor.getMonth(), i - pad + 1),
  );
  while (cells.length % 7) cells.push(null);
  return (
    <div className="date-field" ref={root}>
      <span>{label}</span>
      <button
        type="button"
        className={`date-trigger${open ? " open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((next) => !next)}
      >
        {selected.toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
        <ChevronDown size={16} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={listId}
            role="dialog"
            aria-label={label}
            className="date-menu"
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 200, damping: 28, mass: 1 }
            }
          >
            <div className="date-nav">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setCursor(
                    new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={16} />
              </button>
              <strong>
                {cursor.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setCursor(
                    new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
                  )
                }
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="date-week">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="date-grid">
              {cells.map((day, i) =>
                day ? (
                  <button
                    key={toIso(day)}
                    type="button"
                    disabled={day < minDay}
                    className={
                      toIso(day) === value
                        ? "chosen"
                        : toIso(day) === toIso(new Date())
                          ? "today"
                          : ""
                    }
                    onClick={() => {
                      onChange(toIso(day));
                      setOpen(false);
                    }}
                  >
                    {day.getDate()}
                  </button>
                ) : (
                  <span key={`empty-${i}`} />
                ),
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
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
    recipientEmail: string;
    senderName: string;
    notifyRecipient: boolean;
    purpose: string;
    budget: string;
    expiresAt: number;
    partialUse: boolean;
    note: string;
    maxUsd?: number;
  }) => void;
  onCancel?: () => void;
}) {
  const [preset, setPreset] = useState("Food");
  const [senderName, setSenderName] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [purpose, setPurpose] = useState(PRESETS[0].purpose);
  const [usd, setUsd] = useState(PRESETS[0].usd);
  const [until, setUntil] = useState(defaultUntil);
  const [writtenAt] = useState(() => new Date().toISOString());
  const [partialUse, setPartialUse] = useState(true);
  const [note, setNote] = useState("");
  const rate = config.ethUsd || 2500;
  const budget = usdToEth(Number(usd), rate);
  const overCap =
    Number(usd) > 10000 || (Number(usd) > 0 && Number(usd) / rate > 10);
  const emailTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientLabel.trim());
  const cardEmail = emailTo ? recipientLabel.trim() : recipientEmail.trim();
  const heard = inferEnvelopePolicy(purpose, {
    maxUsd: Number(usd) > 0 ? Number(usd) : undefined,
    partialUse,
  });
  return (
    <form
      className="envelope-compose"
      onSubmit={(e) => {
        e.preventDefault();
        if (!budget) return;
        onSubmit({
          senderName,
          recipientLabel,
          recipientEmail: cardEmail,
          notifyRecipient: true,
          purpose,
          budget,
          expiresAt: endOfDay(until),
          partialUse,
          note,
          maxUsd: Number(usd) > 0 ? Number(usd) : undefined,
        });
      }}
    >
      <p className="swap-lead">
        Write what it is for. They pick Uber Eats, Steam, or an eSIM later.
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
              setUsd(item.usd);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label>
        From
        <input
          maxLength={80}
          value={senderName}
          placeholder="Maya"
          onChange={(e) => setSenderName(e.target.value)}
        />
      </label>
      <label>
        To
        <input
          required
          maxLength={120}
          value={recipientLabel}
          placeholder="Alex"
          onChange={(e) => setRecipientLabel(e.target.value)}
        />
      </label>
      {emailTo ? (
        <p className="helper">
          We will email the gift, and Cryptorefills can send the card here.
        </p>
      ) : (
        <label>
          Email for the card
          <input
            type="email"
            maxLength={200}
            value={recipientEmail}
            placeholder="alex@example.com"
            onChange={(e) => setRecipientEmail(e.target.value)}
          />
        </label>
      )}
      {!emailTo ? (
        <p className="helper">
          Optional. Cryptorefills emails the card here. They can add it when
          they spend.
        </p>
      ) : null}
      <label>
        The promise
        <textarea
          required
          maxLength={500}
          rows={3}
          minLength={8}
          value={purpose}
          placeholder="Food delivery, up to $50"
          onChange={(e) => {
            setPreset("");
            setPurpose(e.target.value);
          }}
        />
      </label>
      {purpose.trim().length >= 8 ? (
        <PurposeLoom
          can={CATEGORY_SAY[heard.category]}
          cannot={[
            { word: "cash", locked: true },
            ...heard.deny.slice(0, 2).map((word) => ({ word, locked: true })),
            ...(LOOM_EXCEPT[heard.category] || [])
              .filter(
                (word) =>
                  !heard.deny.includes(word) &&
                  !purpose.toLowerCase().includes(word),
              )
              .map((word) => ({ word })),
          ]}
          onExcept={(word) => {
            setPreset("");
            setPurpose((cur) => addExcept(cur, word));
          }}
        />
      ) : null}
      <label>
        A line they will see
        <input
          maxLength={400}
          value={note}
          placeholder="Happy birthday. This is for you."
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="usd-field">
        Up to
        <span className="amount-input">
          <span>$</span>
          <input
            aria-label="Envelope budget in US dollars"
            type="number"
            step="1"
            min="1"
            max="10000"
            required
            value={usd}
            onChange={(e) => {
              setPreset("");
              setUsd(e.target.value);
            }}
          />
          <span>USD</span>
        </span>
      </label>
      <p className="helper">
        {overCap
          ? Number(usd) > 10000
            ? "The most you can send this way is $10,000."
            : "That is more than this vault can hold right now."
          : budget
            ? `You will fund about ${budget} ${config.chain.symbol}.`
            : "Enter an amount."}
      </p>
      <DateField
        label="Use by"
        value={until}
        min={new Date().toISOString().slice(0, 10)}
        onChange={setUntil}
      />
      <ReturnRing expiresAt={endOfDay(until)} createdAt={writtenAt} />
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
        Allow partial use. Unused funds stay in the envelope, then return to{" "}
        {short(owner)}.
      </label>
      <div className="recovery-line">
        <ArrowRight size={14} />
        <span>Unused funds return to you after expiry</span>
        <span>They cannot cash it out</span>
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="primary" disabled={!!busy || !budget || overCap}>
          {busy === "create" ? <MeltLoader size={16} /> : <Gift size={16} />}
          Create envelope
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

export function ComingBack({
  envelopes,
  ethUsd,
  symbol,
}: {
  envelopes: Envelope[];
  ethUsd?: number;
  symbol: string;
}) {
  const live = envelopes.filter((item) =>
    ["funding", "open", "redeeming"].includes(item.status),
  );
  const remaining = live.reduce(
    (n, item) =>
      n + Number(item.status === "funding" ? item.budget : item.remaining),
    0,
  );
  const leftoverLabel = live.every(
    (item) => item.status === "funding" && item.policy?.maxUsd,
  )
    ? formatMaxUsd(
        live.reduce((n, item) => n + (item.policy?.maxUsd || 0), 0),
      )
    : formatUsd(remaining, ethUsd);
  const budget = live.reduce((n, item) => n + Number(item.budget), 0);
  if (remaining < 1e-8) return null;
  return (
    <div className="coming-back">
      <WaxPool
        remaining={remaining}
        budget={Math.max(budget, remaining)}
        label="Leftover still sitting in gifts"
      />
      <p>
        {leftoverLabel || `${remaining} ${symbol}`} still sitting in gifts.
        Stores keep remnants. Unused funds are returned.
      </p>
    </div>
  );
}

export function EnvelopeList({
  envelopes,
  now,
  symbol,
  ethUsd,
  onOpen,
}: {
  envelopes: Envelope[];
  now: number;
  symbol: string;
  ethUsd?: number;
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
            {formatEnvelopeUsd(
              envelope,
              envelope.status === "funding"
                ? envelope.budget
                : envelope.remaining,
              ethUsd,
            ) ||
              (envelope.status === "funding"
                ? envelope.budget
                : envelope.remaining)}{" "}
            <small>
              {formatEnvelopeUsd(
                envelope,
                envelope.status === "funding"
                  ? envelope.budget
                  : envelope.remaining,
                ethUsd,
              )
                ? envelope.status === "funding"
                  ? "to fund"
                  : "left"
                : symbol}
            </small>
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
  const [copiedVault, setCopiedVault] = useState(false);
  const [copiedLine, setCopiedLine] = useState(false);
  const [copiedLeft, setCopiedLeft] = useState(false);
  const unfunded = envelope.status === "funding";
  const intendedUsd = envelope.policy?.maxUsd;
  const budgetUsd =
    intendedUsd && intendedUsd > 0
      ? intendedUsd.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: intendedUsd >= 10 ? 0 : 2,
        })
      : formatUsd(envelope.budget, config.ethUsd);
  const shownUsd = unfunded
    ? budgetUsd
    : formatUsd(envelope.remaining, config.ethUsd);
  const leftLabel =
    shownUsd || (unfunded ? envelope.budget : envelope.remaining);
  const spentUsd = formatUsd(envelope.spent, config.ethUsd) || envelope.spent;
  return (
    <>
      <section className="detail-heading">
        <div>
          <h1>{envelope.purpose}</h1>
          <p>
            For {envelope.recipientLabel}
            {envelope.senderName ? ` · from ${envelope.senderName}` : ""}
            {envelope.recipientAddress
              ? ` · ${short(envelope.recipientAddress)}`
              : ""}
          </p>
        </div>
        <span className={`status status-${envelope.status}`}>
          {statusCopy[envelope.status]}
        </span>
      </section>
      <p className="session-mandate">
        Locked for {CATEGORY_SAY[envelope.category] || "this purpose"}
        {envelope.partialUse
          ? ". Partial use allowed."
          : ". One card only."}
      </p>
      <ol className="gift-path">
        <li className="is-done">
          <i />
          Written
        </li>
        <li className={unfunded ? "is-now" : "is-done"}>
          <i />
          {unfunded ? "Fund it" : "Funded"}
        </li>
        <li
          className={
            unfunded
              ? ""
              : envelope.giftOpenedAt || envelope.redemptions.length
                ? "is-done"
                : "is-now"
          }
        >
          <i />
          {envelope.redemptions.length
            ? "Spent"
            : envelope.giftOpenedAt
              ? "Opened"
              : "Hand it over"}
        </li>
      </ol>
      <div className="envelope-board">
        <aside className="panel envelope-money">
          <div className="balance-heading">
            <span>{unfunded ? "To fund" : "Left in the envelope"}</span>
            <h2>
              {leftLabel}
              <small>
                {shownUsd ? (unfunded ? "USD" : "left") : config.chain.symbol}
              </small>
            </h2>
          </div>
          <TearStub
            remaining={leftLabel}
            spent={spentUsd}
            remainingLabel={
              copiedLeft ? "Copied" : shownUsd ? "USD" : config.chain.symbol
            }
            spentLabel={
              formatUsd(envelope.spent, config.ethUsd)
                ? "USD"
                : config.chain.symbol
            }
            onCopyRemaining={() => {
              void navigator.clipboard.writeText(String(leftLabel)).then(() => {
                setCopiedLeft(true);
                window.setTimeout(() => setCopiedLeft(false), 1600);
              });
            }}
          />
          {envelope.status !== "funding" && (
            <ReturnRing
              expiresAt={envelope.expiresAt}
              createdAt={envelope.createdAt}
              now={now}
              onCopy={(when) =>
                void navigator.clipboard.writeText(
                  `Unused funds return ${when}`,
                )
              }
            />
          )}
          <dl className="wallet-facts">
            <div>
              <dt>Budget</dt>
              <dd>
                {budgetUsd || `${envelope.budget} ${config.chain.symbol}`}
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
          <div className="envelope-actions">
            {unfunded && envelope.vault && (
              <>
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
                  Fund from Melt
                </button>
                <button
                  className="secondary wide"
                  disabled={!!busy}
                  onClick={() =>
                    act("refresh", () =>
                      request(
                        `/sessions/${envelope.sessionId}/refresh`,
                        {},
                        "POST",
                      ),
                    )
                  }
                >
                  Check for funds
                </button>
              </>
            )}
            {envelope.status === "open" && (
              <button className="primary wide" onClick={onDiscover}>
                <Search size={15} />
                Find a card
              </button>
            )}
            {envelope.receiptToken && (
              <button className="secondary wide" onClick={onShare}>
                <Copy size={15} />
                Copy gift link
              </button>
            )}
            {envelope.receiptToken && envelope.status !== "funding" && (
              <button
                className="secondary wide"
                onClick={() => {
                  const usd =
                    budgetUsd ||
                    `${envelope.budget} ${config.chain.symbol}`;
                  const line = `I sent you ${usd} for ${envelope.purpose}. Open it here: ${location.origin}/g/${envelope.receiptToken}`;
                  void navigator.clipboard.writeText(line).then(() => {
                    setCopiedLine(true);
                    window.setTimeout(() => setCopiedLine(false), 1600);
                  });
                }}
              >
                <Copy size={15} />
                {copiedLine ? "Copied" : "Copy a message"}
              </button>
            )}
            {config.mailConfigured && envelope.recipientEmail && (
              <button
                className="secondary wide"
                disabled={!!busy}
                onClick={() =>
                  act("notify", () =>
                    request(`/envelopes/${envelope.id}/notify`, {}, "POST"),
                  )
                }
              >
                Email {envelope.recipientEmail}
              </button>
            )}
          </div>
          <details className="envelope-more">
            <summary>Envelope details</summary>
            {envelope.vault ? (
              <div className="fund-address">
                <span>Envelope address</span>
                <p className="identifier vault-line">
                  {envelope.vault}
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(envelope.vault)
                        .then(() => {
                          setCopiedVault(true);
                          window.setTimeout(() => setCopiedVault(false), 1600);
                        })
                    }
                  >
                    <Copy size={13} />
                    {copiedVault ? "Copied" : "Copy"}
                  </button>
                </p>
                {config.chain.explorer ? (
                  <a
                    href={`${config.chain.explorer.replace(/\/$/, "")}/address/${envelope.vault}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on explorer
                    <ExternalLink size={12} />
                  </a>
                ) : null}
                <p className="helper">
                  Send {config.chain.symbol} on {config.chain.name} here. Melt
                  notices a deposit without a signature.
                </p>
              </div>
            ) : envelope.setupError ? (
              <div className="fund-address">
                <p className="helper">{envelope.setupError}</p>
                <button
                  className="secondary wide"
                  disabled={!!busy}
                  onClick={() =>
                    act("retry-setup", () =>
                      request(`/envelopes/${envelope.id}/retry`, {}, "POST"),
                    )
                  }
                >
                  {busy === "retry-setup" ? (
                    <MeltLoader size={14} />
                  ) : (
                    <RotateCcw size={13} />
                  )}
                  Retry setup
                </button>
              </div>
            ) : (
              <p className="helper">Creating the envelope address…</p>
            )}
            {envelope.receiptToken && (
              <>
                <a
                  className="quiet-button wide"
                  href={`/g/${envelope.receiptToken}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open gift page
                </a>
                <a
                  className="quiet-button wide"
                  href={`/r/${envelope.receiptToken}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open receipt
                </a>
              </>
            )}
            {envelope.vault && (
              <a
                className="quiet-button wide"
                href={`/recover?vault=${envelope.vault}`}
              >
                <ShieldCheck size={14} /> Recover without Melt
              </a>
            )}
          </details>
        </aside>
        <section className="panel envelope-activity">
          <h2>Activity</h2>
          {envelope.giftOpenedAt ? (
            <OpenedBlot
              openedAt={envelope.giftOpenedAt}
              onCopy={(when) =>
                void navigator.clipboard.writeText(`Opened ${when}`)
              }
            />
          ) : (
            <OpenedBlot />
          )}
          {envelope.thankYou && (
            <blockquote className="thanks-note">
              <Heart size={14} />
              <div>
                <p>“{envelope.thankYou.message}”</p>
                <span className="quiet">
                  {envelope.recipientLabel} ·{" "}
                  {new Date(envelope.thankYou.at).toLocaleDateString()}
                </span>
              </div>
            </blockquote>
          )}
          {envelope.redemptions.length === 0 && (
            <div className="envelope-empty">
              <p>
                Nothing spent yet. Send the gift link, or find a card that
                matches the purpose.
              </p>
              {envelope.status === "open" ? (
                <button className="secondary" onClick={onDiscover}>
                  Find a card
                </button>
              ) : null}
            </div>
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
                {item.fulfillment?.status ? (
                  <p className="fulfill-status">
                    {fulfillLabel(item.fulfillment.status)}
                  </p>
                ) : null}
              </div>
              <time>{new Date(item.createdAt).toLocaleString()}</time>
            </article>
          ))}
          {(envelope.timeline?.length || 0) > 0 && (
            <details className="envelope-timeline">
              <summary>
                Every step
                <span className="quiet"> · {envelope.timeline!.length}</span>
              </summary>
              <ol>
                {envelope.timeline!.map((entry) => (
                  <li key={entry.id} className={`timeline-${entry.kind}`}>
                    <i />
                    <div>
                      <p>{entry.text}</p>
                      <span className="quiet">
                        {new Date(entry.at).toLocaleString()}
                        {entry.hash ? ` · ${short(entry.hash)}` : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
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
  ethUsd,
}: {
  envelopes: Envelope[];
  selectedId?: string;
  onSelect: (id: string) => void;
  symbol: string;
  ethUsd?: number;
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
              ? selected.status === "funding"
                ? `${formatEnvelopeUsd(selected, selected.budget, ethUsd) || selected.budget} to fund · ${selected.policy.category}`
                : `${formatEnvelopeUsd(selected, selected.remaining, ethUsd) || `${selected.remaining} ${symbol}`} left · ${selected.policy.category}`
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
                      {item.status === "funding"
                        ? `${formatEnvelopeUsd(item, item.budget, ethUsd) || item.budget} to fund`
                        : formatEnvelopeUsd(item, item.remaining, ethUsd) ||
                          `${item.remaining} ${symbol}`}{" "}
                      · {item.policy.category}
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
  ethUsd,
  onTx,
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
  ethUsd?: number;
  onTx?: (hash: string, label?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cardEmail, setCardEmail] = useState("");
  const [result, setResult] = useState<any>(null);
  const [settled, setSettled] = useState<any>(null);
  const [redeeming, setRedeeming] = useState<{
    sku: string;
    step: string;
  } | null>(null);
  const envelope = envelopes.find((item) => item.id === selectedId);
  const lastRedemption = envelope?.redemptions?.at(-1);
  const needsFunds = envelope?.status === "funding";
  const deliveryEmail = cardEmail.trim() || envelope?.recipientEmail || "";
  async function search(next = query) {
    if (!selectedId || needsFunds) return;
    const found = await request(
      `/envelopes/${selectedId}/options${next ? `?q=${encodeURIComponent(next)}` : ""}`,
    );
    setResult(found);
  }
  useEffect(() => {
    setResult(null);
    setSettled(null);
    setCardEmail(envelope?.recipientEmail || "");
    if (selectedId && envelope?.status !== "funding") void search("");
  }, [selectedId, envelope?.status, envelope?.recipientEmail]);
  if (!envelopes.length)
    return (
      <section className="compose panel">
        <img
          src="/illustrations/melt-well.png"
          alt=""
          className="empty-illust"
        />
        <h2>Nothing to spend yet</h2>
        <p className="helper">
          Create a gift first. Discover only shows cards that match one you
          already funded.
        </p>
      </section>
    );
  return (
    <div className="discover-grid">
      <section className="compose panel">
        <div className="section-top">
          <h2>Use this gift</h2>
          <span className="quiet">Gift cards</span>
        </div>
        <EnvelopePicker
          envelopes={envelopes}
          selectedId={selectedId}
          onSelect={onSelect}
          symbol={symbol}
          ethUsd={ethUsd}
        />
        {needsFunds ? (
          <p className="helper">
            This gift has no funds yet. Open it and send {symbol} to the
            envelope address, then come back here.
          </p>
        ) : (
          <form
            className="discover-search"
            onSubmit={(e) => {
              e.preventDefault();
              void act("search", () => search(query));
            }}
          >
            <FitNeedle
              verdict={
                busy === "search"
                  ? "loading"
                  : result
                    ? result.options?.length
                      ? "fits"
                      : "no"
                    : "idle"
              }
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Uber Eats, an eSIM for Japan, Steam…"
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
        )}
        {envelope && !needsFunds ? (
          <div className="ask-chips">
            {(ASK_FOR[envelope.category] || ASK_FOR.other).map((ask) => (
              <button
                key={ask}
                type="button"
                className={query === ask ? "chosen" : ""}
                disabled={!!busy}
                onClick={() => {
                  setQuery(ask);
                  void act("search", () => search(ask));
                }}
              >
                {ask}
              </button>
            ))}
          </div>
        ) : null}
        {envelope && !needsFunds && !envelope.recipientEmail ? (
          <label>
            Email for the card
            <input
              type="email"
              value={cardEmail}
              onChange={(e) => setCardEmail(e.target.value)}
              placeholder="alex@example.com"
              autoComplete="email"
            />
          </label>
        ) : null}
        {result?.note && <p className="helper">{result.note}</p>}
        {envelope && !needsFunds ? (
          <div className="settle-note">
            <PoweredByUniswap compact />
            <p className="helper">
              Uniswap converts only the card amount to USDC. Cryptorefills
              emails the brand. On Sepolia the swap is live; a live card needs
              mainnet USDC.
            </p>
          </div>
        ) : null}
        {settled && (
          <div className="settlement-card panel" role="status">
            <div className="mini-seal complete">
              <Check size={16} />
            </div>
            <div>
              <span className="quiet">
                {fulfillLabel(settled.fulfillment?.status) || "Settled"}
              </span>
              <strong>{settled.title}</strong>
              <p>
                {settled.amountOut} {settled.symbol} via Uniswap. Leftover funds
                stay in the envelope.
              </p>
              {settled.hash && <p className="identifier">{settled.hash}</p>}
              {settled.delivery && <p className="helper">{settled.delivery}</p>}
              <PoweredByUniswap compact />
            </div>
          </div>
        )}
        {lastRedemption && !settled && (
          <p className="helper">
            Last card: {lastRedemption.title}
            {lastRedemption.symbol
              ? ` · ${lastRedemption.amountOut} ${lastRedemption.symbol}`
              : ""}
          </p>
        )}
      </section>
      <section className="session-list">
        {busy === "search" && (
          <p className="helper" role="status">
            Matching your request against the catalog…
          </p>
        )}
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
                  setRedeeming({ sku: option.sku, step: "Reserving…" });
                  try {
                    const proposed = await request(
                      `/envelopes/${selectedId}/propose`,
                      { sku: option.sku, request: query },
                    );
                    setRedeeming({
                      sku: option.sku,
                      step: "Settling on Uniswap…",
                    });
                    const done = await request(
                      `/envelopes/${selectedId}/redeem`,
                      {
                        quoteId: proposed.quote.id,
                        ...(deliveryEmail ? { email: deliveryEmail } : {}),
                      },
                    );
                    setSettled(done.redemption);
                    if (done.redemption?.hash)
                      onTx?.(done.redemption.hash, "Settled on Uniswap");
                    await search(query);
                  } finally {
                    setRedeeming(null);
                  }
                })
              }
            >
              {redeeming && redeeming.sku === option.sku ? (
                <>
                  <MeltLoader size={16} />
                  {redeeming.step}
                </>
              ) : (
                <>
                  <Check size={15} />
                  Use this
                </>
              )}
            </button>
          </article>
        ))}
        {result && !result.options?.length && !result.note && (
          <p className="helper">
            Nothing in the catalog matches this promise
            {query ? ` for “${query}”` : ""}. Matching cards have a listed
            price; leftover below that cannot buy a smaller card.
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
