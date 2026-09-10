import type { CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import "./fit-needle.css";

/** A working compass: the needle is the verdict, not decoration. */
export function FitNeedle({
  verdict,
}: {
  verdict: "idle" | "fits" | "no" | "loading";
}) {
  const reduced = useReducedMotion();
  const angle =
    verdict === "fits"
      ? -38
      : verdict === "no"
        ? 38
        : verdict === "loading"
          ? 8
          : 0;
  return (
    <div
      className={`fit-needle${verdict === "loading" ? " is-loading" : ""}${reduced ? " is-still" : ""}`}
      role="img"
      aria-label={
        verdict === "fits"
          ? "This matches the gift"
          : verdict === "no"
            ? "This does not match the gift"
            : "Ask whether a purchase would count"
      }
    >
      <svg viewBox="0 0 120 88" aria-hidden="true">
        <path className="fit-arc" d="M18 70a42 42 0 0 1 84 0" fill="none" />
        <text className="fit-label" x="22" y="82">
          Fits
        </text>
        <text className="fit-label" x="78" y="82">
          No
        </text>
        <g
          className="fit-pivot"
          style={{ "--angle": `${angle}deg` } as CSSProperties}
        >
          <path d="M60 68 L56 28 L60 22 L64 28 Z" />
          <circle cx="60" cy="68" r="5" />
        </g>
      </svg>
    </div>
  );
}
