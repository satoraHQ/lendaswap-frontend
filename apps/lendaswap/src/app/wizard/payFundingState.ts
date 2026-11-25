/** Apply the funding deadline only while the client is still allowed to fund.
 * An already funded/claimable payment must retain its recovery or claim action.
 */
export function payFundingExpired(
  step: string | undefined,
  deadline: number | undefined,
  now: number,
): boolean {
  return (
    step === "user-deposit" &&
    deadline !== undefined &&
    deadline > 0 &&
    now >= deadline
  );
}

export function payProgress(step: string | undefined, status: string): number {
  if (step === "success") return 4;
  if (step === "user-deposit") return 0;
  if (step === "user-deposit-seen") return 1;
  if (["serverfunded", "clientredeeming"].includes(status)) return 3;
  return 2;
}

/** A server observation is enough to stop requesting a second deposit,
 * but not enough to authorize a claim, refund, or another funding action.
 */
export function showReportedFunding(
  status: string | undefined,
  step: string | undefined,
): boolean {
  return (
    status === "clientfundingseen" &&
    (step === "user-deposit" || step === "expired")
  );
}
