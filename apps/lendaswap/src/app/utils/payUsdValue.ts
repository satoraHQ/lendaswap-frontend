import type { GetSwapResponse } from "../api";

/** Older records can still show an approximate USD cost from their stablecoin funding. */
export function payUsdValuation(swap: GetSwapResponse, reviewRate?: number) {
  if (reviewRate !== undefined && Number.isFinite(reviewRate) && reviewRate > 0)
    return { rate: reviewRate, basis: "review" as const };
  if (
    swap.direction !== "evm_to_bitcoin" ||
    !["USDC", "USDT", "USDT0"].includes(swap.source_token.symbol.toUpperCase())
  )
    return undefined;
  const funding = Number(swap.source_amount) / 10 ** swap.source_token.decimals;
  const grossBtc = (Number(swap.target_amount) + Number(swap.fee_sats)) / 1e8;
  const rate = funding / grossBtc;
  return Number.isFinite(rate) && rate > 0
    ? { rate, basis: "funding" as const }
    : undefined;
}
