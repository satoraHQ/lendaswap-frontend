import { useEffect, useState } from "react";
import { Link } from "react-router";
import { createPublicClient, erc20Abi, formatUnits } from "viem";
import type { GetSwapResponse } from "../api";
import { buildTransport } from "../utils/evmTransport";
import { getViemChain } from "../utils/tokenUtils";

export function PayExpiredDeposit({
  swap,
  supersededBy,
  onBalance,
}: {
  swap: GetSwapResponse;
  /** The payment that already retried this one from its deposit. */
  supersededBy?: string;
  /** The deposit account's token balance; undefined until known or on error. */
  onBalance: (balance: bigint | undefined) => void;
}) {
  const [balance, setBalance] = useState<bigint>();
  const [error, setError] = useState(false);
  useEffect(() => {
    onBalance(undefined);
    if (swap.direction !== "evm_to_bitcoin") return;
    const chain = getViemChain(swap.source_token.chain);
    if (!chain) {
      setError(true);
      return;
    }
    const client = createPublicClient({
      chain,
      transport: buildTransport(chain),
    });
    let cancelled = false;
    const check = async () => {
      try {
        const value = await client.readContract({
          address: swap.source_token.token_id as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [swap.client_evm_address as `0x${string}`],
        });
        if (!cancelled) {
          setBalance(value);
          onBalance(value);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          onBalance(undefined);
        }
      }
    };
    void check();
    const timer = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [swap, onBalance]);
  return (
    <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm" role="status">
      <p>
        {error
          ? "Could not check the deposit account. Do not fund another payment until your deposit is accounted for."
          : balance === undefined
            ? "Checking deposit account…"
            : balance > 0n
              ? `${formatUnits(balance, swap.source_token.decimals)} ${swap.source_token.symbol} is still in this payment’s deposit account. Do not send another deposit. ${
                  supersededBy
                    ? "A new payment was already started from this deposit."
                    : swap.status !== "expired"
                      ? "The quote is closing, which can take up to an hour. Then you can pay at a new quote from this deposit."
                      : "Pay at a new quote below and this deposit counts towards it."
                }`
              : "No token balance is currently present in the deposit account. If you sent funds, check your transfer before starting another payment."}
      </p>
      {supersededBy && (
        <Link className="font-medium underline" to={`/pay/${supersededBy}`}>
          Continue the new payment
        </Link>
      )}
      {swap.direction === "evm_to_bitcoin" && (
        <p className="break-all font-mono text-xs">{swap.client_evm_address}</p>
      )}
    </div>
  );
}
