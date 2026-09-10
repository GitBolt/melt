import type { CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import "./purpose-loom.css";

/** The threads are the policy. Pull a red thread to write an exception. */
export function PurposeLoom({
  can,
  cannot,
  onExcept,
}: {
  can: string;
  cannot: { word: string; locked?: boolean }[];
  onExcept?: (word: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className={`purpose-loom${reduced ? " is-still" : ""}`}
      role="group"
      aria-label="What this gift can and cannot become"
    >
      <svg viewBox="0 0 220 78" aria-hidden="true">
        <path className="loom-beam" d="M12 10h196" />
        <circle cx="12" cy="10" r="3" />
        <circle cx="208" cy="10" r="3" />
      </svg>
      <div className="loom-threads">
        <button type="button" className="loom-thread is-can" disabled>
          <i style={{ "--sway": "0.6s" } as CSSProperties} />
          <span>Can</span>
          {can}
        </button>
        {cannot.map((item, i) => (
          <button
            key={item.word}
            type="button"
            className={`loom-thread is-not${item.locked ? " is-locked" : ""}`}
            disabled={item.locked || !onExcept}
            onClick={() => onExcept?.(item.word)}
            title={
              item.locked
                ? `${item.word} is always blocked`
                : `Add “except ${item.word}” to the gift`
            }
          >
            <i style={{ "--sway": `${0.9 + i * 0.2}s` } as CSSProperties} />
            <span>Cannot</span>
            {item.word}
          </button>
        ))}
      </div>
    </div>
  );
}
