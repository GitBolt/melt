// Explicit operator-run deployment. Never invoked by build or tests on a public chain.
import fs from "node:fs";
import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
if (
  !process.env.RPC_URL ||
  !process.env.CHAIN_ID ||
  !process.env.OPERATOR_PRIVATE_KEY
)
  throw new Error(
    "Set RPC_URL, CHAIN_ID and OPERATOR_PRIVATE_KEY before deliberately deploying.",
  );
const account = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as Hex);
const chain = defineChain({
  id: Number(process.env.CHAIN_ID),
  name: process.env.CHAIN_NAME || "Ethereum testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL] } },
});
const client = createPublicClient({ chain, transport: http() });
if ((await client.getChainId()) !== chain.id)
  throw new Error("RPC chain mismatch");
const { default: solc } = await import("solc" as string);
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: {
        "Melt.sol": {
          content: fs.readFileSync("contracts/src/Melt.sol", "utf8"),
        },
      },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
      },
    }),
  ),
);
const errors = output.errors?.filter((e: any) => e.severity === "error");
if (errors?.length) throw new Error(JSON.stringify(errors));
const artifact = output.contracts["Melt.sol"].Melt;
const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
});
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("Deployment reverted");
console.log(
  `CONTRACT_ADDRESS=${receipt.contractAddress}\nTransaction: ${hash}\nOperator: ${account.address}`,
);
