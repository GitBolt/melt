import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

/** Folds follow the actual amount. Only the editable variant accepts interaction. */
export function BudgetRibbon({
  value,
  total,
  large = false,
  onChange,
  symbol = "ETH",
  label = "Adjust spending limit",
}: {
  value: number;
  total: number;
  large?: boolean;
  onChange?: (value: number) => void;
  symbol?: string;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const count = large ? 36 : 24;
  const amount = Number.isFinite(value) ? value : 0;
  const fraction = Math.min(1, Math.max(0, total > 0 ? amount / total : 0));
  const folds = (
    <span
      className={`budget-ribbon${large ? " ribbon-large" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => {
        const fill = Math.min(1, Math.max(0, fraction * count - i));
        return (
          <motion.i
            key={i}
            initial={false}
            className={fill > 0 ? "ribbon-filled" : ""}
            animate={{
              height:
                (large ? 14 : 7) +
                fill * (large ? 25 : 9) +
                Math.sin((i / (count - 1)) * Math.PI) * (large ? 15 : 8),
            }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 30 }
            }
            style={{ "--fold-shade": `${46 + fill * 26}%` } as CSSProperties}
          />
        );
      })}
    </span>
  );
  if (!onChange) return folds;
  return (
    <span className="budget-control">
      <span className="budget-track">
        {folds}
        <input
          type="range"
          aria-label={label}
          aria-valuetext={`${amount} ${symbol}`}
          min="0"
          max={total}
          step={total / 100}
          value={Math.min(total, Math.max(0, amount))}
          onChange={(event) =>
            onChange(Number(Number(event.target.value).toPrecision(12)))
          }
        />
      </span>
      <span className="budget-scale" aria-hidden="true">
        <span>0</span>
        <span>
          {total} {symbol}
        </span>
      </span>
    </span>
  );
}
