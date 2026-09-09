import { MeltLoader, MeltWordmark } from "./components/MeltMotion";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
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
  const paper = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 160, damping: 18 };
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
          <div className="gift-shadow" />
          <motion.div
            className="gift-flap"
            animate={{ rotateX: open ? -158 : 0 }}
            transition={paper}
          />
          <motion.div
            className="gift-sheet"
            animate={{ y: open ? -64 : 22, rotate: open ? -3 : 0 }}
            transition={paper}
          >
            <span>Envelope</span>
            <strong>{gift.purpose}</strong>
            <em>from {gift.senderName}</em>
          </motion.div>
          <div className="gift-pocket">{open ? "Opened" : "Tap to open"}</div>
        </button>
        {open ? (
          <section className="gift-voucher">
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
                onClick={() =>
                  navigator.clipboard
                    .writeText(gift.url || location.href)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    })
                }
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </section>
        ) : (
          <p className="helper gift-hint">
            {gift.senderName} sent you {gift.amount} for {gift.purpose}.
          </p>
        )}
      </main>
    </div>
  );
}
