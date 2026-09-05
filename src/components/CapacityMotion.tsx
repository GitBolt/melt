import { useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

/** A folded ribbon: height and colour encode the selected/available fraction. */
export function CapacityRibbon({
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
  const fraction = Math.min(1, Math.max(0, value / Math.max(1, total)));
  return (
    <span
      className={`capacity-ribbon${large ? " ribbon-large" : ""}`}
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

/** Layered image frames open on interaction and advance only for actual work. */
export function FrameStack({
  active = false,
  complete = false,
  large = false,
}: {
  active?: boolean;
  complete?: boolean;
  large?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`frame-stack${large ? " frame-large" : ""}${active ? " frame-running" : ""}${complete ? " frame-complete" : ""}`}
    >
      <i className="frame-sheet frame-back" />
      <i className="frame-sheet frame-mid" />
      <i className="frame-sheet frame-front">
        <svg viewBox="0 0 24 24" fill="none">
          <path d={complete ? "m6 12 4 4 8-8" : "m4 17 5-6 4 4 3-3 4 5"} />
          <path className="frame-image-sun" d="M16 7h.01" />
        </svg>
      </i>
    </span>
  );
}

/** A one-day horizon. Absolute expiry remains written beside the folds. */
export function ExpiryFold({ expiresAt }: { expiresAt: number }) {
  const fraction = Math.max(
    0,
    Math.min(1, (expiresAt * 1000 - Date.now()) / 86400000),
  );
  return (
    <span className="expiry-fold" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <i
          key={i}
          style={{
            opacity: i < fraction * 6 ? 1 : 0.16,
            transform: `translateY(${Math.abs(i - 2.5) * 1.5}px) rotate(${(i - 2.5) * 7}deg)`,
          }}
        />
      ))}
    </span>
  );
}
