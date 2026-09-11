import type { CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import "./return-ring.css";

/** Days left until leftover money returns. The ring is the clock. */
export function ReturnRing({
  expiresAt,
  createdAt,
  now = Date.now(),
  onCopy,
}: {
  expiresAt: number;
  createdAt: string;
  now?: number;
  onCopy?: (when: string) => void;
}) {
  const reduced = useReducedMotion();
  const start = Date.parse(createdAt);
  const end = expiresAt * 1000;
  const span = Math.max(end - start, 1);
  const left = Math.max(0, end - now);
  const fraction = Math.min(1, left / span);
  const days = Math.max(0, Math.ceil(left / 86_400_000));
  const when = new Date(end).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <button
      type="button"
      className={`return-ring${reduced ? " is-still" : ""}`}
      style={{ "--left": String(fraction) } as CSSProperties}
      onClick={() => onCopy?.(when)}
      title={`Unused funds return ${when}`}
    >
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle className="return-track" cx="36" cy="36" r="28" />
        <circle className="return-fill" cx="36" cy="36" r="28" />
      </svg>
      <span>
        {days === 0 ? "Returns today" : `${days}d left`}
        <small>then unused funds return</small>
      </span>
    </button>
  );
}
