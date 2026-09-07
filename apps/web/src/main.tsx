import React, { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Config } from "../../../packages/shared/src/index";
import App from "./App";
import "./style.css";
const PrivyApp = React.lazy(() => import("./PrivyApp"));
function Root() {
  const [config, setConfig] = useState<Config>(),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw Error("Could not connect to Melt");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  if (!config)
    return (
      <div className="boot">
        <b>melt</b>
        <p>{error || "Loading Melt…"}</p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </div>
    );
  return config.privyAppId ? (
    <Suspense fallback={<div className="boot">Loading sign-in…</div>}>
      <PrivyApp config={config} />
    </Suspense>
  ) : (
    <App config={config} />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
