import type { QuoteResponse } from "../api";

/** Fees extracted from a quote, all in satoshis. */
export interface QuoteFees {
  /** Fixed per-transaction fees: network_fee + gasless_network_fee (sats) */
  fixedFees: number;
  /** Proportional protocol fee rate (e.g. 0.0025 = 0.25%) */
  protocolFeeRate: number;
}

/** Parameters for amount derivation. */
export interface DeriveAmountParams {
  /** The amount the user entered (in smallest units of the edited token) */
  amount: number;
  /** exchange_rate from the quote: EVM tokens (human-readable) per 1 BTC */
  exchangeRate: number;
  /** Decimals of the EVM token involved in the swap */
  evmDecimals: number;
  /** Whether the source token is BTC */
  isSourceBtc: boolean;
  /** Fee parameters */
  fees: QuoteFees;
  /** CCTP bridge fee in target token smallest units (e.g. USDC). 0 if no bridge. */
  bridgeFee?: number;
}

/**
 * Convert satoshis to EVM token smallest units.
 *
 * Formula: sats * exchangeRate * 10^evmDecimals / 10^8
 */
export function satsToEvmSmallest(
  sats: number,
  exchangeRate: number,
  evmDecimals: number,
): number {
  return (sats * exchangeRate * 10 ** evmDecimals) / 1e8;
}

/**
 * Convert EVM token smallest units to satoshis.
 *
 * Formula: evmSmallest * 10^8 / (exchangeRate * 10^evmDecimals)
 */
export function evmSmallestToSats(
  evmSmallest: number,
  exchangeRate: number,
  evmDecimals: number,
): number {
  return (evmSmallest * 1e8) / (exchangeRate * 10 ** evmDecimals);
}

/**
 * Derive the target amount when the user edits the source amount.
 *
 * Fees are deducted: the source stays stable, the target reflects what
 * the user actually receives after all fees.
 */
export function deriveTargetAmount(params: DeriveAmountParams): number {
  const {
    amount,
    exchangeRate,
    evmDecimals,
    isSourceBtc,
    fees,
    bridgeFee = 0,
  } = params;
  const { fixedFees, protocolFeeRate } = fees;

  if (isSourceBtc) {
    // BTC→EVM: deduct fees from BTC, convert remainder to EVM, then subtract bridge fee
    const effectiveSats = amount * (1 - protocolFeeRate) - fixedFees;
    const evmAmount = Math.round(
      satsToEvmSmallest(effectiveSats, exchangeRate, evmDecimals),
    );
    return Math.max(0, evmAmount - bridgeFee);
  } else {
    // EVM→BTC: convert EVM to raw BTC, then deduct fees
    const rawBtc = evmSmallestToSats(amount, exchangeRate, evmDecimals);
    const netBtc = rawBtc * (1 - protocolFeeRate) - fixedFees;
    return Math.max(0, Math.round(netBtc));
  }
}

/**
 * Derive the source amount when the user edits the target amount.
 *
 * Fees are added: the target stays stable, the source reflects what
 * the user must pay to receive the desired target after all fees.
 */
export function deriveSourceAmount(params: DeriveAmountParams): number {
  const {
    amount,
    exchangeRate,
    evmDecimals,
    isSourceBtc,
    fees,
    bridgeFee = 0,
  } = params;
  const { fixedFees, protocolFeeRate } = fees;

  if (isSourceBtc) {
    // BTC→EVM: user wants T EVM tokens - calculate BTC needed including fees.
    // If bridging, the DEX must output T + bridgeFee so the user receives T after fee.
    const targetPlusBridgeFee = amount + bridgeFee;
    const btcForExchange = evmSmallestToSats(
      targetPlusBridgeFee,
      exchangeRate,
      evmDecimals,
    );
    const source = (btcForExchange + fixedFees) / (1 - protocolFeeRate);
    return Math.max(0, Math.round(source));
  } else {
    // EVM→BTC: user wants T BTC sats - calculate EVM needed including fees
    const grossBtc = (amount + fixedFees) / (1 - protocolFeeRate);
    const source = satsToEvmSmallest(grossBtc, exchangeRate, evmDecimals);
    return Math.max(0, Math.round(source));
  }
}

/** Extract fee parameters from a QuoteResponse. */
export function extractFees(
  quote: QuoteResponse,
  includeGasless = true,
): QuoteFees {
  const gasless = includeGasless ? Number(quote.gasless_network_fee) : 0;
  return {
    fixedFees: Number(quote.network_fee) + gasless,
    protocolFeeRate: quote.protocol_fee_rate,
  };
}

/** Total network fee (network + gasless) in BTC. */
export function totalNetworkFeeBtc(quote: QuoteResponse): string {
  const totalSats =
    Number(quote.network_fee) + Number(quote.gasless_network_fee);
  return (totalSats / 1e8).toFixed(8);
}

/** Server network fee in BTC. */
export function serverNetworkFeeBtc(quote: QuoteResponse): string {
  return (Number(quote.network_fee) / 1e8).toFixed(8);
}

/** Gasless execution fee in BTC. */
export function gaslessFeeBtc(quote: QuoteResponse): string {
  return (Number(quote.gasless_network_fee) / 1e8).toFixed(8);
}

/** Total fee (network + gasless + protocol) in BTC. */
export function totalFeeBtc(
  btcAmountSats: number | undefined,
  quote: QuoteResponse,
  includeGasless = true,
): string {
  const gasless = includeGasless ? Number(quote.gasless_network_fee) : 0;
  const networkSats = Number(quote.network_fee) + gasless;
  const protocolSats =
    btcAmountSats != null
      ? btcAmountSats * quote.protocol_fee_rate
      : Number(quote.protocol_fee);
  return ((networkSats + protocolSats) / 1e8).toFixed(8);
}

/** Protocol fee in BTC for a given BTC amount in sats. */
export function protocolFeeBtc(
  btcAmountSats: number | undefined,
  quote: QuoteResponse,
): string {
  if (btcAmountSats != null) {
    const fee = btcAmountSats * quote.protocol_fee_rate;
    return (fee / 1e8).toFixed(8);
  }
  return (Number(quote.protocol_fee) / 1e8).toFixed(8);
}
