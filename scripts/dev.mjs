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
// Free public RPCs rotate between working, rate-limiting, and demanding
// tokens for archive reads. Probe until one serves recent state so a fork
// start never depends on a single provider's mood.
const FORK_CANDIDATES = [
  "https://eth.drpc.org",
  "https://eth.merkle.io",
  "https://1rpc.io/eth",
  "https://eth.llamarpc.com",
  "https://ethereum-rpc.publicnode.com",
];
async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (!body.result) throw Error(JSON.stringify(body.error || body));
  return body.result;
}
async function pickForkRpc() {
  for (const url of FORK_CANDIDATES) {
    try {
      const block = await rpc(url, "eth_blockNumber", []);
      // Anvil reads forked state at an explicit block number, not "latest".
      // Some free providers call that an archive request and 403 it, so the
      // probe must do exactly what anvil will do.
      await rpc(url, "eth_getProof", [
        "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
        [],
        block,
      ]);
      return url;
    } catch {
      /* Try the next provider. */
    }
  }
  return "";
}
if (!process.env.RPC_URL) {
  // Optional mainnet fork so real Uniswap contracts are available locally for
  // onchain swaps. The chain id stays 31337 so every other local flow is
  // unchanged. Set MELT_FORK=1 for a default public RPC, or FORK_RPC_URL=... .
  let forkRpc = process.env.FORK_RPC_URL || "";
  if (!forkRpc && process.env.MELT_FORK) {
    forkRpc = await pickForkRpc();
    if (!forkRpc) {
      console.error(
        "No public Ethereum RPC is answering right now. Set FORK_RPC_URL to your own endpoint, or unset MELT_FORK to run without the fork.",
      );
      process.exit(1);
    }
  }
  const forkArgs = forkRpc
    ? [
        "--fork-url",
        forkRpc,
        "--chain-id",
        "31337",
        ...(process.env.FORK_BLOCK
          ? ["--fork-block-number", process.env.FORK_BLOCK]
          : []),
      ]
    : ["--state", "data/anvil-state.json", "--state-interval", "10"];
  if (forkRpc) console.log(`Forking ${forkRpc} on chain id 31337 for Uniswap.`);
  run(process.env.ANVIL_BIN || `${process.env.HOME}/.foundry/bin/anvil`, [
    "--host",
    "127.0.0.1",
    "--port",
    "8545",
    "--silent",
    ...forkArgs,
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
