/** Amounts stay in token base units; never round a wallet transfer through Number. */
export function remainingDepositAmount(
  required: bigint,
  received: bigint,
  deadline: number,
  now = Date.now(),
): bigint {
  if (required <= 0n || received < 0n)
    throw new Error("Invalid deposit amount.");
  if (received >= required) return 0n;
  if (deadline > 0 && now >= deadline * 1000)
    throw new Error("Funding has expired. Do not send tokens to this payment.");
  return required - received;
}
