import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import {
  Arbitrum,
  Avalanche,
  Base,
  Ethereum,
  HyperEVM,
  Ink,
  Linea,
  Monad,
  Optimism,
  Polygon,
  Sei,
  Sonic,
  Unichain,
  WorldChain,
  XDC,
} from "@circle-fin/bridge-kit/chains";
import { useMemo } from "react";
import { useConfig } from "wagmi";
import { getPublicClient, getWalletClient } from "wagmi/actions";

// Mainnet CCTPv2 EVM chains the source-token filter (isCctpUsdc in the SDK)
// can resolve to. Kept in sync with ALL_EVM_CHAIN_IDS ∩ CCTP_DOMAINS.
const SUPPORTED_CHAINS = [
  Ethereum,
  Arbitrum,
  Polygon,
  Optimism,
  Base,
  Avalanche,
  Linea,
  Unichain,
  Sonic,
  WorldChain,
  Ink,
  Sei,
  HyperEVM,
  Monad,
  XDC,
];

/**
 * Builds a bridge-kit `ViemAdapter` backed by the connected wagmi wallet
 * (Reown AppKit). The adapter is chain-agnostic - bridge-kit calls its
 * `getPublicClient` / `getWalletClient` callbacks per chain as it walks the
 * approve → burn → attestation → mint flow, and wagmi transparently switches
 * the wallet's active chain when the wallet client is requested for a chain
 * other than the currently connected one.
 */
export function useBridgeKitAdapter(): ViemAdapter {
  const config = useConfig();

  return useMemo(
    () =>
      new ViemAdapter(
        {
          getPublicClient: ({ chain }) => {
            const client = getPublicClient(config, { chainId: chain.id });
            if (!client) {
              throw new Error(
                `No public client configured for chain ${chain.id}`,
              );
            }
            return client;
          },
          getWalletClient: ({ chain }) =>
            getWalletClient(config, { chainId: chain.id }),
        },
        {
          addressContext: "user-controlled",
          supportedChains: SUPPORTED_CHAINS,
        },
      ),
    [config],
  );
}
