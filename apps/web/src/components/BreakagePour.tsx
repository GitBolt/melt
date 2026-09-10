import { useState, type CSSProperties } from "react";
import { BudgetRibbon } from "./BudgetRibbon";
import { useReducedMotion } from "motion/react";
import "./breakage-pour.css";

const BUDGET = 120;

/** Spend the dinner. Leftover either returns, or a store card keeps it. */
export function BreakagePour() {
  const reduced = useReducedMotion();
  const [spent, setSpent] = useState(86);
  const [mode, setMode] = useState<"melt" | "card">("melt");
  const leftover = Math.max(0, BUDGET - spent);
  const giftFill = leftover / BUDGET;
  const senderFill = mode === "melt" ? leftover / BUDGET : 0;
  const plateFill = spent / BUDGET;
  return (
    <div className={`breakage-pour${reduced ? " is-still" : ""}`}>
      <div
        className="pour-modes"
        role="tablist"
        aria-label="Where leftover goes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "melt"}
          className={mode === "melt" ? "chosen" : ""}
          onClick={() => setMode("melt")}
        >
          Melt
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "card"}
          className={mode === "card" ? "chosen" : ""}
          onClick={() => setMode("card")}
        >
          Store card
        </button>
      </div>
      <div className="pour-stage" aria-hidden="true">
        <Well fill={giftFill} label="Gift" />
        <span className={`pour-stream${spent > 0 ? " is-on" : ""}`} />
        <Well fill={plateFill} label="Dinner" tone="spent" />
        <span
          className={`pour-stream is-return${mode === "melt" && leftover > 0 ? " is-on" : ""}`}
        />
        <Well fill={senderFill} label="You" locked={mode === "card"} />
      </div>
      <p className="pour-readout">
        {mode === "melt"
          ? `$${spent} for dinner. $${leftover} comes back to you.`
          : `$${spent} for dinner. The store keeps the leftover $${leftover}.`}
      </p>
      <BudgetRibbon
        value={spent}
        total={BUDGET}
        large
        symbol="USD"
        onChange={(value) => setSpent(Math.round(value))}
      />
    </div>
  );
}

function Well({
  fill,
  label,
  tone,
  locked,
}: {
  fill: number;
  label: string;
  tone?: "spent";
  locked?: boolean;
}) {
  return (
    <div
      className={`pour-well${tone === "spent" ? " is-spent" : ""}${locked ? " is-locked" : ""}`}
      style={{ "--fill": fill } as CSSProperties}
    >
      <svg viewBox="0 0 72 64">
        <path
          className="pour-vessel"
          d="M10 8h52c3 0 6 3 6 6v32c0 8-8 12-32 12S4 54 4 46V14c0-3 3-6 6-6z"
        />
        <rect className="pour-fill" x="8" y="10" width="56" height="48" />
      </svg>
      <span>{locked ? "Kept" : label}</span>
    </div>
  );
}
