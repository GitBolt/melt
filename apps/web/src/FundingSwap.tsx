import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { decodeFunctionData, encodeFunctionData, erc20Abi, toHex } from "viem";
import type { Auth } from "./App";
/** Owner-controlled conversion. This wallet never enters the agent browser. */
export function FundingSwap({
  request,
  auth,
  owner,
  symbol,
  explorer,
  chainId,
  act,
  busy,
}: {
  request: any;
  auth: Auth;
  owner: string;
  symbol: string;
  explorer?: string;
  chainId?: number;
  act: any;
  busy: string;
}) {
  const [token, setToken] = useState(""),
    [amount, setAmount] = useState(""),
    [quote, setQuote] = useState<any>(),
    [hash, setHash] = useState("");
  const sepoliaUsdc =
    chainId === 11155111 ? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" : "";
  const approveAndQuote = () =>
    act("quote", async () => {
      setQuote(undefined);
      const approval = await request("/uniswap/approval", { token, amount });
      for (const tx of [approval.cancel, approval.approval].filter(Boolean)) {
        if (
          tx.to.toLowerCase() !== token.toLowerCase() ||
          BigInt(tx.value || 0) !== 0n
        )
          throw Error("Unexpected approval transaction");
        const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
        if (decoded.functionName !== "approve")
          throw Error("Unexpected approval function");
        // Keep the ERC20 approval amount exact even if the upstream API defaults to unlimited.
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [
            decoded.args[0] as `0x${string}`,
            tx === approval.cancel ? 0n : BigInt(amount),
          ],
        });
        const h = await auth.send({
          from: owner,
          to: token,
          data,
          value: "0x0",
        });
        setHash(h);
        await auth.wait!(h);
      }
      setQuote(
        await request("/uniswap/quote", {
          tokenIn: token,
          tokenOut: "0x0000000000000000000000000000000000000000",
          amount,
          slippageTolerance: 0.5,
        }),
      );
    });
  return (
    <details className="funding-swap">
      <summary>
        <ArrowRightLeft size={13} />
        Swap tokens to fund this task
      </summary>
      <p className="helper">
        Swap a token for {symbol} with Uniswap in this wallet, then add funds to
        the session. The agent browser never sees this wallet. Slippage limit:
        0.5%.
      </p>
      {sepoliaUsdc && (
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            setToken(sepoliaUsdc);
            setQuote(undefined);
          }}
        >
          Use Sepolia USDC
        </button>
      )}
      <label>
        Token address
        <input
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setQuote(undefined);
          }}
          placeholder="0x…"
        />
      </label>
      <label>
        Amount (base units)
        <input
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setQuote(undefined);
          }}
          placeholder="1000000 = 1 USDC"
          inputMode="numeric"
        />
      </label>
      <button
        className="secondary"
        disabled={
          !!busy || !/^0x[\da-fA-F]{40}$/.test(token) || !/^\d+$/.test(amount)
        }
        onClick={approveAndQuote}
      >
        Review approval & get quote
      </button>
      {quote && (
        <div className="swap-quote">
          <p>
            Estimated amount:{" "}
            {(Number(quote.quote.output.amount) / 1e18).toPrecision(6)} {symbol}
          </p>
          <button
            className="primary"
            disabled={!!busy || Date.now() > quote.expiresAt}
            onClick={() =>
              act("swap", async () => {
                const signature = quote.permitData
                  ? await auth.signTypedData!(quote.permitData, owner)
                  : undefined;
                const result = await request("/uniswap/swap", {
                  id: quote.id,
                  signature,
                });
                const tx = result.swap;
                if (tx.from.toLowerCase() !== owner.toLowerCase())
                  throw Error("Unexpected swap sender");
                const h = await auth.send({
                  from: owner,
                  to: tx.to,
                  data: tx.data,
                  value: toHex(BigInt(tx.value || 0)),
                });
                setHash(h);
                setQuote(undefined);
                await auth.wait!(h);
              })
            }
          >
            Review swap in wallet
          </button>
        </div>
      )}
      {hash &&
        (explorer ? (
          <a
            className="identifier"
            href={`${explorer}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            Transaction: {hash.slice(0, 10)}…{hash.slice(-6)}
          </a>
        ) : (
          <p className="identifier">Transaction: {hash}</p>
        ))}
    </details>
  );
}
