import { MeltLoader, MeltWordmark } from "./components/MeltMotion";
import { FitNeedle } from "./components/FitNeedle";
import { ReturnRing } from "./components/ReturnRing";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Copy, Check, Printer } from "lucide-react";
import "./gift.css";

type PublicGift = {
  object: "gift";
  purpose: string;
  category?: string;
  senderName: string;
  recipientLabel: string;
  note: string;
  status: string;
  amount: string;
  remaining?: string;
  sentUsd?: number;
  leftUsd?: number;
  leftoverReturns?: boolean;
  createdAt?: string;
  expiresAt: number;
  giftOpenedAt?: string;
  funded: boolean;
  lastPurchase: string;
  thankYou?: { message: string; at: string };
  url: string;
};

const ASK_HINT: Record<string, string> = {
  dinner: "Italian near me, cash out, headphones",
  game: "an indie game, a restaurant, cash out",
  esim: "Japan eSIM, headphones, cash out",
  concert: "tickets this weekend, merch, cash out",
  flight: "a flight home, a hotel, cash out",
  apartment: "a lamp, a TV, cash out",
  ai: "ChatGPT Plus, cash out",
};

function statusLabel(gift: PublicGift) {
  if (gift.lastPurchase) return "Already used";
  if (gift.funded) return "Ready to spend";
  return "Waiting on funds";
}

export function Gift({ token }: { token: string }) {
  const [gift, setGift] = useState<PublicGift>();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState("");
  const [thanks, setThanks] = useState("");
  const [thanking, setThanking] = useState(false);
  const [thanksError, setThanksError] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [ask, setAsk] = useState("");
  const [fit, setFit] = useState<{
    verdict: "idle" | "fits" | "no" | "loading";
    reason: string;
  }>({ verdict: "idle", reason: "" });
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!gift) return;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(gift.url || location.href, { margin: 1, width: 260 }),
      )
      .then(setQr)
      .catch(() => {});
  }, [gift]);
  useEffect(() => {
    fetch(`/api/public/gifts/${token}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error || "Gift not found");
        setGift(body);
      })
      .catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => {
    if (!open) return;
    fetch(`/api/public/gifts/${token}/opened`, { method: "POST" }).catch(
      () => {},
    );
  }, [open, token]);
  if (!gift && !error)
    return (
      <div className="boot">
        <MeltLoader />
        <p>Opening the envelope…</p>
      </div>
    );
  if (!gift)
    return (
      <div className="boot">
        <b>melt</b>
        <p>{error}</p>
        <a href="/">Back to Melt</a>
      </div>
    );
  const until = new Date(gift.expiresAt * 1000).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const spring = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 170, damping: 16 };
  const status = statusLabel(gift);
  return (
    <div className="gift-page">
      <header>
        <a href="/">
          <MeltWordmark />
        </a>
      </header>
      <main>
        <button
          type="button"
          className={`gift-envelope${open ? " open" : ""}`}
          onClick={() => setOpen(true)}
          aria-expanded={open}
        >
          <div className="gift-stage">
            <div className="gift-shadow" />
            <motion.div
              className="gift-hinge"
              initial={false}
              animate={{ rotateX: open ? -176 : 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 120, damping: 14, mass: 0.9 }
              }
            >
              <div className="gift-flap-front" />
              <div className="gift-flap-back" />
            </motion.div>
            <motion.div
              className="gift-seal"
              initial={false}
              animate={
                open
                  ? { scale: 0, y: -18, opacity: 0 }
                  : { scale: 1, y: 0, opacity: 1 }
              }
              transition={reduced ? { duration: 0 } : { duration: 0.28 }}
            >
              <i />
            </motion.div>
            <motion.div
              className="gift-slip"
              initial={false}
              animate={{
                y: open ? -92 : 36,
                rotate: open ? -4 : 0,
              }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { ...spring, delay: open ? 0.16 : 0 }
              }
            >
              <span>From {gift.senderName}</span>
              <strong>{gift.amount}</strong>
              <em>{gift.purpose}</em>
            </motion.div>
            <div className="gift-pocket">
              <span>{open ? "For you" : "Tap to open"}</span>
            </div>
            {open && !reduced
              ? [0, 1, 2].map((i) => (
                  <motion.i
                    key={`drip-${i}`}
                    className="gift-drip"
                    style={{ left: `${44 + i * 6}%` }}
                    initial={{ scaleY: 0, opacity: 0.9 }}
                    animate={{ scaleY: [0, 1, 1], opacity: [0.9, 0.75, 0] }}
                    transition={{
                      duration: 1.1,
                      delay: 0.1 + i * 0.14,
                      ease: "easeIn",
                    }}
                  />
                ))
              : null}
            {!open && !reduced
              ? [0, 1, 2, 3, 4].map((i) => (
                  <motion.i
                    key={i}
                    className="gift-fold"
                    style={{ left: `${38 + i * 18}%` }}
                    animate={{ scaleY: [0.45, 1, 0.45] }}
                    transition={{
                      duration: 1.7,
                      repeat: Infinity,
                      delay: i * 0.12,
                    }}
                  />
                ))
              : null}
          </div>
        </button>
        <AnimatePresence>
          {open ? (
            <motion.section
              className="gift-voucher"
              initial={reduced ? false : { opacity: 0, y: 36, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 160, damping: 18, delay: 0.28 }
              }
            >
              <div className="gift-voucher-top">
                <span>From {gift.senderName}</span>
                <span
                  className={`gift-chip${gift.lastPurchase ? "" : gift.funded ? " ready" : " wait"}`}
                >
                  {status}
                </span>
              </div>
              <p className="gift-amount">{gift.remaining || gift.amount}</p>
              {gift.remaining &&
              gift.leftUsd != null &&
              gift.sentUsd != null &&
              gift.leftUsd < gift.sentUsd * 0.98 ? (
                <p className="gift-until">of {gift.amount} sent</p>
              ) : null}
              <h1>{gift.purpose}</h1>
              {gift.note ? <blockquote>“{gift.note}”</blockquote> : null}
              <p className="gift-until">Use by {until}</p>
              {gift.createdAt ? (
                <ReturnRing
                  expiresAt={gift.expiresAt}
                  createdAt={gift.createdAt}
                />
              ) : null}
              {gift.leftoverReturns ? (
                <p className="gift-until">
                  What you don’t spend returns to {gift.senderName}.
                </p>
              ) : null}
              {gift.lastPurchase ? (
                <p className="gift-until">Bought {gift.lastPurchase}</p>
              ) : null}
              {gift.funded && !gift.lastPurchase ? (
                <p className="gift-prompt">
                  Or tell ChatGPT: “Use the gift {gift.senderName} sent me.”
                  <button
                    type="button"
                    className="quiet-inline"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigator.clipboard
                        .writeText(
                          `Use the gift ${gift.senderName} sent me. Find something that matches it.`,
                        )
                        .then(() => {
                          setPromptCopied(true);
                          setTimeout(() => setPromptCopied(false), 1600);
                        });
                    }}
                  >
                    {promptCopied ? "Copied" : "Copy"}
                  </button>
                </p>
              ) : null}
              {gift.funded && !gift.lastPurchase ? (
                <form
                  className="gift-fit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const request = ask.trim();
                    if (request.length < 2) return;
                    setFit({ verdict: "loading", reason: "" });
                    fetch(`/api/public/gifts/${token}/fit`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ request }),
                    })
                      .then(async (response) => {
                        const body = await response.json();
                        if (!response.ok)
                          throw Error(body.error || "Could not check that");
                        setFit({
                          verdict: body.fits ? "fits" : "no",
                          reason: body.reason || "",
                        });
                      })
                      .catch((err) =>
                        setFit({ verdict: "no", reason: err.message }),
                      );
                  }}
                >
                  {fit.verdict !== "idle" ? (
                    <FitNeedle verdict={fit.verdict} />
                  ) : null}
                  <div>
                    <label>
                      Would this count?
                      <input
                        value={ask}
                        onChange={(e) => {
                          setAsk(e.target.value);
                          if (fit.verdict !== "idle")
                            setFit({ verdict: "idle", reason: "" });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={
                          ASK_HINT[gift.category || ""] ||
                          "a purchase, cash out, headphones"
                        }
                      />
                    </label>
                    <button
                      type="submit"
                      className="secondary"
                      disabled={
                        ask.trim().length < 2 || fit.verdict === "loading"
                      }
                      onClick={(e) => e.stopPropagation()}
                    >
                      Ask
                    </button>
                    {fit.reason ? <p className="helper">{fit.reason}</p> : null}
                  </div>
                </form>
              ) : null}
              <div className="gift-actions">
                <a className="primary" href="/app#discover">
                  {gift.funded ? "Spend it in Melt" : "Open in Melt"}
                  <ArrowRight size={16} />
                </a>
                <button
                  type="button"
                  className="secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigator.clipboard
                      .writeText(gift.url || location.href)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      });
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    window.print();
                  }}
                >
                  <Printer size={16} />
                  Print it
                </button>
              </div>
              {gift.thankYou ? (
                <p className="gift-thanked">
                  You said thanks: “{gift.thankYou.message}”
                </p>
              ) : (
                <form
                  className="gift-thanks"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const message = thanks.trim();
                    if (message.length < 2 || thanking) return;
                    setThanking(true);
                    setThanksError("");
                    fetch(`/api/public/gifts/${token}/thanks`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ message }),
                    })
                      .then(async (response) => {
                        const body = await response.json();
                        if (!response.ok)
                          throw Error(body.error || "The note did not send");
                        setGift(body);
                      })
                      .catch((err) => setThanksError(err.message))
                      .finally(() => setThanking(false));
                  }}
                >
                  <input
                    value={thanks}
                    onChange={(e) => setThanks(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={`Say thanks to ${gift.senderName}…`}
                    maxLength={400}
                    aria-label="Thank-you note"
                  />
                  <button
                    type="submit"
                    className="secondary"
                    disabled={thanks.trim().length < 2 || thanking}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {thanking ? <MeltLoader size={14} /> : null}
                    Send
                  </button>
                  {thanksError ? (
                    <p className="gift-thanks-error">{thanksError}</p>
                  ) : null}
                </form>
              )}
            </motion.section>
          ) : (
            <p className="helper gift-hint">
              {gift.senderName} sent you {gift.amount} for {gift.purpose}.
            </p>
          )}
        </AnimatePresence>
      </main>
      <section className="gift-print" aria-hidden="true">
        <div className="gift-print-card">
          <b className="gift-print-brand">melt</b>
          <p className="gift-print-from">
            From {gift.senderName} · for {gift.recipientLabel}
          </p>
          <p className="gift-print-amount">{gift.amount}</p>
          <h2>{gift.purpose}</h2>
          {gift.note ? <p className="gift-print-note">“{gift.note}”</p> : null}
          {qr ? <img src={qr} alt="QR code for this gift" /> : null}
          <p className="gift-print-url">{gift.url || location.href}</p>
          <p className="gift-print-small">
            Scan to open the gift. Use by {until}. The amount is locked on
            Ethereum for this purpose; unused funds return to the sender.
          </p>
        </div>
      </section>
    </div>
  );
}
