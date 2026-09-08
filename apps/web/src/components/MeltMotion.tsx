import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./melt-motion.css";

/** An indeterminate material study, never a percentage or a success signal. */
export function MeltLoader({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let visible = false;
    const update = () => setPlaying(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    if (ref.current) observer.observe(ref.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <svg
      ref={ref}
      className={`melt-loader ${className}`}
      data-playing={playing}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} style={{ "--phase": `${i * -0.23}s` } as CSSProperties}>
          <rect
            className="melt-strip"
            x={7 + i * 5.5}
            y="7"
            width="4"
            height="17"
            rx="2"
            fill="currentColor"
          />
          <rect
            className="melt-foot"
            x={6 + i * 5.5}
            y="30"
            width="6"
            height="2.5"
            rx="1.25"
            fill="currentColor"
          />
        </g>
      ))}
    </svg>
  );
}

export function MeltWordmark() {
  return (
    <span className="melt-word" role="img" aria-label="melt">
      {[..."melt"].map((letter, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ "--letter": i } as CSSProperties}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

export function MeltLoading({ label = "Loading Melt…" }: { label?: string }) {
  return (
    <div className="boot melt-loading" role="status" aria-live="polite">
      <MeltLoader size={76} />
      <b>
        <MeltWordmark />
      </b>
      <p>{label}</p>
    </div>
  );
}
