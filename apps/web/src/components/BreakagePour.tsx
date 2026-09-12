import { useState, type CSSProperties } from "react";
import { BudgetRibbon } from "./BudgetRibbon";
import { useReducedMotion } from "motion/react";
import "./breakage-pour.css";

const BUDGET = 50;

function readout(mode: "melt" | "card", spent: number, leftover: number) {
  if (mode === "card") {
    return leftover === 0
      ? `$${spent} food card. Nothing left for the store to keep.`
      : `$${spent} food card. The store keeps the unused $${leftover}.`;
  }
  if (leftover === 0) return `$${spent} food card. Nothing unused.`;
  if (spent === 0) return `$${BUDGET} unused. It returns to the sender.`;
  return `$${spent} food card. $${leftover} unused returns to the sender.`;
}

export function BreakagePour() {
  const reduced = useReducedMotion();
  const [spent, setSpent] = useState(25);
  const [mode, setMode] = useState<"melt" | "card">("melt");
  const leftover = Math.max(0, BUDGET - spent);
  return (
    <div className={`breakage-pour${reduced ? " is-still" : ""}`}>
      <div
        className="pour-modes"
        role="tablist"
        aria-label="Where unused money goes"
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
      <p className="pour-total">${BUDGET} envelope</p>
      <div
        className="pour-ticket"
        style={
          {
            "--dinner": String(Math.max(spent, 0.001)),
            "--unused": String(Math.max(leftover, 0.001)),
          } as CSSProperties
        }
      >
        <div className="pour-half is-dinner">
          <span>Food card</span>
          <strong>${spent}</strong>
        </div>
        <i className="pour-perf" aria-hidden="true" />
        <div
          className={`pour-half is-unused${mode === "card" ? " is-kept" : ""}`}
        >
          <span>{mode === "card" ? "The store" : "Unused"}</span>
          <strong>${leftover}</strong>
          <small>
            {mode === "card" ? "Not returned" : "Returns to sender"}
          </small>
        </div>
      </div>
      <p className="pour-readout" aria-live="polite">
        {readout(mode, spent, leftover)}
      </p>
      <BudgetRibbon
        value={spent}
        total={BUDGET}
        large
        symbol="USD"
        label="Card amount"
        onChange={(value) => setSpent(Math.round(value))}
      />
    </div>
  );
}
