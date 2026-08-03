/**
 * Builds a viem transport with fallback RPCs for each supported chain.
 *
 * If VITE_RPC_OVERRIDE_URL is set for the chain, it's used as the primary.
 * Otherwise, falls back through a list of public RPCs.
 */
import { fallback, http } from "viem";

// NOTE: no rpc.ankr.com entries — ankr's anonymous endpoints now answer HTTP
// 200 with a JSON-RPC "Unauthorized" error, which poisons a fallback list (the
// transport looks healthy while every real call fails). Mirrors the SDK's
// DEFAULT_EVM_RPCS.
const FALLBACK_RPCS: Record<number, string[]> = {
  // Polygon - viem's default (polygon.drpc.org) doesn't support eth_call,
  // so we list working public RPCs explicitly.
  137: [
    "https://polygon.drpc.org",
    "https://tenderly.rpc.polygon.community",
    "https://polygon-bor-rpc.publicnode.com",
  ],
  // Ethereum — no publicnode: it rate-limits by IP across its whole fleet
  // (403s), and as a primary that costs a retry cycle per read.
  1: ["https://eth.drpc.org", "https://rpc.mevblocker.io"],
  // Arbitrum — the official gateway first; publicnode last (see above).
  42161: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.drpc.org",
    "https://arbitrum-one-rpc.publicnode.com",
  ],
};

// Only the id is needed, so any chain shape (viem Chain, AppKitNetwork) works.
export function buildTransport(chain: { id: number | string }) {
  const override =
    import.meta.env.VITE_RPC_OVERRIDE_CHAIN_ID === String(chain.id)
      ? import.meta.env.VITE_RPC_OVERRIDE_URL
      : undefined;

  const urls = override
    ? [override, ...(FALLBACK_RPCS[Number(chain.id)] ?? [])]
    : (FALLBACK_RPCS[Number(chain.id)] ?? []);

  if (urls.length === 0) {
    return http();
  }

  if (urls.length === 1) {
    return http(urls[0]);
  }

  // In-order fallback, deliberately NOT ranked: ranking health-pings every
  // listed endpoint on an interval from every open tab — exactly the
  // background burst that got public RPCs rate-limiting us (publicnode 403s).
  return fallback(urls.map((url) => http(url)));
}
