import "./powered-uniswap.css";

export function PoweredByUniswap({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`powered-uniswap${compact ? " is-compact" : ""}`}
      href="https://uniswap.org"
      target="_blank"
      rel="noreferrer"
      aria-label="Powered by Uniswap"
    >
      <img
        src="/brand/uniswap-icon-pink.svg"
        alt=""
        width={18}
        height={20}
      />
      <span>Powered by Uniswap</span>
    </a>
  );
}
