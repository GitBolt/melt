import fs from "node:fs";
import { spawn } from "node:child_process";
fs.mkdirSync("data", { recursive: true });
const children = [];
function run(command, args) {
  const p = spawn(command, args, { stdio: "inherit", env: process.env });
  children.push(p);
  p.on("exit", (code) => {
    if (code) stop(code);
  });
  return p;
}
function stop(code = 0) {
  for (const p of children) p.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
if (!process.env.RPC_URL) {
  run(process.env.ANVIL_BIN || `${process.env.HOME}/.foundry/bin/anvil`, [
    "--host",
    "127.0.0.1",
    "--port",
    "8545",
    "--silent",
    "--state",
    "data/anvil-state.json",
    "--state-interval",
    "10",
  ]);
  for (let i = 0; i < 50; i++) {
    try {
      await fetch("http://127.0.0.1:8545", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
run(process.execPath, ["--import", "tsx", "--watch", "apps/api/src/index.ts"]);
run(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"]);
