import type { CSSProperties } from "react";
import { useId } from "react";
import { useReducedMotion } from "motion/react";
import "./wax-pool.css";

/** Remaining funds as a wax well. The fill is the money still in the envelope. */
export function WaxPool({
  remaining,
  budget,
  label,
}: {
  remaining: number;
  budget: number;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const clip = `wax${useId().replace(/:/g, "")}`;
  const total = Math.max(budget, 0.000001);
  const left = Math.min(Math.max(remaining, 0), total);
  const fraction = left / total;
  const spent = fraction < 0.97;
  return (
    <div
      className={`wax-pool${spent ? " is-spent" : ""}${reduced ? " is-still" : ""}`}
      style={{ "--fill": `${Math.round(fraction * 1000) / 10}%` } as CSSProperties}
      role="img"
      aria-label={
        label ||
        `${Math.round(fraction * 100)} percent of the gift still remaining`
      }
    >
      <svg viewBox="0 0 120 88" aria-hidden="true">
        <path
          className="wax-vessel"
          d="M18 14h84c4 0 7 3 7 7v50c0 9-10 15-49 15S11 80 11 71V21c0-4 3-7 7-7z"
        />
        <clipPath id={clip}>
          <path d="M20 18h80c3 0 5 2 5 5v48c0 8-9 13-45 13S15 79 15 71V23c0-3 2-5 5-5z" />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          <g className="wax-fill">
            <rect x="10" y="0" width="100" height="88" />
            <path
              className="wax-meniscus"
              d="M15 0h90v8c-14 6-32 8-45 8S29 14 15 8V0z"
            />
          </g>
        </g>
        {spent && !reduced ? (
          <>
            <path className="wax-drip wax-drip-a" d="M58 72c0 6 2 11 2 14" />
            <path className="wax-drip wax-drip-b" d="M66 74c0 5 1 9 1 12" />
          </>
        ) : null}
      </svg>
    </div>
  );
}
