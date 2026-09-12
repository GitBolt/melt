import { MeltLoader, MeltWordmark } from "./components/MeltMotion";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  LockKeyhole,
  RotateCcw,
  Wallet,
} from "lucide-react";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  isAddress,
  parseAbi,
  toHex,
  type Address,
  type EIP1193Provider,
  type Hash,
} from "viem";
import type { Config } from "../../../packages/shared/src/index";
import type { Auth } from "./App";
import { SessionSeal } from "./SessionSeal";
import { isTxHash, TxToastStack, type ChainToast } from "./components/TxToasts";
import "./recovery.css";

const abi = parseAbi([
  "function owner() view returns (address)",
  "function agent() view returns (address)",
  "function closed() view returns (bool)",
  "function expiresAt() view returns (uint256)",
  "function budget() view returns (uint256)",
  "function spent() view returns (uint256)",
  "function close()",
  "function recoverNative()",
  "function recoverERC20(address token)",
  "function recoverERC721(address token, uint256 tokenId)",
]);
type Snapshot = {
  address: Address;
  owner: Address;
  agent: Address;
  closed: boolean;
  expiresAt: bigint;
  budget: bigint;
  spent: bigint;
  balance: bigint;
  block: bigint;
  timestamp: bigint;
};
type RecoveryTx = {
  hash: Hash;
  vault: Address;
  action: string;
  status: "pending" | "confirmed" | "reverted";
};
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const message = (error: unknown) =>
  error instanceof Error
    ? (error as Error & { shortMessage?: string }).shortMessage || error.message
    : "Something went wrong. Please try again.";

/** Owner recovery uses only a public RPC and a user-controlled wallet, never Melt's API. */
export function DirectRecovery({
  config,
  auth,
  owner,
  publicRpcUrl = import.meta.env.VITE_RPC_URL,
  onSignIn,
}: {
  config: Config;
  auth?: Auth;
  owner?: string;
  publicRpcUrl?: string;
  onSignIn?: () => void;
}) {
  const [address, setAddress] = useState(
    () => new URLSearchParams(window.location.search).get("vault") || "",
  );
  const [vault, setVault] = useState<Snapshot>();
  const [injected, setInjected] = useState<EIP1193Provider>();
  const [externalOwner, setExternalOwner] = useState<string>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [txToasts, setTxToasts] = useState<ChainToast[]>([]);
  const [token, setToken] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [assetType, setAssetType] = useState<"erc20" | "erc721">("erc721");
  const storageKey = `melt-owner-recovery:${config.chain.id}`;
  const [transactions, setTransactions] = useState<RecoveryTx[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
      return Array.isArray(saved)
        ? saved.filter(
            (tx) =>
              /^0x[\da-f]{64}$/i.test(tx.hash) &&
              isAddress(tx.vault) &&
              typeof tx.action === "string" &&
              ["pending", "confirmed", "reverted"].includes(tx.status),
          )
        : [];
    } catch {
      return [];
    }
  });
  const client = useMemo(
    () =>
      publicRpcUrl
        ? createPublicClient({
            transport: http(publicRpcUrl, { timeout: 15_000 }),
          })
        : undefined,
    [publicRpcUrl],
  );
  const walletOwner = injected
    ? externalOwner
    : auth?.authenticated
      ? owner
      : undefined;
  const ownsVault =
    !!vault && walletOwner?.toLowerCase() === vault.owner.toLowerCase();
  const pending = transactions.some((tx) => tx.status === "pending");
  const visibleTransactions = vault
    ? transactions.filter(
        (tx) => tx.vault.toLowerCase() === vault.address.toLowerCase(),
      )
    : transactions;
  const explorer = config.chain.explorer?.replace(/\/$/, "");

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(transactions));
    } catch {
      // Wallet and explorer records remain the source of truth if browser storage is unavailable.
    }
  }, [storageKey, transactions]);

  useEffect(() => {
    if (!injected) return;
    const accountsChanged = (accounts: string[]) =>
      setExternalOwner(accounts[0]);
    injected.on("accountsChanged", accountsChanged);
    return () => injected.removeListener("accountsChanged", accountsChanged);
  }, [injected]);

  async function readVault(target: Address): Promise<Snapshot> {
    if (!client)
      throw Error("A public RPC URL is needed to read this network.");
    if ((await client.getChainId()) !== config.chain.id)
      throw Error(`The RPC must connect to ${config.chain.name}.`);
    const block = await client.getBlock();
    const base = { address: target, abi, blockNumber: block.number };
    const [code, owner, agent, closed, expiresAt, budget, spent, balance] =
      await Promise.all([
        client.getCode({ address: target, blockNumber: block.number }),
        client.readContract({ ...base, functionName: "owner" }),
        client.readContract({ ...base, functionName: "agent" }),
        client.readContract({ ...base, functionName: "closed" }),
        client.readContract({ ...base, functionName: "expiresAt" }),
        client.readContract({ ...base, functionName: "budget" }),
        client.readContract({ ...base, functionName: "spent" }),
        client.getBalance({ address: target, blockNumber: block.number }),
      ]);
    if (!code || code === "0x" || budget === 0n || spent > budget)
      throw Error("This address does not expose a valid task wallet.");
    return {
      address: target,
      owner,
      agent,
      closed,
      expiresAt,
      budget,
      spent,
      balance,
      block: block.number,
      timestamp: block.timestamp,
    };
  }

  async function load() {
    setError("");
    setNotice("");
    if (!isAddress(address.trim())) {
      setError("Enter a complete task wallet address.");
      return;
    }
    setBusy("load");
    setVault(undefined);
    try {
      const result = await readVault(getAddress(address.trim()));
      setVault(result);
      const url = new URL(window.location.href);
      url.searchParams.set("vault", result.address);
      window.history.replaceState(null, "", url);
    } catch (e) {
      setError(
        `Could not read this task wallet on ${config.chain.name}. ${message(e)}`,
      );
    } finally {
      setBusy("");
    }
  }

  async function connectExternal() {
    setError("");
    setBusy("connect");
    try {
      const provider = (window as Window & { ethereum?: EIP1193Provider })
        .ethereum;
      if (!provider)
        throw Error("Open this page in a browser with a wallet installed.");
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });
      if (!accounts[0]) throw Error("No wallet account was connected.");
      setInjected(provider);
      setExternalOwner(accounts[0]);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  async function confirm(hash: Hash) {
    if (!client) return;
    if ((await client.getChainId()) !== config.chain.id)
      throw Error(`The RPC must connect to ${config.chain.name}.`);
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: 120_000,
    });
    const status = receipt.status === "success" ? "confirmed" : "reverted";
    setTransactions((items) =>
      items.map((tx) => (tx.hash === hash ? { ...tx, status } : tx)),
    );
    if (status === "reverted")
      throw Error("The transaction reverted. No recovery was confirmed.");
    if (vault) setVault(await readVault(vault.address));
    setNotice("Transaction confirmed onchain.");
  }

  async function submit(kind: "close" | "native" | "asset") {
    if (!vault || !client || !ownsVault || !walletOwner || busy || pending)
      return;
    setBusy(kind);
    setError("");
    setNotice(
      "Confirm the transaction in your wallet. Gas is paid separately.",
    );
    let hash: Hash | undefined;
    try {
      const current = await readVault(vault.address);
      if (current.owner.toLowerCase() !== walletOwner.toLowerCase())
        throw Error("Connect this task wallet's return wallet to continue.");
      if (kind !== "close" && !current.closed)
        throw Error("Close agent access before returning assets.");
      if (kind === "close" && current.closed)
        throw Error(
          "Agent access is already closed. Refresh the wallet details.",
        );
      if (kind === "asset" && !isAddress(token.trim()))
        throw Error("Enter the token's contract address.");
      if (kind === "asset" && assetType === "erc721" && !/^\d+$/.test(tokenId))
        throw Error("Enter a whole-number collectible ID.");
      const data =
        kind === "close"
          ? encodeFunctionData({ abi, functionName: "close" })
          : kind === "native"
            ? encodeFunctionData({ abi, functionName: "recoverNative" })
            : assetType === "erc20"
              ? encodeFunctionData({
                  abi,
                  functionName: "recoverERC20",
                  args: [getAddress(token.trim())],
                })
              : encodeFunctionData({
                  abi,
                  functionName: "recoverERC721",
                  args: [getAddress(token.trim()), BigInt(tokenId)],
                });
      const tx = {
        from: walletOwner as Address,
        to: vault.address,
        data,
        value: "0x0" as const,
      };
      // Simulate the exact zero-value owner call; a reverted token never appears as recovered.
      await client.call({ account: tx.from, to: tx.to, data, value: 0n });
      if (injected) {
        const accounts = await injected.request({ method: "eth_accounts" });
        if (accounts[0]?.toLowerCase() !== walletOwner.toLowerCase())
          throw Error(
            "Your wallet account changed. Reconnect the return wallet.",
          );
        await injected.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: toHex(config.chain.id) }],
        });
        const chainId = await injected.request({ method: "eth_chainId" });
        if (Number(chainId) !== config.chain.id)
          throw Error(`Switch your wallet to ${config.chain.name}.`);
        hash = await injected.request({
          method: "eth_sendTransaction",
          params: [tx],
        });
      } else {
        if (!auth?.authenticated)
          throw Error("Sign in with the return wallet first.");
        const result = await auth.send(tx);
        hash = result as Hash;
      }
      if (!hash || !isTxHash(hash))
        throw Error(
          "The wallet did not return a transaction hash. Check its activity before retrying.",
        );
      const confirmed = hash;
      const toastId = crypto.randomUUID();
      setTxToasts((items) => [
        ...items.slice(-4),
        { id: toastId, hash: confirmed, label: "Sent onchain" },
      ]);
      window.setTimeout(
        () =>
          setTxToasts((items) => items.filter((item) => item.id !== toastId)),
        12000,
      );
      const action =
        kind === "close"
          ? "Close agent access"
          : kind === "native"
            ? `Return ${config.chain.symbol}`
            : assetType === "erc721"
              ? `Return collectible #${tokenId}`
              : "Return token balance";
      setTransactions((items) => [
        { hash: hash!, vault: vault.address, action, status: "pending" },
        ...items,
      ]);
      setNotice("Transaction sent. Waiting for onchain confirmation…");
      await confirm(hash);
    } catch (e) {
      setNotice("");
      setError(
        hash
          ? `${message(e)} Check the transaction below before sending another.`
          : message(e),
      );
    } finally {
      setBusy("");
    }
  }

  function download() {
    if (!vault) return;
    const data = {
      product: "Melt owner recovery",
      chainId: config.chain.id,
      network: config.chain.name,
      vault: vault.address,
      owner: vault.owner,
      agent: vault.agent,
      inspectedAtBlock: vault.block.toString(),
      closed: vault.closed,
      expiresAt: vault.expiresAt.toString(),
      instructions: [
        "Connect the immutable owner wallet on this network. Keep enough native currency for gas.",
        "Call close() first if the wallet is not already closed.",
        "Call recoverNative(), recoverERC20(token), or recoverERC721(token, tokenId) on the task wallet.",
        "Recovery always goes to the immutable owner. Repeat recovery for later deposits.",
        "Use your task receipt or explorer to find token addresses and collectible IDs. Unsupported or malicious tokens can fail to transfer.",
      ],
      abi,
      transactions: visibleTransactions,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `melt-recovery-${vault.address}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell recovery-shell">
      <TxToastStack
        items={txToasts}
        explorer={config.chain.explorer}
        onDismiss={(id) =>
          setTxToasts((items) => items.filter((item) => item.id !== id))
        }
      />
      <header>
        <a className="wordmark" href="/" aria-label="Melt home">
          <MeltWordmark />
        </a>
        <a className="recovery-back" href="/">
          <ArrowLeft size={14} /> Back to Melt
        </a>
      </header>
      <main>
        <section className="intro recovery-intro">
          <span className="recovery-network">{config.chain.name}</span>
          <h1>Recover your task wallet.</h1>
          <p>
            Close agent access and return your assets directly from the
            contract.
          </p>
        </section>
        <div className="recovery-grid">
          <section className="panel recovery-controls">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <label htmlFor="recovery-vault">Task wallet address</label>
              <div className="recovery-lookup">
                <input
                  id="recovery-vault"
                  placeholder="0x…"
                  value={address}
                  disabled={!!busy || pending}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setVault(undefined);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="secondary"
                  disabled={!!busy || pending || !client}
                >
                  {busy === "load" ? (
                    <MeltLoader size={14} />
                  ) : (
                    <ArrowUpRight size={14} />
                  )}{" "}
                  Open wallet
                </button>
              </div>
            </form>
            {!client && (
              <p className="recovery-error" role="alert">
                The public RPC is not configured for this network.
              </p>
            )}
            <p className="helper">
              Find this address in your session receipt. Melt's server is not
              needed.
            </p>
            <div className="recovery-connection">
              <Wallet size={17} />
              <div>
                <strong>
                  {walletOwner
                    ? `Connected: ${short(walletOwner)}`
                    : "Connect your return wallet"}
                </strong>
                <p>
                  {walletOwner
                    ? "Every transaction needs your wallet confirmation."
                    : "Use the wallet that owns the session's returned funds."}
                </p>
              </div>
            </div>
            <div className="recovery-connect-actions">
              {auth && !auth.authenticated && (
                <button
                  className="primary"
                  disabled={!auth.ready || !!busy}
                  onClick={onSignIn || auth.login}
                >
                  Continue with email or wallet
                </button>
              )}
              {auth?.authenticated && owner && injected && (
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => {
                    setInjected(undefined);
                    setExternalOwner(undefined);
                  }}
                >
                  Use signed-in wallet
                </button>
              )}
              <button
                className={
                  walletOwner ? "secondary" : auth ? "secondary" : "primary"
                }
                disabled={!!busy}
                onClick={() => void connectExternal()}
              >
                {walletOwner
                  ? "Switch browser wallet"
                  : "Connect browser wallet"}
              </button>
            </div>
            {vault && walletOwner && !ownsVault && (
              <p className="recovery-error" role="alert">
                This wallet is not the owner. Connect {short(vault.owner)} to
                recover these assets.
              </p>
            )}
            {vault && (
              <div className="recovery-steps">
                <div className="recovery-step">
                  <span
                    className={`recovery-step-number ${vault.closed ? "is-complete" : ""}`}
                  >
                    {vault.closed ? <Check size={14} /> : "1"}
                  </span>
                  <div>
                    <h2>
                      {vault.closed
                        ? "Agent access is closed"
                        : "Close agent access"}
                    </h2>
                    <p>
                      {vault.closed
                        ? "New spending is disabled. Recovery stays available."
                        : "End this wallet's spending permission before recovering assets."}
                    </p>
                    {!vault.closed && (
                      <button
                        className="primary"
                        disabled={!ownsVault || !!busy || pending}
                        onClick={() => void submit("close")}
                      >
                        {busy === "close" && <MeltLoader size={14} />}
                        Close agent access
                      </button>
                    )}
                  </div>
                </div>
                <div className="recovery-step">
                  <span className="recovery-step-number">2</span>
                  <div>
                    <h2>Return your assets</h2>
                    <p>
                      Funds go to the return wallet shown here. Gas is paid
                      separately.
                    </p>
                    <button
                      className="primary"
                      disabled={
                        !ownsVault ||
                        !vault.closed ||
                        vault.balance === 0n ||
                        !!busy ||
                        pending
                      }
                      onClick={() => void submit("native")}
                    >
                      {busy === "native" && <MeltLoader size={14} />}
                      Return {formatEther(vault.balance)} {config.chain.symbol}
                    </button>
                    <details className="recovery-token">
                      <summary>Recover a token or collectible</summary>
                      <label htmlFor="recovery-kind">Asset type</label>
                      <select
                        id="recovery-kind"
                        value={assetType}
                        disabled={!!busy}
                        onChange={(e) =>
                          setAssetType(e.target.value as "erc20" | "erc721")
                        }
                      >
                        <option value="erc721">Collectible (ERC-721)</option>
                        <option value="erc20">Token (ERC-20)</option>
                      </select>
                      <label htmlFor="recovery-token">
                        Token contract address
                        <input
                          id="recovery-token"
                          value={token}
                          disabled={!!busy}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder="0x…"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      {assetType === "erc721" && (
                        <label htmlFor="recovery-token-id">
                          Collectible ID
                          <input
                            id="recovery-token-id"
                            value={tokenId}
                            disabled={!!busy}
                            onChange={(e) => setTokenId(e.target.value)}
                            placeholder="0"
                            inputMode="numeric"
                          />
                        </label>
                      )}
                      <button
                        className="secondary"
                        disabled={
                          !ownsVault ||
                          !vault.closed ||
                          !!busy ||
                          pending ||
                          !isAddress(token) ||
                          (assetType === "erc721" && !/^\d+$/.test(tokenId))
                        }
                        onClick={() => void submit("asset")}
                      >
                        {busy === "asset" && <MeltLoader size={14} />}
                        Return{" "}
                        {assetType === "erc721"
                          ? "collectible"
                          : "token balance"}
                      </button>
                    </details>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <p className="recovery-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="recovery-notice" role="status">
                {notice}
              </p>
            )}
            {visibleTransactions.length > 0 && (
              <section
                className="recovery-transactions"
                aria-label="Recovery transactions"
              >
                <h2>Your transactions</h2>
                {visibleTransactions.map((tx) => (
                  <div className="recovery-transaction" key={tx.hash}>
                    <div>
                      <strong>{tx.action}</strong>
                      <span>
                        {tx.status === "pending"
                          ? "Awaiting confirmation"
                          : tx.status === "confirmed"
                            ? "Confirmed"
                            : "Reverted"}
                      </span>
                    </div>
                    {explorer ? (
                      <a
                        href={`${explorer}/tx/${tx.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {short(tx.hash)} <ArrowUpRight size={12} />
                      </a>
                    ) : (
                      <code>{tx.hash}</code>
                    )}
                    {tx.status === "pending" && (
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={async () => {
                          setBusy("confirm");
                          setError("");
                          try {
                            await confirm(tx.hash);
                          } catch (e) {
                            setError(message(e));
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        Check confirmation
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}
          </section>
          <aside className="panel recovery-wallet">
            <SessionSeal status={vault?.closed ? "closed" : "ready"} />
            {vault ? (
              <>
                <div className="balance-heading">
                  <span>Available to return</span>
                  <h2>
                    {formatEther(vault.balance)}
                    <small>{config.chain.symbol}</small>
                  </h2>
                </div>
                <dl className="wallet-facts">
                  <div>
                    <dt>Return wallet</dt>
                    <dd title={vault.owner}>{short(vault.owner)}</dd>
                  </div>
                  <div>
                    <dt>Spending limit</dt>
                    <dd>
                      {formatEther(vault.budget)} {config.chain.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Spent</dt>
                    <dd>
                      {formatEther(vault.spent)} {config.chain.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Agent access</dt>
                    <dd>
                      {vault.closed
                        ? "Closed"
                        : vault.timestamp >= vault.expiresAt
                          ? "Expired"
                          : "Open"}
                    </dd>
                  </div>
                  <div>
                    <dt>Expiry</dt>
                    <dd>
                      {new Date(
                        Number(vault.expiresAt) * 1000,
                      ).toLocaleString()}
                    </dd>
                  </div>
                </dl>
                <div className="recovery-owner">
                  <span>Assets return only to</span>
                  <code>{vault.owner}</code>
                </div>
                <button
                  className="secondary wide"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy("refresh");
                    setError("");
                    try {
                      setVault(await readVault(vault.address));
                    } catch (e) {
                      setError(message(e));
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  <RotateCcw size={13} />
                  Refresh balance
                </button>
                <button className="quiet-button wide" onClick={download}>
                  <Download size={13} />
                  Save recovery instructions
                </button>
                {explorer && (
                  <a
                    className="recovery-explorer"
                    href={`${explorer}/address/${vault.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View contract <ArrowUpRight size={12} />
                  </a>
                )}
                <p className="recovery-fine">
                  Read at block {vault.block.toString()}. Contract details are
                  read onchain; this is not a source-code verification.
                </p>
              </>
            ) : (
              <div className="recovery-empty">
                <h2>Recovery stays with you.</h2>
                <p>
                  Open a task wallet to see its owner, remaining balance and
                  recovery options.
                </p>
                <span>
                  <LockKeyhole size={13} /> Direct wallet-to-contract access
                </span>
              </div>
            )}
          </aside>
        </div>
      </main>
      <footer>
        <span>Melt · Owner recovery</span>
        <span>New deposits can be recovered after a session closes.</span>
      </footer>
    </div>
  );
}
