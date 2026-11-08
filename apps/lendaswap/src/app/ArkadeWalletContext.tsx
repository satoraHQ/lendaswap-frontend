import { RestArkProvider } from "@arkade-os/sdk";
import { isValidArkadeAddress } from "@satora/swap";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ARK_SERVER_URL } from "./api";
import {
  type ArkadeProviderNetworkInfo,
  arkadeAddressMatchesServer,
  connectWithPwa,
  type InjectedArkadeProvider,
  isValidSatsAmount,
  sendWithPwa,
  waitForInjectedArkadeProvider,
} from "./utils/arkadeWalletProvider";

/**
 * How the wallet is reached: the injected `window.arkade` extension, or the
 * Inscrib3 web wallet driven through a popup.
 */
export type ArkadeWalletMode = "extension" | "pwa";

interface ArkadeWalletContextType {
  /** An Arkade extension (`window.arkade`) was detected on this page. */
  hasExtension: boolean;
  /** A wallet is connected and its address passed the server check. */
  isConnected: boolean;
  isConnecting: boolean;
  /** Which transport the current connection uses. */
  mode: ArkadeWalletMode | null;
  /** The wallet's Arkade address (`ark1…` / `tark1…`). */
  address: string | null;
  /** Spendable balance in sats. Extension only; the PWA exposes no balance. */
  balanceSats: number | null;
  /** Wallet network info. Extension only. */
  network: ArkadeProviderNetworkInfo | null;
  /** Error from the last operation. */
  error: string | null;
  /**
   * Connect: through the extension when present, else by opening the
   * Inscrib3 web wallet popup. Must be called from a user gesture (popup).
   */
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Pay `amountSats` to an Arkade address. Resolves with the txid. */
  sendToAddress: (address: string, amountSats: number) => Promise<string>;
  refreshBalance: () => Promise<void>;
}

const ArkadeWalletContext = createContext<ArkadeWalletContextType>({
  hasExtension: false,
  isConnected: false,
  isConnecting: false,
  mode: null,
  address: null,
  balanceSats: null,
  network: null,
  error: null,
  connect: async () => {},
  disconnect: () => {},
  sendToAddress: async () => "",
  refreshBalance: async () => {},
});

/** Inscrib3 Arkade wallet (extension or web wallet) connection state. */
export const useArkadeWallet = () => useContext(ArkadeWalletContext);

/**
 * The PWA grants no persistent permission, so we remember the address it
 * handed us for receive-address autofill. Every send still opens the popup.
 */
const PWA_ADDRESS_STORAGE_KEY = "satora_inscrib3_pwa_address";

// Server info is fetched once per page load; the signer key does not change.
let serverSignerPubkeyPromise: Promise<string | null> | null = null;
function getServerSignerPubkey(): Promise<string | null> {
  serverSignerPubkeyPromise ??= new RestArkProvider(ARK_SERVER_URL)
    .getInfo()
    .then((info) => info.signerPubkey)
    .catch((err) => {
      console.warn("Failed to fetch Arkade server info:", err);
      serverSignerPubkeyPromise = null;
      return null;
    });
  return serverSignerPubkeyPromise;
}

/**
 * Rejects addresses that are malformed or issued by a different Arkade
 * server than the one this app swaps on. When the server info cannot be
 * fetched the key check is skipped rather than blocking the user.
 */
async function assertUsableAddress(address: string): Promise<void> {
  if (!isValidArkadeAddress(address)) {
    throw new Error(`Wallet returned an invalid Arkade address: ${address}`);
  }
  const signerPubkey = await getServerSignerPubkey();
  if (
    signerPubkey !== null &&
    !arkadeAddressMatchesServer(address, signerPubkey)
  ) {
    throw new Error(
      "This wallet is on a different Arkade server than Satora. Switch the wallet's network and reconnect.",
    );
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

interface ArkadeWalletProviderProps {
  children: ReactNode;
}

export function ArkadeWalletProvider({ children }: ArkadeWalletProviderProps) {
  const [hasExtension, setHasExtension] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [mode, setMode] = useState<ArkadeWalletMode | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const [network, setNetwork] = useState<ArkadeProviderNetworkInfo | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<InjectedArkadeProvider | null>(null);

  const clearConnection = useCallback(() => {
    setMode(null);
    setAddress(null);
    setBalanceSats(null);
    setNetwork(null);
  }, []);

  /** Reads address, network and balance from the extension (no approval). */
  const syncFromExtension = useCallback(
    async (provider: InjectedArkadeProvider) => {
      const addr = await provider.getAddress();
      await assertUsableAddress(addr);
      setAddress(addr);
      setMode("extension");
      // Network and balance are informational; a failure (e.g. locked
      // wallet) must not tear down the connection.
      try {
        setNetwork(await provider.getNetwork());
      } catch (err) {
        console.warn("Failed to read Arkade wallet network:", err);
      }
      try {
        setBalanceSats((await provider.getBalance()).available);
      } catch (err) {
        console.warn("Failed to read Arkade wallet balance:", err);
        setBalanceSats(null);
      }
    },
    [],
  );

  // Detect the extension (it injects asynchronously) and restore a session.
  useEffect(() => {
    let cancelled = false;
    let provider: InjectedArkadeProvider | null = null;

    const onAccountsChanged = (data?: unknown) => {
      if (!provider) return;
      const accounts = Array.isArray(data) ? data : [];
      if (accounts.length === 0) {
        clearConnection();
        return;
      }
      syncFromExtension(provider).catch((err) => {
        console.warn("Arkade wallet account change failed:", err);
        setError(errorMessage(err, "Wallet account changed"));
        clearConnection();
      });
    };
    const onNetworkChanged = () => {
      if (!provider) return;
      // The address is server-bound, so re-run the server check.
      syncFromExtension(provider).catch((err) => {
        setError(errorMessage(err, "Wallet network changed"));
        clearConnection();
      });
    };
    const onUnlock = () => {
      const unlocked = provider;
      if (!unlocked) return;
      unlocked
        .isConnected()
        .then((connected) =>
          connected ? syncFromExtension(unlocked) : undefined,
        )
        .catch((err) => console.warn("Arkade wallet unlock sync failed:", err));
    };

    (async () => {
      provider = await waitForInjectedArkadeProvider();
      if (cancelled) return;

      if (!provider) {
        // No extension: restore a remembered PWA address, if any.
        try {
          const stored = localStorage.getItem(PWA_ADDRESS_STORAGE_KEY);
          if (stored && isValidArkadeAddress(stored)) {
            setAddress(stored);
            setMode("pwa");
          } else if (stored) {
            localStorage.removeItem(PWA_ADDRESS_STORAGE_KEY);
          }
        } catch {
          // localStorage unavailable (private mode etc.) — stay disconnected.
        }
        return;
      }

      providerRef.current = provider;
      setHasExtension(true);
      provider.on("accountsChanged", onAccountsChanged);
      provider.on("networkChanged", onNetworkChanged);
      provider.on("unlock", onUnlock);

      // Already approved for this origin? Then read state without a prompt.
      try {
        if (await provider.isConnected()) {
          await syncFromExtension(provider);
        }
      } catch (err) {
        // Locked wallet or a wrong-server address: not connected for now.
        console.warn("Failed to restore Arkade wallet session:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (provider) {
        provider.off("accountsChanged", onAccountsChanged);
        provider.off("networkChanged", onNetworkChanged);
        provider.off("unlock", onUnlock);
      }
    };
  }, [clearConnection, syncFromExtension]);

  const connect = useCallback(async () => {
    setError(null);
    const provider = providerRef.current;
    try {
      if (provider) {
        // Extension path: approval prompt on first connect per origin.
        setIsConnecting(true);
        const accounts = await provider.connect();
        if (accounts.length === 0) {
          throw new Error("Wallet returned no address.");
        }
        await syncFromExtension(provider);
      } else {
        // PWA path. `connectWithPwa` opens the popup synchronously, so no
        // state update may be awaited before it or the browser blocks it.
        const pending = connectWithPwa();
        setIsConnecting(true);
        const [addr] = await pending;
        await assertUsableAddress(addr);
        setAddress(addr);
        setMode("pwa");
        setBalanceSats(null);
        setNetwork(null);
        try {
          localStorage.setItem(PWA_ADDRESS_STORAGE_KEY, addr);
        } catch {
          // Not persisting is fine; the user can reconnect next time.
        }
      }
    } catch (err) {
      clearConnection();
      const msg = errorMessage(err, "Failed to connect wallet");
      setError(msg);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [clearConnection, syncFromExtension]);

  const disconnect = useCallback(() => {
    const provider = providerRef.current;
    if (provider && mode === "extension") {
      provider
        .disconnect()
        .catch((err) => console.warn("Arkade wallet disconnect failed:", err));
    }
    try {
      localStorage.removeItem(PWA_ADDRESS_STORAGE_KEY);
    } catch {
      // ignore
    }
    clearConnection();
    setError(null);
  }, [mode, clearConnection]);

  const sendToAddress = useCallback(
    async (to: string, amountSats: number): Promise<string> => {
      setError(null);
      if (!isValidArkadeAddress(to)) {
        throw new Error("Destination is not a valid Arkade address");
      }
      if (!isValidSatsAmount(amountSats)) {
        throw new Error("Invalid amount: must be a positive integer");
      }
      try {
        const provider = providerRef.current;
        if (provider && mode === "extension") {
          return await provider.sendToAddress(to, amountSats);
        }
        if (mode === "pwa") {
          return await sendWithPwa(to, amountSats);
        }
        throw new Error("Arkade wallet not connected");
      } catch (err) {
        const msg = errorMessage(err, "Payment failed");
        setError(msg);
        throw err;
      }
    },
    [mode],
  );

  const refreshBalance = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider || mode !== "extension") return;
    try {
      setBalanceSats((await provider.getBalance()).available);
    } catch (err) {
      console.warn("Failed to refresh Arkade wallet balance:", err);
    }
  }, [mode]);

  return (
    <ArkadeWalletContext.Provider
      value={{
        hasExtension,
        isConnected: address !== null && mode !== null,
        isConnecting,
        mode,
        address,
        balanceSats,
        network,
        error,
        connect,
        disconnect,
        sendToAddress,
        refreshBalance,
      }}
    >
      {children}
    </ArkadeWalletContext.Provider>
  );
}
