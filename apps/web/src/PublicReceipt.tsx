import { MeltLoader, MeltWordmark } from "./components/MeltMotion";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Check,
  ShieldCheck,
  Link2,
} from "lucide-react";
import "./public-receipt.css";

type PublicReceipt = {
  object: "receipt";
  id: string;
  url: string;
  status: string;
  outcome?: string;
  outcomeReason?: string;
  title: string;
  instruction: string;
  mandate: string;
  kind: string;
  budget: string;
  spent: string;
  remaining?: string;
  returned: string;
  vault: string;
  recovery: string;
  createdAt: string;
  chain: { id: number; name: string; symbol: string; explorer?: string };
  transactions: { hash: string; kind: string; status: string }[];
  assets: {
    token: string;
    kind: string;
    recovered: boolean;
    symbol?: string;
    amount?: string;
  }[];
  recover: { url: string; vault: string; owner: string; note: string };
};

const labels: Record<string, string> = {
  requires_funding: "Needs funding",
  open: "Open",
  processing: "In progress",
  settling: "Returning funds",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_recovery: "Needs recovery",
};

const short = (value: string) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—";

export function PublicReceipt({ token }: { token: string }) {
  const [receipt, setReceipt] = useState<PublicReceipt>(),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch(`/api/public/receipts/${token}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error || "Receipt not found");
        setReceipt(body);
      })
      .catch((e) => setError(e.message));
  }, [token]);
  if (!receipt && !error)
    return (
      <div className="boot">
        <MeltLoader />
        <p>Loading receipt…</p>
      </div>
    );
  if (!receipt)
    return (
      <div className="boot">
        <b>melt</b>
        <p>{error}</p>
        <a href="/">Back to Melt</a>
      </div>
    );
  const explorer = receipt.chain.explorer;
  return (
    <div className="app-shell receipt-shell">
      <header>
        <a className="recovery-back" href="/">
          <ArrowLeft size={16} />
          Melt
        </a>
        <MeltWordmark />
        <span className={`status status-${receipt.status}`}>
          {labels[receipt.status] || receipt.status}
        </span>
      </header>
      <section className="receipt-hero panel">
        <p className="landing-kicker">Public receipt</p>
        <h1>{receipt.title}</h1>
        <p className="mandate">{receipt.mandate}</p>
        <p className="helper">{receipt.instruction}</p>
        <dl className="wallet-facts">
          <div>
            <dt>Limit</dt>
            <dd>
              {receipt.budget} {receipt.chain.symbol}
            </dd>
          </div>
          <div>
            <dt>Spent</dt>
            <dd>
              {receipt.spent} {receipt.chain.symbol}
            </dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>
              {receipt.remaining ?? "—"} {receipt.chain.symbol}
            </dd>
          </div>
          <div>
            <dt>Returned</dt>
            <dd>
              {receipt.returned} {receipt.chain.symbol}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{receipt.chain.name}</dd>
          </div>
        </dl>
        <div className="receipt-actions">
          <button
            className="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(location.href).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? <Check size={14} /> : <Link2 size={14} />}
            {copied ? "Link copied" : "Copy link"}
          </button>
          <a className="secondary" href={receipt.recover.url}>
            <ShieldCheck size={14} />
            Recover without Melt
          </a>
        </div>
      </section>
      <div className="receipt-grid">
        <section className="panel">
          <h2>Transactions</h2>
          {receipt.transactions.length === 0 && (
            <p className="helper">No onchain transactions yet.</p>
          )}
          {receipt.transactions.map((tx) => (
            <div className="receipt-tx" key={tx.hash}>
              <div>
                <strong>{tx.kind}</strong>
                <span className="quiet">{tx.status}</span>
              </div>
              {explorer ? (
                <a
                  href={`${explorer.replace(/\/$/, "")}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(tx.hash)}
                  <ArrowUpRight size={14} />
                </a>
              ) : (
                <code>{short(tx.hash)}</code>
              )}
            </div>
          ))}
        </section>
        <aside className="panel">
          <h2>Recovery kit</h2>
          <p className="helper">{receipt.recover.note}</p>
          <p className="identifier">{receipt.vault || "Vault pending"}</p>
          <p className="quiet">Owner {short(receipt.recovery)}</p>
          {receipt.assets.filter((a) => a.recovered).length > 0 && (
            <ul className="receipt-assets">
              {receipt.assets
                .filter((a) => a.recovered)
                .map((asset) => (
                  <li key={asset.token + (asset.symbol || "")}>
                    {asset.amount ? `${asset.amount} ` : ""}
                    {asset.symbol || short(asset.token)}
                  </li>
                ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
