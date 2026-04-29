import {
  type Chain,
  isSolanaToken,
  type TokenInfo,
  toChain,
  toChainName,
} from "@lendasat/lendaswap-sdk-pure";
import { TokenBTC } from "@web3icons/react";
import { NetworkIcon, TokenIcon } from "@web3icons/react/dynamic";
import NetworkAvalanche from "@web3icons/react/icons/networks/NetworkAvalanche";
import NetworkBase from "@web3icons/react/icons/networks/NetworkBase";
import NetworkBerachain from "@web3icons/react/icons/networks/NetworkBerachain";
import NetworkConflux from "@web3icons/react/icons/networks/NetworkConflux";
import NetworkCorn from "@web3icons/react/icons/networks/NetworkCorn";
import NetworkFlare from "@web3icons/react/icons/networks/NetworkFlare";
import NetworkHederaHashgraph from "@web3icons/react/icons/networks/NetworkHederaHashgraph";
import NetworkHyperEvm from "@web3icons/react/icons/networks/NetworkHyperEvm";
import NetworkInk from "@web3icons/react/icons/networks/NetworkInk";
import NetworkLinea from "@web3icons/react/icons/networks/NetworkLinea";
import NetworkMantle from "@web3icons/react/icons/networks/NetworkMantle";
import NetworkMegaEth from "@web3icons/react/icons/networks/NetworkMegaEth";
import NetworkMonad from "@web3icons/react/icons/networks/NetworkMonad";
import NetworkOptimism from "@web3icons/react/icons/networks/NetworkOptimism";
import NetworkPlasma from "@web3icons/react/icons/networks/NetworkPlasma";
import NetworkRootstock from "@web3icons/react/icons/networks/NetworkRootstock";
import NetworkSeiNetwork from "@web3icons/react/icons/networks/NetworkSeiNetwork";
import NetworkSolana from "@web3icons/react/icons/networks/NetworkSolana";
import NetworkSonic from "@web3icons/react/icons/networks/NetworkSonic";
import NetworkStable from "@web3icons/react/icons/networks/NetworkStable";
import NetworkTempo from "@web3icons/react/icons/networks/NetworkTempo";
import NetworkUnichain from "@web3icons/react/icons/networks/NetworkUnichain";
import NetworkWorld from "@web3icons/react/icons/networks/NetworkWorld";
import NetworkXLayer from "@web3icons/react/icons/networks/NetworkXLayer";
import type { ReactElement } from "react";
import {
  arbitrum,
  mainnet,
  polygon,
  type Chain as ViemChain,
} from "viem/chains";
import { ReactComponent as Arbitrum } from "../../assets/arbitrum.svg";
import { ReactComponent as ArkadeIcon } from "../../assets/arkade.svg";
import { ReactComponent as BitcoinIcon } from "../../assets/bitcoin.svg";
import { ReactComponent as BitcoinLightningIcon } from "../../assets/bitcoin_lightning.svg";
import { ReactComponent as Ethereum } from "../../assets/eth.svg";
import { ReactComponent as Eurc } from "../../assets/eurc.svg";
import { ReactComponent as Polygon } from "../../assets/polygon.svg";
import { ReactComponent as Tbtc } from "../../assets/tbtc.svg";
import { ReactComponent as Usat } from "../../assets/usat.svg";
import { ReactComponent as Usdc } from "../../assets/usdc.svg";
import { ReactComponent as Usdt } from "../../assets/usdt.svg";
import { ReactComponent as Usdt0 } from "../../assets/usdt0.svg";
import { ReactComponent as Wbtc } from "../../assets/wbtc.svg";
import { ReactComponent as Xaut } from "../../assets/xaut.svg";

/**
 * Get the full display name for a token (including network)
 */
export function getTokenDisplayName(tokenId: TokenInfo): string {
  return `${tokenId.symbol} (${tokenId.chain})`;
}

/**
 * Get the icon component for a token
 */
export function getTokenIcon(
  tokenId: TokenInfo,
  width?: number,
  height?: number,
): ReactElement {
  if (tokenId.token_id.toLowerCase() === "btc") {
    return <TokenBTC height={height} width={width} variant={"branded"} />;
  }

  if (tokenId.symbol.toLowerCase() === "wbtc") {
    return <Wbtc width={64} height={64} />;
  }
  if (tokenId.symbol.toLowerCase() === "usdc") {
    return <Usdc width={64} height={64} />;
  }
  if (tokenId.symbol.toLowerCase() === "eurc") {
    return <Eurc width={64} height={64} />;
  }
  if (tokenId.symbol.toLowerCase() === "usdt0") {
    return <Usdt0 width={64} height={64} />;
  }
  if (tokenId.symbol.toLowerCase() === "usdt") {
    return <Usdt width={64} height={64} />;
  }
  if (tokenId.symbol.toLowerCase() === "usat") {
    return <Usat width={64} height={64} />;
  }
  if (tokenId.symbol.toLowerCase() === "xaut") {
    return <Xaut width={64} height={64} />;
  }
  if (tokenId.symbol.toLowerCase() === "tbtc") {
    return <Tbtc width={64} height={64} />;
  }

  return (
    <TokenIcon
      symbol={tokenId.symbol.toLowerCase()}
      size={"4rem"}
      variant={"branded"}
    />
  );
}

/**
 * Get the icon component for a token's network
 */
export function getTokenNetworkIcon(tokenId: TokenInfo): ReactElement {
  if (tokenId.chain === "Lightning") {
    return <BitcoinLightningIcon width={8} height={8} />;
  }
  if (tokenId.chain === "Bitcoin") {
    return <BitcoinIcon width={8} height={8} />;
  }
  if (tokenId.chain === "Arkade") {
    return <ArkadeIcon width={8} height={8} />;
  }
  // Solana isn't in the backend's Chain union — bridge-only chains are
  // cast in via `getCctpBridgeTokens`, so compare against the runtime
  // string via the SDK helper.
  if (isSolanaToken(tokenId.chain as string)) {
    return <NetworkSolana variant="branded" size={16} />;
  }
  if (!tokenId.chain) {
    // Fallback for unknown tokens
    return <span>?</span>;
  }

  const chainIcons: Record<string, ReactElement> = {
    // Directly supported chains
    "1": <Ethereum width={8} height={8} />,
    "137": <Polygon width={8} height={8} />,
    "42161": <Arbitrum width={8} height={8} />,
    // CCTP bridge chains
    "8453": <NetworkBase variant="branded" size={16} />,
    "10": <NetworkOptimism variant="branded" size={16} />,
    "43114": <NetworkAvalanche variant="branded" size={16} />,
    "59144": <NetworkLinea variant="branded" size={16} />,
    "130": <NetworkUnichain variant="branded" size={16} />,
    "146": <NetworkSonic variant="branded" size={16} />,
    "480": <NetworkWorld variant="branded" size={16} />,
    "57073": <NetworkInk variant="branded" size={16} />,
    "1329": <NetworkSeiNetwork variant="branded" size={16} />,
    "999": <NetworkHyperEvm variant="branded" size={16} />,
    "143": <NetworkMonad variant="branded" size={16} />,
    // USDT0 bridge chains
    "80094": <NetworkBerachain variant="branded" size={16} />,
    "1030": <NetworkConflux variant="branded" size={16} />,
    "21000000": <NetworkCorn variant="branded" size={16} />,
    "14": <NetworkFlare variant="branded" size={16} />,
    "295": <NetworkHederaHashgraph variant="branded" size={16} />,
    "5000": <NetworkMantle variant="branded" size={16} />,
    "4326": <NetworkMegaEth variant="branded" size={16} />,
    "9745": <NetworkPlasma variant="branded" size={16} />,
    "30": <NetworkRootstock variant="branded" size={16} />,
    "988": <NetworkStable variant="branded" size={16} />,
    "4217": <NetworkTempo variant="branded" size={16} />,
    "196": <NetworkXLayer variant="branded" size={16} />,
  };

  if (chainIcons[tokenId.chain]) {
    return chainIcons[tokenId.chain];
  }

  return <NetworkIcon chainId={tokenId.chain} />;
}

/**
 * Get viem chain from a chain name string (case-insensitive)
 */
export function getViemChain(chain?: Chain): ViemChain | undefined {
  if (!chain) {
    return undefined;
  }
  switch (chain) {
    case "137":
      return polygon;
    case "42161":
      return arbitrum;
    case "1":
      return mainnet;
    default:
      return undefined;
  }
}

/**
 * Get viem chain by numeric chain ID
 */
export function getViemChainById(chainId: number): ViemChain | undefined {
  switch (chainId) {
    case 137:
      return polygon;
    case 42161:
      return arbitrum;
    case 1:
      return mainnet;
    default:
      return undefined;
  }
}

// Re-export token helpers from SDK
export {
  isArbitrumToken,
  isEthereumToken,
  isEvmToken,
  isPolygonToken,
} from "@lendasat/lendaswap-sdk-pure";

/**
 * Get the display chain name for a swap's target token.
 * When CCTP bridging is active, returns the bridge destination chain name
 * instead of the intermediate source chain where the DEX swap runs.
 */
export function getTargetChainDisplayName(swapData: {
  target_token: { chain: Chain };
  bridge_target_chain?: string | null;
}): string {
  if (swapData.bridge_target_chain) {
    return swapData.bridge_target_chain;
  }
  return toChainName(swapData.target_token.chain);
}

/**
 * Block explorer base URLs by chain key.
 *
 * Unknown EVM chains fall back to {@link EVM_EXPLORER_FALLBACK} (blockscan.com,
 * Etherscan's multi-chain aggregator) so we still produce a valid link
 * without needing to maintain a per-chain entry for every supported chain.
 */
const BLOCK_EXPLORERS: Record<string, string> = {
  // Source chains
  "1": "https://etherscan.io",
  "137": "https://polygonscan.com",
  "42161": "https://arbiscan.io",
  // CCTP bridge chains
  "10": "https://optimistic.etherscan.io",
  "8453": "https://basescan.org",
  "43114": "https://snowtrace.io",
  "59144": "https://lineascan.build",
  "130": "https://uniscan.xyz",
  "146": "https://sonicscan.org",
  "480": "https://worldscan.org",
  "57073": "https://explorer.inkonchain.com",
  "1329": "https://seitrace.com",
  // USDT0 bridge chains
  "80094": "https://berascan.com",
  "1030": "https://evm.confluxscan.io",
  "21000000": "https://cornscan.io",
  "14": "https://flarescan.com",
  "295": "https://hashscan.io/mainnet",
  "5000": "https://mantlescan.xyz",
  "4326": "https://megaexplorer.xyz",
  "2818": "https://explorer.morphl2.io",
  "9745": "https://plasma-explorer.com",
  "30": "https://rootstock.blockscout.com",
  "988": "https://stable-explorer.com",
  "4217": "https://explore.tempo.xyz",
  "196": "https://www.okx.com/web3/explorer/xlayer",
  // Non-EVM
  Bitcoin: "https://mempool.space",
  Arkade: "https://arkade.space",
  Lightning: "https://arkade.space",
  Solana: "https://solscan.io",
};

/** Fallback for unrecognized EVM chains — Etherscan's multi-chain aggregator. */
const EVM_EXPLORER_FALLBACK = "https://blockscan.com";

export function getBlockexplorerTxLink(
  chain: string,
  txid?: string | null,
): string {
  if (!txid) return "";
  const base = BLOCK_EXPLORERS[chain] ?? EVM_EXPLORER_FALLBACK;
  return `${base}/tx/${txid}`;
}

export function getBlockexplorerAddressLink(
  chain: string,
  address?: string | null,
): string {
  if (!address) return "";
  const base = BLOCK_EXPLORERS[chain] ?? EVM_EXPLORER_FALLBACK;
  // Solscan uses `/account/<pubkey>` rather than the EVM-style `/address/`.
  const path = isSolanaToken(chain) ? "account" : "address";
  return `${base}/${path}/${address}`;
}

// ---------------------------------------------------------------------------
// URL token format: "chain:token_id" (e.g., "lightning:btc", "polygon:usdc_pol")
// ---------------------------------------------------------------------------

/** Parsed representation of a URL token string like "lightning:BTC" or "polygon:USDC". */
export interface UrlToken {
  /** Chain in canonical form (e.g., "Lightning", "137"). */
  chain: Chain;
  /** Token symbol (e.g., "BTC", "USDC"). Unique per chain. */
  symbol: string;
}

/**
 * Parse a URL token string like "lightning:BTC" or "polygon:USDC" into a {@link UrlToken}.
 *
 * Returns `undefined` if the string is not a valid URL token.
 */
export function parseUrlToken(raw: string): UrlToken | undefined {
  const idx = raw.indexOf(":");
  if (idx === -1) return undefined;

  const chainStr = raw.substring(0, idx).toLowerCase();
  const symbol = raw.substring(idx + 1);
  const chain = toChain(chainStr);

  if (!symbol) return undefined;

  return { chain, symbol };
}

/**
 * Format a TokenInfo into URL token string format "chain:symbol".
 *
 * Examples: "lightning:BTC", "polygon:USDC", "ethereum:XAUt"
 *
 * Round-trips correctly with {@link parseUrlToken}.
 */
export function formatTokenUrl(token: TokenInfo): string {
  return `${token.chain.toLowerCase()}:${token.symbol}`;
}
