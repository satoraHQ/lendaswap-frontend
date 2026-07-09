import type { TokenInfo } from "@satora/swap";
import { erc20Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { isEvmToken } from "../utils/tokenUtils";

/**
 * Read ERC-20 balance for an EVM token from the connected wallet.
 * Returns undefined balance for BTC tokens or when wallet is disconnected.
 */
export function useTokenBalance(token: TokenInfo | undefined) {
  const { address } = useAccount();

  const isEvm = token ? isEvmToken(token.chain) : false;
  const tokenAddress = token?.token_id as `0x${string}` | undefined;
  const enabled = isEvm && !!address && !!tokenAddress;

  const { data: balance, isLoading } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: token ? Number(token.chain) : undefined,
    query: { enabled },
  });

  return {
    balance: enabled ? (balance as bigint | undefined) : undefined,
    isLoading: enabled && isLoading,
  };
}
