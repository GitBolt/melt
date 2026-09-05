import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import fs from "node:fs";
// Anvil's public development keys. Never funded or used outside the loopback playground.
// Derive accounts using the public development mnemonic, avoiding stored user secrets.
import { mnemonicToAccount } from "viem/accounts";
const mnemonic = "test test test test test test test test test test test junk";
export const demo = !process.env.RPC_URL;
export const rpc = process.env.RPC_URL || "http://127.0.0.1:8545";
export const chain = {
  ...foundry,
  id: Number(process.env.CHAIN_ID || 31337),
  name: process.env.CHAIN_NAME || "Local Ethereum",
};
export const client = createPublicClient({ chain, transport: http(rpc) });
export const accounts = [0, 1, 2].map((addressIndex) =>
  mnemonicToAccount(mnemonic, { addressIndex }),
);
if (
  !demo &&
  (!process.env.OPERATOR_PRIVATE_KEY ||
    !process.env.CHAIN_ID ||
    !process.env.APP_ORIGIN)
)
  throw new Error(
    "Configured EVM mode requires OPERATOR_PRIVATE_KEY, CHAIN_ID and APP_ORIGIN.",
  );
const operator = demo
  ? accounts[0]
  : privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as Hex);
export const operatorAddress = operator.address;
export let address: Address;
export let abi: any;
let queue: Promise<unknown> = Promise.resolve();
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}
export async function write(
  functionName: string,
  args: any[] = [],
  who = 0,
  value = 0n,
  onBroadcast?: (hash: Hex) => void,
) {
  return serialized(async () => {
    const account = demo ? accounts[who] : operator;
    const wallet = createWalletClient({ account, chain, transport: http(rpc) });
    const hash = await wallet.writeContract({
      address,
      abi,
      functionName,
      args,
      value,
    });
    onBroadcast?.(hash);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
    return hash;
  });
}
export const read = (functionName: string, args: any[] = []): Promise<any> =>
  client.readContract({ address, abi, functionName, args });
export async function initialize() {
  if ((await client.getChainId()) !== chain.id)
    throw new Error("RPC chain ID does not match configured chain");
  const { default: solc } = await import("solc" as string);
  const source = fs.readFileSync("contracts/src/Melt.sol", "utf8");
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "Melt.sol": { content: source } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
        },
      }),
    ),
  );
  const errors = compiled.errors?.filter((e: any) => e.severity === "error");
  if (errors?.length) throw new Error(JSON.stringify(errors));
  const artifact = compiled.contracts["Melt.sol"].Melt;
  abi = artifact.abi;
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/Melt.json", JSON.stringify(artifact, null, 2));
  const manifest = fs.existsSync("data/deployment.json")
    ? JSON.parse(fs.readFileSync("data/deployment.json", "utf8"))
    : null;
  const candidate =
    process.env.CONTRACT_ADDRESS ||
    (manifest?.chainId === chain.id ? manifest.address : null);
  if (candidate && (await client.getCode({ address: candidate })))
    address = candidate;
  else {
    if (!demo)
      throw new Error("Set CONTRACT_ADDRESS to your deployed Melt contract.");
    const wallet = createWalletClient({
      account: operator,
      chain,
      transport: http(rpc),
    });
    const hash = await wallet.deployContract({
      abi,
      bytecode: `0x${artifact.evm.bytecode.object}`,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    address = receipt.contractAddress!;
    fs.writeFileSync(
      "data/deployment.json",
      JSON.stringify({ address, chainId: chain.id }),
    );
  }
  if ((await read("operator")).toLowerCase() !== operator.address.toLowerCase())
    throw new Error("Configured operator does not own this contract");
  if (demo && Number(await read("lotCount")) === 0) {
    const now = Math.floor(Date.now() / 1000);
    for (const [units, hours, price] of [
      [48, 4, "0.0002"],
      [120, 12, "0.00015"],
      [80, 24, "0.00018"],
    ] as const)
      await write("issue", [
        BigInt(units),
        BigInt(now + hours * 3600),
        parseEther(price),
      ]);
  }
}
export async function inventory(owner?: Address) {
  const lots = [];
  for (let id = 1; id <= Number(await read("lotCount")); id++) {
    const [total, remaining, expiresAt, price] = await read("lots", [
      BigInt(id),
    ]);
    const owned = owner ? await read("balance", [owner, BigInt(id)]) : 0n;
    lots.push({
      id,
      total: Number(total),
      remaining: Number(remaining),
      expiresAt: Number(expiresAt),
      price: formatEther(price),
      owned: Number(owned),
    });
  }
  const listings = [];
  for (let id = 1; id <= Number(await read("listingCount")); id++) {
    const [seller, lotId, units, price] = await read("listings", [BigInt(id)]);
    if (units > 0n)
      listings.push({
        id,
        seller,
        lotId: Number(lotId),
        units: Number(units),
        price: formatEther(price),
      });
  }
  return {
    lots,
    listings,
    proceeds: owner ? formatEther(await read("proceeds", [owner])) : "0",
  };
}
export { parseEther };
