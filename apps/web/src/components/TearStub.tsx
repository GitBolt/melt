import { useReducedMotion } from "motion/react";
import "./tear-stub.css";

/** Remaining vs spent as a perforated ticket. The remaining stub copies. */
export function TearStub({
  remaining,
  spent,
  remainingLabel,
  spentLabel,
  onCopyRemaining,
}: {
  remaining: string;
  spent: string;
  remainingLabel?: string;
  spentLabel?: string;
  onCopyRemaining?: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={`tear-stub${reduced ? " is-still" : ""}`}>
      <button
        type="button"
        className="tear-half is-left"
        onClick={onCopyRemaining}
        title="Copy what is still left"
      >
        <span>Still left</span>
        <strong>{remaining}</strong>
        {remainingLabel ? <small>{remainingLabel}</small> : null}
      </button>
      <i className="tear-perf" aria-hidden="true" />
      <div className="tear-half is-right">
        <span>Already used</span>
        <strong>{spent}</strong>
        {spentLabel ? <small>{spentLabel}</small> : null}
      </div>
    </div>
  );
}
