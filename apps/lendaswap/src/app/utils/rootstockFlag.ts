import type { TokenInfos } from "@satora/swap";

/** Rootstock as the API names it: mainnet ("30") and testnet ("31"). */
const ROOTSTOCK_CHAINS = new Set(["30", "31"]);

/**
 * Whether this build offers RBTC swaps. The app ships them one deploy at a
 * time: `just release beta` sets VITE_ENABLE_ROOTSTOCK, the production app
 * does not, and the mutinynet deploy and local dev always do. Both apps share
 * one API, so the server's token list alone cannot tell them apart.
 */
export const rootstockEnabled =
  import.meta.env.VITE_ENABLE_ROOTSTOCK === "true" ||
  import.meta.env.VITE_APP_ENV === "mutinynet" ||
  import.meta.env.DEV;

/**
 * The server's token list without its Rootstock tokens when this build does
 * not offer them. Bridge destinations (USDT0 on Rootstock) are added to the
 * list separately and are not affected.
 */
export function withRootstockGate(
  tokens: TokenInfos,
  enabled: boolean = rootstockEnabled,
): TokenInfos {
  if (enabled) return tokens;
  return {
    ...tokens,
    evm_tokens: tokens.evm_tokens.filter(
      (token) => !ROOTSTOCK_CHAINS.has(String(token.chain)),
    ),
  };
}
