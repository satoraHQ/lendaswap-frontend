import type { Chain } from "@satora/swap";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type QuoteResponse } from "../api";

export interface UseQuoteParams {
  sourceChain: Chain | undefined;
  sourceToken: string | undefined;
  targetChain: Chain | undefined;
  targetToken: string | undefined;
  /**
   * ATA-existence flag for non-EVM CCTP destinations (Solana). Forwarded
   * to `/quote` so the bridge fee reflects whether Circle has to pre-fund
   * the recipient's USDC account. EVM destinations always pass `false`.
   * Pair changes (chain change, address edit, RPC re-probe) reset the
   * dedupe key so the fee re-renders.
   */
  bridgeRecipientSetup: boolean;
}

export interface RefreshArgs {
  sourceAmount?: number;
  targetAmount?: number;
}

export interface UseQuoteResult {
  quote: QuoteResponse | undefined;
  isLoading: boolean;
  /**
   * Fetch a fresh quote with the given amount. Aborts any in-flight request.
   * Resolves with the new quote (or `undefined` if the request was aborted or
   * failed). The result is also stored in the hook's `quote` state.
   */
  refresh: (args: RefreshArgs) => Promise<QuoteResponse | undefined>;
}

/**
 * Owns quote state for a given asset pair. Each call to `refresh` triggers
 * a new fetch with either source_amount or target_amount; in-flight requests
 * are aborted when superseded or when the asset pair changes.
 */
export function useQuote(params: UseQuoteParams): UseQuoteResult {
  const {
    sourceChain,
    sourceToken,
    targetChain,
    targetToken,
    bridgeRecipientSetup,
  } = params;
  const [quote, setQuote] = useState<QuoteResponse | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Dedupe key for the last in-flight or completed request. Prevents firing
  // a duplicate API call when the effect re-runs with identical args
  // (e.g. React StrictMode dev double-invoke).
  const lastRequestKeyRef = useRef<string | null>(null);
  // Mirror of the latest successful quote, readable inside `refresh`.
  // Needed so dedupe-hit callers get the cached response back rather than
  // `undefined`, which would otherwise lose the caller's follow-up state
  // sync if an earlier in-flight request was cancelled between
  // fetch-started and fetch-settled.
  const quoteRef = useRef<QuoteResponse | undefined>(undefined);

  // Reset state when the asset pair changes so a stale quote from the previous
  // pair doesn't leak through. `bridgeRecipientSetup` flipping doesn't
  // require resetting `quote` — the dedupe key in `refresh` already
  // includes it, so a fresh fetch fires while the previous (slightly
  // pessimistic) quote stays on screen.
  useEffect(() => {
    if (!sourceChain || !sourceToken || !targetChain || !targetToken) {
      return;
    }
    abortRef.current?.abort();
    lastRequestKeyRef.current = null;
    quoteRef.current = undefined;
    setQuote(undefined);
    setIsLoading(false);
  }, [sourceChain, sourceToken, targetChain, targetToken]);

  const refresh = useCallback(
    async (args: RefreshArgs): Promise<QuoteResponse | undefined> => {
      if (!sourceChain || !sourceToken || !targetChain || !targetToken) {
        return undefined;
      }
      if (args.sourceAmount == null && args.targetAmount == null) {
        return undefined;
      }

      // Dedupe: skip the network call if the last request was for the
      // same args and pair. Return the cached quote (not undefined) so
      // callers re-invoking after a cancelled in-flight request still
      // get the response back and can run their follow-up side-effects
      // (e.g. syncing the opposite amount into UI state).
      const key = `${sourceChain}|${sourceToken}|${targetChain}|${targetToken}|s=${args.sourceAmount ?? ""}|t=${args.targetAmount ?? ""}|setup=${bridgeRecipientSetup}`;
      if (lastRequestKeyRef.current === key) {
        return quoteRef.current;
      }
      lastRequestKeyRef.current = key;

      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setIsLoading(true);

      try {
        const q = await api.getQuote({
          sourceChain,
          sourceToken,
          targetChain,
          targetToken,
          sourceAmount: args.sourceAmount,
          targetAmount: args.targetAmount,
          bridgeRecipientSetup,
        });
        if (abort.signal.aborted) {
          return undefined;
        }
        quoteRef.current = q;
        setQuote(q);
        return q;
      } catch (err) {
        // On failure, clear the dedupe key so the next call can retry.
        lastRequestKeyRef.current = null;
        if (abort.signal.aborted) {
          return undefined;
        }
        console.error("Quote fetch failed:", err);
        return undefined;
      } finally {
        if (!abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [sourceChain, sourceToken, targetChain, targetToken, bridgeRecipientSetup],
  );

  return { quote, isLoading, refresh };
}
