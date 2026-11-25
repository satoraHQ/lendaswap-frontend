/** Conservative claim size shared with the SDK's multi-output claim estimate. */
export function paymentFeeSats(
  value: string,
  mode: "absolute" | "rate",
  recipients: number,
): number {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))
    throw new Error("Enter a valid Bitcoin fee.");
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Bitcoin fee must be positive.");
  if (mode === "absolute" && !Number.isSafeInteger(amount))
    throw new Error("Absolute fees must be whole satoshis.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > 8)
    throw new Error("Use at most 8 decimal places for the fee rate.");
  const scale = 10n ** BigInt(fraction.length);
  const rateUnits = BigInt(whole || "0") * scale + BigInt(fraction || "0");
  // Round only the final transaction fee to a whole satoshi, not the rate.
  const fee =
    mode === "rate"
      ? Number((BigInt(150 + recipients * 43) * rateUnits + scale - 1n) / scale)
      : amount;
  if (!Number.isSafeInteger(fee) || fee > 100000)
    throw new Error("Bitcoin fee must not exceed 100,000 sats.");
  return fee;
}
