import { isNativeLockTarget, type TokenInfo } from "@satora/swap";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { erc20Abi } from "viem";
import { useAccount, useConfig, useReadContracts } from "wagmi";
import { getBalance } from "wagmi/actions";
import { isEvmToken } from "../utils/tokenUtils";

export const tokenBalanceKey = (t: TokenInfo) => `${t.chain}:${t.token_id}`;

/**
 * Read the connected wallet's balance of many EVM tokens at once. ERC-20s go
 * through `useReadContracts` (wagmi multicalls them per chain); a chain's own
 * coin (RBTC, the zero token address) through `getBalance`. Non-EVM tokens are
 * skipped. Returns a map keyed by {@link tokenBalanceKey}; empty while the
 * wallet is disconnected or `enabled` is false.
 */
export function useTokenBalances(tokens: TokenInfo[], enabled = true) {
  const { address } = useAccount();
  const config = useConfig();
  const active = enabled && !!address;

  const { erc20s, natives } = useMemo(() => {
    const evm = tokens.filter((t) => isEvmToken(t.chain));
    return {
      erc20s: evm.filter(
        (t) => !isNativeLockTarget(t.chain, String(t.token_id)),
      ),
      natives: evm.filter((t) =>
        isNativeLockTarget(t.chain, String(t.token_id)),
      ),
    };
  }, [tokens]);

  const { data: erc20Results } = useReadContracts({
    contracts: erc20s.map((t) => ({
      address: t.token_id as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
      chainId: Number(t.chain),
    })),
    allowFailure: true,
    query: { enabled: active && erc20s.length > 0 },
  });

  const nativeResults = useQueries({
    queries: natives.map((t) => ({
      queryKey: ["nativeBalance", t.chain, address],
      queryFn: () => {
        if (!address) throw new Error("wallet not connected");
        return getBalance(config, {
          address,
          chainId: Number(t.chain) as never,
        });
      },
      enabled: active,
    })),
  });

  return useMemo(() => {
    const balances = new Map<string, bigint>();
    if (!active) return balances;
    erc20s.forEach((t, i) => {
      const r = erc20Results?.[i];
      if (r?.status === "success")
        balances.set(tokenBalanceKey(t), r.result as bigint);
    });
    natives.forEach((t, i) => {
      const v = nativeResults[i]?.data?.value;
      if (v !== undefined) balances.set(tokenBalanceKey(t), v);
    });
    return balances;
  }, [active, erc20s, natives, erc20Results, nativeResults]);
}
