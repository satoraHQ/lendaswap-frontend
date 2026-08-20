import { useEffect, useState } from "react";
import { api } from "../api";

const PAUSED_POLL_MS = 30_000;

/**
 * Whether the server's operator kill switch has paused swapping
 * (`swaps_paused` on `GET /status`).
 *
 * Checks once on mount and on window focus. While paused, additionally
 * polls so the UI recovers on its own once the operator resumes.
 */
export function useSwapsPaused(): boolean {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      api
        .getStatus()
        .then((status) => {
          if (!cancelled) setPaused(status.swaps_paused ?? false);
        })
        .catch((err) => {
          // Keep the last known state; a failing /status probe must not
          // block (or unblock) swapping on its own.
          console.warn("Failed to check swap pause state:", err);
        });
    };

    check();
    window.addEventListener("focus", check);
    const interval = paused ? setInterval(check, PAUSED_POLL_MS) : undefined;

    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
      if (interval) clearInterval(interval);
    };
  }, [paused]);

  return paused;
}
