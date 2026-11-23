/**
 * Which amount the server holds against a pair's min/max. It differs per
 * route (see the `/swap/*` handlers in swap/src/api):
 *
 * - `"source"`: BTC → EVM checks what the user sends.
 * - `"target"`: BTC → BTC (Arkade, Lightning, on-chain) and EVM → Lightning
 *   check what the user receives.
 * - `"grossTarget"`: EVM → on-chain/Arkade checks the BTC-equivalent lock,
 *   i.e. the payout plus network fee, grossed up by the protocol fee.
 */
export type LimitSide = "source" | "target" | "grossTarget";

export function limitSide(
  sourceIsBtc: boolean,
  targetIsBtc: boolean,
  targetIsLightning: boolean,
): LimitSide {
  if (sourceIsBtc) return targetIsBtc ? "target" : "source";
  return targetIsLightning ? "target" : "grossTarget";
}

interface QuoteFees {
  /** Fraction, e.g. 0.0025. */
  protocol_fee_rate: number;
  /** Sats. */
  network_fee: number;
}

/**
 * Headroom for the WBTC/BTC rate moving between the quote and creation on
 * `grossTarget` routes, so a filled Max is not refused.
 */
const RATE_HEADROOM = 0.998;

/** The sats the server compares with min/max for the current amounts. */
export function limitCheckedSats(
  side: LimitSide,
  sourceSats: number | undefined,
  targetSats: number | undefined,
  quote: QuoteFees | undefined,
): number | undefined {
  if (side === "source") return sourceSats;
  if (side === "target" || targetSats == null || !quote) return targetSats;
  return Math.ceil(
    (targetSats + quote.network_fee) / (1 - quote.protocol_fee_rate),
  );
}

/**
 * The field and value to fill so that `limitCheckedSats` lands on `sats`
 * (rounded towards the inside of the range).
 */
export function fillForLimit(
  side: LimitSide,
  sats: number,
  bound: "min" | "max",
  quote: QuoteFees | undefined,
): { field: "source" | "target"; amount: number } {
  if (side === "source") return { field: "source", amount: sats };
  if (side === "target" || bound === "min" || !quote) {
    return { field: "target", amount: sats };
  }
  const net =
    Math.floor(sats * (1 - quote.protocol_fee_rate) * RATE_HEADROOM) -
    quote.network_fee;
  return { field: "target", amount: Math.max(0, net) };
}
