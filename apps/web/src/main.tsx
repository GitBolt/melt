import { MeltLoading } from "./components/MeltMotion";
import React, { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Config } from "../../../packages/shared/src/index";
import App from "./App";
import { DirectRecovery } from "./DirectRecovery";
import "./style.css";
const PrivyApp = React.lazy(() => import("./PrivyApp"));
const recovery = location.pathname === "/recover";
const recoveryConfig: Config = {
  mode: "configured",
  chain: {
    id: Number(import.meta.env.VITE_CHAIN_ID || 11155111),
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
    if (recovery) return;
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw Error("Could not connect to Melt");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
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
