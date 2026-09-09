import { MeltLoader, MeltWordmark } from "./components/MeltMotion";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Copy, Check } from "lucide-react";
import "./gift.css";

type PublicGift = {
  object: "gift";
  purpose: string;
  senderName: string;
  recipientLabel: string;
  note: string;
  status: string;
  amount: string;
  expiresAt: number;
  giftOpenedAt?: string;
  funded: boolean;
  lastPurchase: string;
  url: string;
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
  const reduced = useReducedMotion();
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
              <p className="gift-amount">{gift.amount}</p>
              <h1>{gift.purpose}</h1>
              {gift.note ? <blockquote>“{gift.note}”</blockquote> : null}
              <p className="gift-until">Use by {until}</p>
              {gift.lastPurchase ? (
                <p className="gift-until">Bought {gift.lastPurchase}</p>
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
              </div>
            </motion.section>
          ) : (
            <p className="helper gift-hint">
              {gift.senderName} sent you {gift.amount} for {gift.purpose}.
            </p>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
