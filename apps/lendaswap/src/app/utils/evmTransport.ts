/**
 * Builds a viem transport with fallback RPCs for each supported chain.
 *
 * If VITE_RPC_OVERRIDE_URL is set for the chain, it's used as the primary.
 * Otherwise, falls back through a list of public RPCs.
 */
import { type Chain, fallback, http } from "viem";

const FALLBACK_RPCS: Record<number, string[]> = {
  // Polygon - viem's default (polygon.drpc.org) doesn't support eth_call,
  // so we list working public RPCs explicitly.
  137: [
    "https://tenderly.rpc.polygon.community",
    "https://polygon-mainnet.gateway.tatum.io",
    "https://polygon.drpc.org",
    "https://polygon-bor-rpc.publicnode.com",
  ],
  // Ethereum
  1: [
    "https://ethereum-rpc.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://eth.drpc.org",
  ],
  // Arbitrum
  42161: [
    "https://arbitrum-one-rpc.publicnode.com",
    "https://rpc.ankr.com/arbitrum",
    "https://arb1.arbitrum.io/rpc",
  ],
};

export function buildTransport(chain: Chain) {
  const override =
    import.meta.env.VITE_RPC_OVERRIDE_CHAIN_ID === String(chain.id)
      ? import.meta.env.VITE_RPC_OVERRIDE_URL
      : undefined;

  const urls = override
    ? [override, ...(FALLBACK_RPCS[chain.id] ?? [])]
    : (FALLBACK_RPCS[chain.id] ?? []);

  if (urls.length === 0) {
    return http();
  }

  if (urls.length === 1) {
    return http(urls[0]);
  }

  return fallback(urls.map((url) => http(url)));
}
