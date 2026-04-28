/**
 * Thin compat wrapper around the SDK's `createSwapSmartAccountClient`.
 *
 * Exists only because the current wizard still derives the Kernel
 * owner from an SDK-provided private key. Wraps the key in a viem
 * `WalletClient`, then delegates to `buildEvmSigner` so the full
 * `EvmSigner` shape (including `signMessage` for CCTP) comes from
 * one place. Deletable once the wizard passes the user's
 * wallet-derived `EvmSigner` directly.
 */

import { createSwapSmartAccountClient as sdkCreateSwapSmartAccountClient } from "@lendasat/lendaswap-sdk-pure";
import { useMemo } from "react";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { buildEvmSigner } from "../utils/evmSigner";

export interface SmartAccountConfig {
  /** SDK-derived EVM private key (hex, 0x-prefixed). Owner of the Kernel account. */
  ownerPrivateKey: `0x${string}`;
  /** Bundler JSON-RPC endpoint. Defaults to `VITE_AA_BUNDLER_URL`. */
  bundlerUrl?: string;
  /** Alchemy Gas Manager policy ID (UUID). Defaults to `VITE_AA_POLICY_ID`. */
  policyId?: string;
}

/** Wraps the SDK factory with the env-var fallback used in the browser. */
export async function createSwapSmartAccountClient(
  config: SmartAccountConfig,
): Promise<Awaited<ReturnType<typeof sdkCreateSwapSmartAccountClient>>> {
  const bundlerUrl =
    config.bundlerUrl ??
    (import.meta.env.VITE_AA_BUNDLER_URL as string | undefined);
  const paymasterPolicyId =
    config.policyId ??
    (import.meta.env.VITE_AA_POLICY_ID as string | undefined);

  if (!bundlerUrl) {
    throw new Error(
      "Missing VITE_AA_BUNDLER_URL - set it in the frontend env or pass bundlerUrl.",
    );
  }
  if (!paymasterPolicyId) {
    throw new Error(
      "Missing VITE_AA_POLICY_ID - set your Alchemy Gas Manager policy ID in the frontend env or pass policyId.",
    );
  }

  const account = privateKeyToAccount(config.ownerPrivateKey);
  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(),
  });
  const signer = buildEvmSigner(walletClient, arbitrum);

  return sdkCreateSwapSmartAccountClient({
    signer,
    aa: { bundlerUrl, paymasterPolicyId },
  });
}

/** React hook variant - only re-initialises when the owner key changes. */
export function useSmartAccountFactory(
  ownerPrivateKey?: `0x${string}`,
): (() => ReturnType<typeof createSwapSmartAccountClient>) | null {
  return useMemo(() => {
    if (!ownerPrivateKey) return null;
    return () => createSwapSmartAccountClient({ ownerPrivateKey });
  }, [ownerPrivateKey]);
}
