import { MeltLoading } from "./components/MeltMotion";
import React, { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  networkKind,
  SEPOLIA_FAUCET,
  type Config,
} from "../../../packages/shared/src/index";
import App from "./App";
import Landing from "./Landing";
import { DirectRecovery } from "./DirectRecovery";
import { PublicReceipt } from "./PublicReceipt";
import "./style.css";
const PrivyApp = React.lazy(() => import("./PrivyApp"));
const recovery = location.pathname === "/recover";
const product = location.pathname === "/app";
const publicReceiptToken = location.pathname.match(
  /^\/r\/([0-9a-f]{48})$/i,
)?.[1];
const recoveryChainId = Number(import.meta.env.VITE_CHAIN_ID || 11155111);
const recoveryConfig: Config = {
  mode: "configured",
  network: networkKind(recoveryChainId),
  faucetUrl: recoveryChainId === 11155111 ? SEPOLIA_FAUCET : undefined,
  chain: {
    id: recoveryChainId,
    name: import.meta.env.VITE_CHAIN_NAME || "Sepolia",
    symbol: "ETH",
    explorer:
      import.meta.env.VITE_EXPLORER_URL || "https://sepolia.etherscan.io",
  },
  publicRpcUrl:
    import.meta.env.VITE_RPC_URL ||
    "https://ethereum-sepolia-rpc.publicnode.com",
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID,
  modelConfigured: false,
  fixture: {
    available: false,
    url: "",
    alternateUrl: "",
    target: "",
    selector: "",
    price: "0",
  },
  operator: "",
};
function Root() {
  const [config, setConfig] = useState<Config | undefined>(
      recovery ? recoveryConfig : undefined,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    if (recovery || !product) return;
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw Error("Could not connect to Melt");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  if (publicReceiptToken) return <PublicReceipt token={publicReceiptToken} />;
  if (!product && !recovery) return <Landing />;
  if (!config && !error) return <MeltLoading />;
  if (!config)
    return (
      <div className="boot">
        <b>melt</b>
        <p>{error || "Loading Melt…"}</p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </div>
    );
  return config.privyAppId ? (
    <Suspense fallback={<MeltLoading label="Preparing your wallet…" />}>
      <PrivyApp config={config} recovery={recovery} />
    </Suspense>
  ) : recovery ? (
    <DirectRecovery config={config} publicRpcUrl={config.publicRpcUrl} />
  ) : (
    <App config={config} />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
