import { useCallback, useSyncExternalStore } from "react";

/**
 * Display unit for every BTC-family amount in the swap card (both inputs,
 * limits, errors). One app-wide value so the Sell and Buy fields of a
 * BTC → WBTC swap never show different units.
 */
export type BtcUnit = "btc" | "sats";

const STORAGE_KEY = "btcDisplayUnit";
export const DEFAULT_BTC_UNIT: BtcUnit = "btc";

// Only set when a write failed (quota, private mode).
let unpersisted: BtcUnit | undefined;
const listeners = new Set<() => void>();

function parseUnit(raw: string | null): BtcUnit | undefined {
  return raw === "btc" || raw === "sats" ? raw : undefined;
}

export function readStoredBtcUnit(): BtcUnit {
  try {
    const stored = parseUnit(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Fall through to whatever the last write left in memory.
  }
  return unpersisted ?? DEFAULT_BTC_UNIT;
}

export function storeBtcUnit(unit: BtcUnit): void {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
    unpersisted = undefined;
  } catch {
    unpersisted = unit;
  }
  for (const listener of listeners) listener();
}

export function subscribeBtcUnit(onChange: () => void): () => void {
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

export function useBtcUnit() {
  const unit = useSyncExternalStore(
    subscribeBtcUnit,
    readStoredBtcUnit,
    () => DEFAULT_BTC_UNIT,
  );
  const toggle = useCallback(
    () => storeBtcUnit(readStoredBtcUnit() === "sats" ? "btc" : "sats"),
    [],
  );
  return { unit, setUnit: storeBtcUnit, toggle };
}

/** Sats as shown in labels: grouped sats, or BTC without trailing zeros. */
export function formatSatsForUnit(sats: number, unit: BtcUnit): string {
  if (unit === "sats") return Math.round(sats).toLocaleString("en-US");
  return (sats / 1e8)
    .toLocaleString("en-US", { maximumFractionDigits: 8 })
    .toString();
}
