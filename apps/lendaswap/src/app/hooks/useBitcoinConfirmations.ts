import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "../api";
import {
  clampConfirmations,
  readStoredConfirmations,
  storeConfirmations,
  subscribeConfirmations,
} from "../utils/bitcoinConfirmations";

export function useBitcoinConfirmations() {
  const confirmations = useSyncExternalStore(
    subscribeConfirmations,
    readStoredConfirmations,
  );

  // The client is built with the stored value; this covers changes made while
  // it is already running, including one made in another tab.
  useEffect(() => {
    api.setBitcoinMinConfirmations(confirmations).catch(() => {});
  }, [confirmations]);

  const setConfirmations = useCallback((next: number) => {
    storeConfirmations(clampConfirmations(next));
  }, []);

  return { confirmations, setConfirmations };
}
