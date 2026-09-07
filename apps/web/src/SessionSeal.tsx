import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, LockKeyhole } from "lucide-react";
import type { TaskStatus } from "../../../packages/shared/src/index";

/** The paper leaves its sleeve while a task is open and settles home when closed. */
export function SessionSeal({ status = "ready" }: { status?: TaskStatus }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const closed = status === "closed";
  const active = status === "running" && inView && visible && !reduced;
  const open = ["ready", "running", "paused"].includes(status);
  const paperMotion = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 180, damping: 22 };
  return (
    <div
      ref={ref}
      className={`session-seal ${closed ? "seal-closed" : ""}`}
      aria-hidden="true"
    >
      <div className="seal-shadow" />
      <motion.div
        className="seal-paper paper-third"
        animate={{ rotate: open ? 12 : 0, y: open ? -27 : 0, x: open ? 22 : 0 }}
        transition={paperMotion}
      />
      <motion.div
        className="seal-paper paper-second"
        animate={{
          rotate: open ? -9 : 0,
          y: open ? -43 : 0,
          x: open ? -14 : 0,
        }}
        transition={paperMotion}
      />
      <motion.div
        className="seal-paper paper-front"
        animate={{ y: open ? -12 : 0, rotate: open ? 2 : 0 }}
        transition={{ duration: reduced ? 0 : 0.5 }}
      >
        <span className="paper-stamp">
          {closed ? <Check size={20} /> : <ArrowUpRight size={20} />}
        </span>
        <span className="paper-rule" />
        <span className="paper-rule short" />
        <div className="paper-perforation" />
        <span className="paper-squares">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.i
              key={i}
              animate={{ scaleY: active ? [0.4, 1, 0.4] : closed ? 0.4 : 1 }}
              transition={
                active
                  ? { duration: 1.8, repeat: Infinity, delay: i * 0.17 }
                  : { duration: reduced ? 0 : 0.2 }
              }
            />
          ))}
        </span>
      </motion.div>
      <div className="seal-pocket">
        <LockKeyhole size={14} />
        <span>{closed ? "Closed" : "Task wallet"}</span>
      </div>
    </div>
  );
}
