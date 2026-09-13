import { ArrowUpRight } from "lucide-react";
import type { NetworkKind } from "../../../packages/shared/src/index";

function EthereumMark() {
  return (
    <svg
      className="network-logo"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path fill="#8FFCF3" d="M12 3v6.651l5.625 2.516z" />
      <path fill="#CABCF8" d="m12 3-5.625 9.166L12 9.653z" />
      <path fill="#CBA7F5" d="M12 16.478V21l5.625-7.784z" />
      <path fill="#74A0F3" d="M12 21v-4.522l-5.625-3.262z" />
      <path fill="#CBA7F5" d="m12 15.43 5.625-3.263L12 9.652z" />
      <path fill="#74A0F3" d="M6.375 12.167 12 15.43V9.652z" />
      <path
        fill="#202699"
        fillRule="evenodd"
        d="m12 15.43-5.625-3.263L12 3l5.624 9.166zm-5.252-3.528 5.161-8.41v6.114zm-.077.229 5.238-2.327v5.364zm5.418-2.327v5.364l5.234-3.037zm0-.198 5.161 2.296-5.161-8.41z"
        clipRule="evenodd"
      />
      <path
        fill="#202699"
        fillRule="evenodd"
        d="m12 16.406-5.625-3.195L12 21l5.624-7.79zm-4.995-2.633 4.904 2.79v4.005zm5.084 2.79v4.005l4.905-6.795z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function NetworkStrip({
  network,
  chainName,
  faucetUrl,
  onExplainMainnet,
}: {
  network: NetworkKind;
  chainName: string;
  faucetUrl?: string;
  onExplainMainnet?: () => void;
}) {
  const testnet = network !== "mainnet";
  const detail =
    network === "mainnet" ? null : network === "local" ? "Local fork" : null;
  return (
    <span className="network-strip">
      <EthereumMark />
      {chainName}
      {detail ? <span className="env-detail">{detail}</span> : null}
      <span className="network-switch" role="group" aria-label="Network">
        <button
          type="button"
          className={testnet ? "chosen" : ""}
          aria-pressed={testnet}
          disabled
          title={
            testnet
              ? "Current deployment network"
              : "Network switching requires a different deployment"
          }
        >
          Testnet
        </button>
        <button
          type="button"
          className={!testnet ? "chosen" : ""}
          aria-pressed={!testnet}
          disabled={!testnet || !onExplainMainnet}
          onClick={() => {
            if (testnet) onExplainMainnet?.();
          }}
        >
          Mainnet
        </button>
      </span>
      {faucetUrl && testnet ? (
        <a
          className="faucet-link"
          href={faucetUrl}
          target="_blank"
          rel="noreferrer"
        >
          Faucet
          <ArrowUpRight size={12} />
        </a>
      ) : null}
    </span>
  );
}
