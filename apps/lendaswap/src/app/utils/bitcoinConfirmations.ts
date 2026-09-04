const STORAGE_KEY = "bitcoinMinConfirmations";

export const DEFAULT_CONFIRMATIONS = 0;
/** Conventional finality, and safely inside the HTLC refund locktime. */
export const MAX_CONFIRMATIONS = 6;

// Only set when a write failed (quota, private mode), so the UI and the SDK
// client still agree on one value. Storage always wins when it has one.
let unpersisted: number | undefined;

const listeners = new Set<() => void>();

export function clampConfirmations(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONFIRMATIONS;
  return Math.min(MAX_CONFIRMATIONS, Math.max(0, Math.trunc(value)));
}

export function readStoredConfirmations(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return clampConfirmations(Number(raw));
  } catch {
    // Fall through to whatever the last write left in memory.
  }
  return unpersisted ?? DEFAULT_CONFIRMATIONS;
}

export function storeConfirmations(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
    unpersisted = undefined;
  } catch {
    unpersisted = value;
  }
  for (const listener of listeners) listener();
}

/**
 * Change notification for the chosen depth: same tab via {@link
 * storeConfirmations}, other tabs via the `storage` event. Without the
 * cross-tab half each tab's SDK client would keep claiming at the depth it was
 * built with.
 */
export function subscribeConfirmations(onChange: () => void): () => void {
  listeners.add(onChange);
  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", handler);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", handler);
  };
}
