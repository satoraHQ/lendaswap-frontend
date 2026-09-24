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
  // Rootstock — the public node, HTTP only (no WebSocket endpoint exists).
  30: ["https://public-node.rsk.co"],
  31: ["https://public-node.testnet.rsk.co"],
};

/** The env vars the RPC overrides are read from. */
export interface RpcOverrideEnv {
  /** `chainId=url` pairs, comma separated: `137=http://localhost:8545,30=http://localhost:8547`. */
  VITE_RPC_OVERRIDES?: string;
  /** The single-chain form, kept for existing env files. */
  VITE_RPC_OVERRIDE_CHAIN_ID?: string;
  VITE_RPC_OVERRIDE_URL?: string;
}

/**
 * Parse the dev/regtest RPC overrides: the single pair plus the list, the
 * list winning for a chain named in both. Whitespace is trimmed and a
 * malformed entry is dropped rather than poisoning the rest.
 */
export function parseRpcOverrides(env: RpcOverrideEnv): Record<number, string> {
  const overrides: Record<number, string> = {};
  const chainId = env.VITE_RPC_OVERRIDE_CHAIN_ID?.trim();
  const url = env.VITE_RPC_OVERRIDE_URL?.trim();
  if (chainId && url && Number.isInteger(Number(chainId))) {
    overrides[Number(chainId)] = url;
  }
  for (const entry of (env.VITE_RPC_OVERRIDES ?? "").split(",")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const id = entry.slice(0, separator).trim();
    const entryUrl = entry.slice(separator + 1).trim();
    if (id && entryUrl && Number.isInteger(Number(id))) {
      overrides[Number(id)] = entryUrl;
    }
  }
  return overrides;
}

/**
 * The dev/regtest RPC overrides by chain id, read once here so wagmi's
 * transports, the AA config and the SDK's own chain readers cannot drift
 * apart on whitespace or on which chains are overridden. A chain without an
 * entry is reached through its public RPCs.
 */
export const RPC_OVERRIDES: Record<number, string> = parseRpcOverrides({
  VITE_RPC_OVERRIDES: import.meta.env.VITE_RPC_OVERRIDES,
  VITE_RPC_OVERRIDE_CHAIN_ID: import.meta.env.VITE_RPC_OVERRIDE_CHAIN_ID,
  VITE_RPC_OVERRIDE_URL: import.meta.env.VITE_RPC_OVERRIDE_URL,
});

// Only the id is needed, so any chain shape (viem Chain, AppKitNetwork) works.
export function buildTransport(chain: { id: number | string }) {
  const override: string | undefined = RPC_OVERRIDES[Number(chain.id)];

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
