// A promo code from a `?promo=` link. Kept until one swap is created with it
// (or the server rejects it), so a reload doesn't lose the discount.
const PROMO_CODE_KEY = "lendaswap_promo_code";

export function setPromoCode(code: string): void {
  try {
    localStorage.setItem(PROMO_CODE_KEY, code.trim().toUpperCase());
  } catch {
    // storage unavailable: the code just won't survive a reload
  }
}

export function getPromoCode(): string | null {
  try {
    return localStorage.getItem(PROMO_CODE_KEY);
  } catch {
    return null;
  }
}

export function clearPromoCode(): void {
  try {
    localStorage.removeItem(PROMO_CODE_KEY);
  } catch {
    // nothing to clear
  }
}

/** Whether a server error is about the promo code rather than the swap. */
export function isPromoCodeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /promo code/i.test(message);
}
