import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { FrameStack } from "./CapacityMotion";
import { AnimatedCounter } from "./ui/animated-counter";

type Props = {
  worker: { active: number; queued: number; concurrency: number };
  available: number;
  onViewJobs: () => void;
};

export function WorkshopActivity({ worker, available, onViewJobs }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduce = useReducedMotion();
  const working = worker.active > 0;
  const status = working
    ? "Workshop at work"
    : worker.queued > 0
      ? "Jobs queued"
      : "Workshop ready";
  const transition = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 340, damping: 32 };

  return (
    <motion.div
      layout
      className="workshop-activity"
      transition={transition}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        className="activity-summary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className="activity-frame" aria-hidden="true">
          <FrameStack active={working} large />
        </span>
        <span className="activity-copy">
          <span className="activity-title" aria-live="polite">
            {status}
          </span>
          <span className="activity-caption">
            <AnimatedCounter value={available} /> jobs available
          </span>
        </span>
        <motion.span
          className="activity-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={transition}
        >
          <ChevronDown size={15} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            className="activity-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
          >
            <div className="activity-details-inner">
              <div className="activity-status-row">
                <span>Processing</span>
                <span>
                  <AnimatedCounter value={worker.active} /> /{" "}
                  {worker.concurrency}
                </span>
              </div>
              <div className="worker-slots" aria-hidden="true">
                {Array.from({ length: worker.concurrency }, (_, i) => (
                  <span
                    key={i}
                    className={i < worker.active ? "is-working" : ""}
                  >
                    <i />
                  </span>
                ))}
              </div>
              <div className="activity-bottom">
                <span>
                  {worker.queued > 0 ? `${worker.queued} in queue` : "No queue"}
                </span>
                <button onClick={onViewJobs}>
                  Your jobs <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
