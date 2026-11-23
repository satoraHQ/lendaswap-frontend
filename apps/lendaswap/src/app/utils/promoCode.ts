// The promo code from a `?promo=` link, good for one swap.
//
// The active code lives in memory and is read once from localStorage at
// startup, so a quote and the create that follows always use the same code,
// even if another tab changes storage in between. localStorage only carries
// it across reloads.
import { useSyncExternalStore } from "react";

const PROMO_CODE_KEY = "lendaswap_promo_code";

function readStored(): string | null {
  try {
    return localStorage.getItem(PROMO_CODE_KEY);
  } catch {
    return null;
  }
}

let active: string | null = readStored();
const listeners = new Set<() => void>();

function publish(code: string | null): void {
  active = code;
  try {
    if (code) localStorage.setItem(PROMO_CODE_KEY, code);
    else localStorage.removeItem(PROMO_CODE_KEY);
  } catch {
    // storage unavailable: the code just won't survive a reload
  }
  for (const listener of listeners) listener();
}

export function setPromoCode(code: string): void {
  const normalized = code.trim().toUpperCase();
  if (normalized && normalized !== active) publish(normalized);
}

export function getPromoCode(): string | null {
  return active;
}

export function clearPromoCode(): void {
  if (active !== null) publish(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active promo code; re-renders when it is set or cleared. */
export function usePromoCode(): string | null {
  return useSyncExternalStore(subscribe, getPromoCode, getPromoCode);
}

/** Whether a server error is about the promo code rather than the swap. */
export function isPromoCodeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /promo code/i.test(message);
}
