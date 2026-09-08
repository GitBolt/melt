import { useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

/** A folded ribbon: height and colour encode the selected/available fraction. */
export function BudgetRibbon({
  value,
  total,
  large = false,
}: {
  value: number;
  total: number;
  large?: boolean;
}) {
  const [pointer, setPointer] = useState<number | null>(null);
  const reduced = useReducedMotion();
  const count = large ? 36 : 24;
  const fraction = Math.min(1, Math.max(0, total > 0 ? value / total : 0));
  return (
    <span
      className={`budget-ribbon${large ? " ribbon-large" : ""}`}
      aria-hidden="true"
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const rect = e.currentTarget.getBoundingClientRect();
        setPointer(((e.clientX - rect.left) / rect.width) * (count - 1));
      }}
      onPointerLeave={() => setPointer(null)}
    >
      {Array.from({ length: count }, (_, i) => {
        const fill = Math.min(1, Math.max(0, fraction * count - i));
        const lift =
          pointer === null ? 0 : Math.max(0, 1 - Math.abs(pointer - i) / 5);
        const fold = Math.sin((i / (count - 1)) * Math.PI);
        return (
          <motion.i
            key={i}
            initial={false}
            className={fill > 0 ? "ribbon-filled" : ""}
            animate={{
              height:
                (large ? 14 : 7) +
                fill * (large ? 25 : 9) +
                fold * (large ? 15 : 8) +
                lift * 9,
              y: reduced ? 0 : -lift * 5,
              rotate: reduced
                ? 0
                : pointer === null
                  ? 0
                  : (i - pointer) * lift * 3,
            }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 24 }
            }
            style={{ "--fold-shade": `${46 + fill * 26}%` } as CSSProperties}
          />
        );
      })}
    </span>
  );
}
