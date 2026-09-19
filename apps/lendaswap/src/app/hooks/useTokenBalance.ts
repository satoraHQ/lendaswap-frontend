import { isNativeLockTarget, type TokenInfo } from "@satora/swap";
import { erc20Abi } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { isEvmToken } from "../utils/tokenUtils";

/**
 * Read the connected wallet's balance of an EVM token: `balanceOf` for an
 * ERC-20, the account balance for a chain's own coin (RBTC on Rootstock,
 * addressed by the zero token address). Returns undefined for BTC tokens or
 * when the wallet is disconnected.
 */
export function useTokenBalance(token: TokenInfo | undefined) {
  const { address } = useAccount();

  const isEvm = token ? isEvmToken(token.chain) : false;
  const isNative =
    !!token && isNativeLockTarget(token.chain, String(token.token_id));
  const tokenAddress = token?.token_id as `0x${string}` | undefined;
  const chainId = token ? Number(token.chain) : undefined;
  const erc20Enabled = isEvm && !isNative && !!address && !!tokenAddress;
  const nativeEnabled = isEvm && isNative && !!address;

  const { data: erc20Balance, isLoading: erc20Loading } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: erc20Enabled },
  });

  const { data: nativeBalance, isLoading: nativeLoading } = useBalance({
    address,
    chainId,
    query: { enabled: nativeEnabled },
  });

  return {
    balance: erc20Enabled
      ? (erc20Balance as bigint | undefined)
      : nativeEnabled
        ? nativeBalance?.value
        : undefined,
    isLoading:
      (erc20Enabled && erc20Loading) || (nativeEnabled && nativeLoading),
  };
}
