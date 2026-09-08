import {
  PrivyProvider,
  usePrivy,
  useWallets,
  useLoginWithPasskey,
  useLinkWithPasskey,
} from "@privy-io/react-auth";
import { defineChain, createWalletClient, custom } from "viem";
import type { Config } from "../../../packages/shared/src/index";
import App, { type Auth } from "./App";
import { DirectRecovery } from "./DirectRecovery";
function Connected({
  config,
  recovery = false,
}: {
  config: Config;
  recovery?: boolean;
}) {
  const { login, logout, getAccessToken, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const { loginWithPasskey } = useLoginWithPasskey();
  const { linkWithPasskey } = useLinkWithPasskey();
  const provider = async (owner?: string) => {
    const wallet = owner
      ? wallets.find((w) => w.address.toLowerCase() === owner.toLowerCase())
      : wallets[0];
    if (!wallet) throw Error("Connect a wallet first");
    await wallet.switchChain(config.chain.id);
    return wallet.getEthereumProvider();
  };
  const auth: Auth = {
    ready,
    authenticated,
    login,
    logout,
    getToken: getAccessToken,
    passkey: loginWithPasskey,
    linkPasskey: linkWithPasskey,
    signTypedData: async (data, owner) => {
      const p = await provider(owner);
      const permit = data as any;
      if (
        Number(permit.domain?.chainId) !== config.chain.id ||
        !permit.types?.PermitSingle ||
        !permit.values
      )
        throw Error("Unexpected permit format");
      return createWalletClient({ transport: custom(p) }).signTypedData({
        account: owner as `0x${string}`,
        domain: permit.domain,
        types: permit.types,
        primaryType: "PermitSingle",
        message: permit.values,
      });
    },
    wait: async (hash) => {
      const p = await provider();
      for (let i = 0; i < 90; i++) {
        const r = (await p.request({
          method: "eth_getTransactionReceipt",
          params: [hash],
        })) as any;
        if (r) {
          if (r.status !== "0x1") throw Error("Transaction reverted");
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error(
        "Transaction is still pending. Check your wallet before retrying.",
      );
    },
    send: async (tx) => {
      const wallet = wallets.find(
        (w) => w.address.toLowerCase() === tx.from.toLowerCase(),
      );
      if (!wallet) throw Error("Reconnect your return wallet");
      await wallet.switchChain(config.chain.id);
      const provider = await wallet.getEthereumProvider();
      return provider.request({
        method: "eth_sendTransaction",
        params: [tx],
      }) as Promise<string>;
    },
  };
  return recovery ? (
    <DirectRecovery
      config={config}
      auth={auth}
      owner={wallets[0]?.address}
      publicRpcUrl={config.publicRpcUrl || import.meta.env.VITE_RPC_URL}
      onSignIn={login}
    />
  ) : (
    <App config={config} auth={auth} />
  );
}
export default function PrivyApp({
  config,
  recovery = false,
}: {
  config: Config;
  recovery?: boolean;
}) {
  const rpc = config.publicRpcUrl || import.meta.env.VITE_RPC_URL;
  if (!rpc)
    return (
      <main>
        <h1>Network setup required</h1>
        <p>
          Set VITE_RPC_URL to the public RPC for the configured network, then
          rebuild the website.
        </p>
      </main>
    );
  const network = defineChain({
    id: config.chain.id,
    name: config.chain.name,
    nativeCurrency: {
      name: config.chain.symbol,
      symbol: config.chain.symbol,
      decimals: 18,
    },
    rpcUrls: { default: { http: [rpc] } },
  });
  return (
    <PrivyProvider
      appId={config.privyAppId!}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#5867c8",
          walletChainType: "ethereum-only",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        supportedChains: [network],
        defaultChain: network,
      }}
    >
      <Connected config={config} recovery={recovery} />
    </PrivyProvider>
  );
}
