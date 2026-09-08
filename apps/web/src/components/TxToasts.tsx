import { ExternalLink, X } from "lucide-react";

export type ChainToast = { id: string; hash: string; label: string };

export function txExplorerUrl(explorer: string | undefined, hash: string) {
  if (!explorer) return;
  return `${explorer.replace(/\/$/, "")}/tx/${hash}`;
}

export function shortHash(hash: string) {
  return hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : "";
}

export function isTxHash(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function TxToastStack({
  items,
  explorer,
  onDismiss,
}: {
  items: ChainToast[];
  explorer?: string;
  onDismiss: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="tx-toasts" aria-live="polite">
      {items.map((item) => {
        const href = txExplorerUrl(explorer, item.hash);
        return (
          <div className="tx-toast" key={item.id} role="status">
            <div>
              <strong>{item.label}</strong>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer">
                  {shortHash(item.hash)}
                  <ExternalLink size={12} />
                </a>
              ) : (
                <span className="identifier">{shortHash(item.hash)}</span>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => onDismiss(item.id)}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
