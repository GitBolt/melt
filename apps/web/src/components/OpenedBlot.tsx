import { useReducedMotion } from "motion/react";
import "./opened-blot.css";

/** Ink that spread when they opened the gift. Click copies the time. */
export function OpenedBlot({
  openedAt,
  onCopy,
}: {
  openedAt?: string;
  onCopy?: (when: string) => void;
}) {
  const reduced = useReducedMotion();
  const when = openedAt
    ? new Date(openedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  return (
    <button
      type="button"
      className={`opened-blot${openedAt ? " is-open" : ""}${reduced ? " is-still" : ""}`}
      disabled={!openedAt}
      onClick={() => when && onCopy?.(when)}
      title={
        openedAt
          ? `Opened ${when}. Copy that.`
          : "They have not opened this yet"
      }
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="blot-seal" cx="24" cy="24" r="10" />
        <path
          className="blot-spill"
          d="M24 18c8-2 16 4 14 12-2 8-10 10-16 8-7-2-12-8-10-14 2-5 7-7 12-6z"
        />
      </svg>
      <span>
        {openedAt ? `Opened ${when}` : "Not opened yet"}
        <small>
          {openedAt ? "the gift did not get lost in mail" : "Waiting on them"}
        </small>
      </span>
    </button>
  );
}
