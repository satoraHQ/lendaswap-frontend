import { useEffect, useState } from "react";
import { api } from "../api";

/** How often to re-read MTP from the backend while the clock is live. */
const MTP_REFRESH_MS = 30_000;

/**
 * The Bitcoin chain clock (MTP, ms) for judging HTLC/VHTLC refund locktimes.
 *
 * On-chain CLTV locktimes are enforced against MTP, which lags wall clock by
 * ~30–90 minutes — judging "the refund unlocked" by `Date.now()` shows a green
 * "reclaim now" up to an hour before the chain actually accepts the refund tx.
 *
 * Reads MTP from the backend, extrapolates it forward with wall time between
 * reads (ticking every second, so countdowns stay smooth), and re-reads every
 * 30s so the unlock flip is chain-driven rather than pure extrapolation.
 *
 * Returns `undefined` until the first read lands — treat that as "not yet
 * unlocked" rather than falling back to wall clock, which errs early. Pass
 * `enabled: false` once the clock no longer matters (unlock already reached)
 * to stop the polling and ticking.
 */
export function useBitcoinChainClock(enabled = true): number | undefined {
  const [mtp, setMtp] = useState<{ mtpMs: number; fetchedAtMs: number }>();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = () => {
      api
        .getMtpMs()
        .then((mtpMs) => {
          if (!cancelled) setMtp({ mtpMs, fetchedAtMs: Date.now() });
        })
        .catch(() => {
          // Keep extrapolating from the last reading; retry on the interval.
        });
    };
    read();
    const readTimer = setInterval(read, MTP_REFRESH_MS);
    const tickTimer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      cancelled = true;
      clearInterval(readTimer);
      clearInterval(tickTimer);
    };
  }, [enabled]);

  if (!mtp) return undefined;
  return mtp.mtpMs + Math.max(0, nowMs - mtp.fetchedAtMs);
}
