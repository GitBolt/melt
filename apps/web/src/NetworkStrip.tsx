import { ArrowUpRight } from "lucide-react";
import type { NetworkKind } from "../../../packages/shared/src/index";

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
  return (
    <span className="network-strip">
      <span className="network-mark" aria-hidden="true">
        ◇
      </span>
      {chainName}
      <span className="env-detail">
        {network === "mainnet"
          ? "Real ETH"
          : network === "local"
            ? "Local fork · test funds · no real money"
            : "faucet ETH · no real money"}
      </span>
      <span className="network-switch" role="group" aria-label="Network">
        <button
          type="button"
          className={testnet ? "chosen" : ""}
          aria-pressed={testnet}
        >
          Testnet
        </button>
        <button
          type="button"
          className={!testnet ? "chosen" : ""}
          aria-pressed={!testnet}
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
