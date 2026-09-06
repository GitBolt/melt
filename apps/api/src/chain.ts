import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  decodeEventLog,
  parseEther,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { PrivyClient } from "@privy-io/node";
import { setting, setSetting, serial, event, save } from "./store.js";
import type { Task } from "../../../packages/shared/src/index.js";
export const local = !process.env.RPC_URL;
if (local && process.env.NODE_ENV === "production")
  throw Error(
    "Production requires an explicit RPC_URL and configured authentication",
  );
export const chain = defineChain({
  id: Number(process.env.CHAIN_ID || 31337),
  name: process.env.CHAIN_NAME || "Local Ethereum",
  nativeCurrency: {
    name: "Ether",
    symbol: process.env.NATIVE_SYMBOL || "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [process.env.RPC_URL || "http://127.0.0.1:8545"] },
  },
});
if (
  !local &&
  (!process.env.PRIVY_APP_ID ||
    !process.env.PRIVY_APP_SECRET ||
    !process.env.APP_ORIGIN ||
    !process.env.CHAIN_ID)
)
  throw Error(
    "Configured mode needs PRIVY_APP_ID, PRIVY_APP_SECRET, CHAIN_ID and APP_ORIGIN",
  );
if (!local && chain.id === 31337)
  throw Error("Local public keys are not used with configured RPCs");
export const privy = local
  ? null
  : new PrivyClient({
      appId: process.env.PRIVY_APP_ID!,
      appSecret: process.env.PRIVY_APP_SECRET!,
    });
const account = mnemonicToAccount(
  "test test test test test test test test test test test junk",
);
export const demoOwner = mnemonicToAccount(
  "test test test test test test test test test test test junk",
  { addressIndex: 1 },
);
export const client = createPublicClient({ chain, transport: http() });
const devWallet = createWalletClient({ account, chain, transport: http() });
export let operator: Address;
export let fixture: Address;
let privyId = "";
export let vaultArtifact: { abi: any; evm: { bytecode: { object: string } } };
export let fixtureArtifact: typeof vaultArtifact;
export async function send(
  tx: { to?: Address; data?: Hex; value?: bigint; gas?: bigint },
  task?: Task,
  kind = "Transaction",
): Promise<Hex> {
  return serial("relayer", async () => {
    let hash: Hex;
    if (local) hash = await devWallet.sendTransaction(tx);
    else {
      const res = await privy!
        .wallets()
        .ethereum()
        .sendTransaction(privyId, {
          caip2: `eip155:${chain.id}`,
          params: {
            transaction: {
              ...(tx.to ? { to: tx.to } : {}),
              data: tx.data || "0x",
              ...(tx.gas ? { gas_limit: `0x${tx.gas.toString(16)}` } : {}),
              value: `0x${(tx.value || 0n).toString(16)}`,
              chain_id: chain.id,
            },
          },
        });
      hash = res.hash as Hex;
    }
    if (task) {
      task.transactions.push({ hash, kind, status: "pending" });
      const progress: Record<string, string> = {
        "Create task wallet": "Creating your task wallet",
        "Fund task wallet": "Adding funds to your task wallet",
        "Execute dapp transaction":
          "Transaction sent. Waiting for confirmation.",
        "Close signing": "Closing agent spending access",
        "Return asset": "Returning an asset to your wallet",
        "Return remaining funds": "Returning unused funds",
      };
      event(task, "transaction", progress[kind] || `${kind}: sent`, hash);
    }
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: 60000,
    });
    if (task) {
      const row = task.transactions.find((t) => t.hash === hash)!;
      row.status = receipt.status;
      row.gasWei = (receipt.gasUsed * receipt.effectiveGasPrice).toString();
      save(task);
    }
    if (receipt.status !== "success") throw Error(`${kind} reverted`);
    return hash;
  });
}
export async function initialize() {
  if ((await client.getChainId()) !== chain.id)
    throw Error("RPC chain mismatch");
  const { default: solc } = await import("solc" as string);
  const sources = Object.fromEntries(
    ["TaskVault", "StudioCollectible"].map((name) => [
      `${name}.sol`,
      { content: readFileSync(`contracts/src/${name}.sol`, "utf8") },
    ]),
  );
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
        },
      }),
    ),
  );
  if (compiled.errors?.some((e: any) => e.severity === "error"))
    throw Error(JSON.stringify(compiled.errors));
  vaultArtifact = compiled.contracts["TaskVault.sol"].TaskVault;
  fixtureArtifact =
    compiled.contracts["StudioCollectible.sol"].StudioCollectible;
  if (local) operator = account.address;
  else {
    privyId =
      process.env.PRIVY_RELAYER_WALLET_ID || setting("privyRelayer") || "";
    if (!privyId) {
      const w = await privy!.wallets().create({
        chain_type: "ethereum",
        ...(process.env.PRIVY_POLICY_ID
          ? { policy_ids: [process.env.PRIVY_POLICY_ID] }
          : {}),
      });
      privyId = w.id;
      setSetting("privyRelayer", privyId);
    }
    operator = (await privy!.wallets().get(privyId)).address as Address;
  }
  const prev = process.env.FIXTURE_CONTRACT || setting(`fixture:${chain.id}`);
  if (prev && (await client.getCode({ address: prev as Address })))
    fixture = prev as Address;
  else if (local) {
    const hash = await send({
      data: encodeDeployData({
        abi: fixtureArtifact.abi,
        bytecode: `0x${fixtureArtifact.evm.bytecode.object}`,
      }),
    });
    fixture = (await client.getTransactionReceipt({ hash })).contractAddress!;
    setSetting(`fixture:${chain.id}`, fixture);
  } else fixture = "0x0000000000000000000000000000000000000000";
}
export async function deployTask(task: Task) {
  const data = encodeDeployData({
    abi: vaultArtifact.abi,
    bytecode: `0x${vaultArtifact.evm.bytecode.object}`,
    args: [
      task.recovery,
      operator,
      parseEther(task.budget),
      BigInt(task.expiresAt),
      [task.target],
      [task.selector],
    ],
  });
  const hash = await send({ data }, task, "Create task wallet");
  task.vault = (await client.getTransactionReceipt({ hash })).contractAddress!;
  save(task);
  if (local)
    await send(
      { to: task.vault as Address, value: parseEther(task.budget) },
      task,
      "Fund task wallet",
    );
  await refreshBalance(task);
  task.status = Number(task.balance) > 0 ? "ready" : "funding";
  event(
    task,
    "success",
    "Task wallet created. Funds will return to your wallet.",
  );
}
export async function refreshBalance(task: Task) {
  if (!task.vault) return;
  task.balance = formatEther(
    await client.getBalance({ address: task.vault as Address }),
  );
  task.spent = formatEther(
    (await client.readContract({
      address: task.vault as Address,
      abi: vaultArtifact.abi,
      functionName: "spent",
    })) as bigint,
  );
  save(task);
}
export async function vaultCall(
  task: Task,
  method: string,
  args: unknown[] = [],
  kind = method,
) {
  return send(
    {
      to: task.vault as Address,
      ...(method === "execute" ? { gas: 1000000n } : {}),
      data: encodeFunctionData({
        abi: vaultArtifact.abi,
        functionName: method,
        args,
      }),
    },
    task,
    kind,
  );
}
export async function reconcile(task: Task) {
  for (const tx of task.transactions.filter(
    (t) =>
      t.status === "pending" ||
      (!task.vault &&
        t.kind === "Create task wallet" &&
        t.status === "success"),
  )) {
    let r;
    try {
      r = await client.getTransactionReceipt({ hash: tx.hash as Hex });
    } catch {
      throw Error(
        `Transaction ${tx.hash} is still unresolved. Recovery will wait.`,
      );
    }
    tx.status = r.status;
    tx.gasWei = (r.gasUsed * r.effectiveGasPrice).toString();
    if (tx.kind === "Create task wallet" && r.contractAddress)
      task.vault = r.contractAddress;
    save(task);
  }
}
export async function recover(task: Task) {
  await reconcile(task);
  if (!task.vault)
    throw Error("Task wallet was not created; no vault to recover");
  const closed = await client.readContract({
    address: task.vault as Address,
    abi: vaultArtifact.abi,
    functionName: "closed",
  });
  if (!closed) await vaultCall(task, "close", [], "Close signing");
  event(task, "success", "Agent spending is disabled.");
  let failures = 0;
  for (const asset of task.assets.filter((a) => !a.recovered))
    try {
      if (asset.kind === "erc721") {
        const owner = (await client.readContract({
          address: asset.token as Address,
          abi: fixtureArtifact.abi,
          functionName: "ownerOf",
          args: [BigInt(asset.tokenId!)],
        })) as string;
        if (owner.toLowerCase() === task.recovery.toLowerCase()) {
          asset.recovered = true;
          save(task);
          continue;
        }
      }
      await vaultCall(
        task,
        asset.kind === "erc721" ? "recoverERC721" : "recoverERC20",
        asset.kind === "erc721"
          ? [asset.token, BigInt(asset.tokenId!)]
          : [asset.token],
        "Return asset",
      );
      asset.recovered = true;
      save(task);
    } catch {
      failures++;
      event(
        task,
        "error",
        "An asset could not be returned. You can retry recovery.",
      );
    }
  const remaining = await client.getBalance({ address: task.vault as Address });
  if (remaining > 0n)
    await vaultCall(task, "recoverNative", [], "Return remaining funds");
  // Derive the total from receipts so a restart between mining and persistence cannot lose a refund.
  let totalReturned = 0n;
  for (const tx of task.transactions.filter(
    (t) => t.kind === "Return remaining funds" && t.status === "success",
  )) {
    const receipt = await client.getTransactionReceipt({
      hash: tx.hash as Hex,
    });
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== task.vault.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: vaultArtifact.abi,
          data: log.data,
          topics: log.topics,
        }) as any;
        if (
          decoded.eventName === "Recovered" &&
          decoded.args.asset === "0x0000000000000000000000000000000000000000"
        )
          totalReturned += decoded.args.amountOrId;
      } catch {}
    }
  }
  task.returned = formatEther(totalReturned);
  await refreshBalance(task);
  task.status = failures ? "attention" : "closed";
  task.error = failures ? "Some assets still need to be returned." : undefined;
  event(
    task,
    failures ? "error" : "success",
    failures
      ? "Recovery needs attention"
      : "Session closed. Recovery is complete.",
  );
}
