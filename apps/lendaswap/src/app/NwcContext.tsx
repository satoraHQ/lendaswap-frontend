import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface NwcContextType {
  /** Whether an NWC connection is configured and ready */
  isConnected: boolean;
  /** Whether we're currently connecting/testing the connection */
  isConnecting: boolean;
  /** Wallet balance in sats, if known */
  balanceSats: number | null;
  /** Error from the last operation */
  error: string | null;
  /** Connect to a wallet via NWC pairing URI */
  connect: (pairingUri: string) => Promise<void>;
  /** Disconnect and clear stored connection */
  disconnect: () => void;
  /** Pay a BOLT11 invoice. Returns the preimage on success. */
  payInvoice: (bolt11: string) => Promise<string>;
  /** Generate an invoice for the given amount. Returns the BOLT11 string. */
  makeInvoice: (amountSats: number) => Promise<string>;
  /** Refresh the balance */
  refreshBalance: () => Promise<void>;
}

const NwcContext = createContext<NwcContextType>({
  isConnected: false,
  isConnecting: false,
  balanceSats: null,
  error: null,
  connect: async () => {},
  disconnect: () => {},
  payInvoice: async () => "",
  makeInvoice: async () => "",
  refreshBalance: async () => {},
});

export const useNwc = () => useContext(NwcContext);

const STORAGE_KEY = "satora_nwc_uri";

/** Parse a nostr+walletconnect:// URI into its components */
function parseNwcUri(uri: string): {
  walletPubkey: string;
  relayUrl: string;
  secret: string;
} {
  // Format: nostr+walletconnect://<walletPubkey>?relay=<url>&secret=<hex>
  const cleaned = uri.trim();
  const match = cleaned.match(
    /^nostr\+walletconnect:\/\/([0-9a-f]{64})\?(.+)$/i,
  );
  if (!match) {
    throw new Error("Invalid NWC URI format");
  }

  const walletPubkey = match[1];
  const params = new URLSearchParams(match[2]);
  const relayUrl = params.get("relay");
  const secret = params.get("secret");

  if (!relayUrl) throw new Error("NWC URI missing relay parameter");
  if (!secret) throw new Error("NWC URI missing secret parameter");
  if (!/^[0-9a-f]{64}$/i.test(secret))
    throw new Error("NWC URI secret must be a 64-char hex string");

  return { walletPubkey, relayUrl, secret };
}

/**
 * Minimal NWC client using nostr-tools (already a transitive dep).
 *
 * We avoid pulling in @getalby/sdk to keep the bundle small -
 * nostr-tools is a direct dependency used for NWC relay communication.
 */
class NwcClient {
  private walletPubkey: string;
  private relayUrl: string;
  private secretKey: Uint8Array;

  constructor(uri: string) {
    const { walletPubkey, relayUrl, secret } = parseNwcUri(uri);
    this.walletPubkey = walletPubkey;
    this.relayUrl = relayUrl;
    const bytes = secret.match(/.{2}/g);
    if (!bytes) {
      throw new Error("NWC URI contains an invalid hex secret");
    }
    this.secretKey = new Uint8Array(bytes.map((b) => parseInt(b, 16)));
  }

  async init(): Promise<void> {
    // Verify the secret key is valid by deriving a pubkey
    const { getPublicKey } = await import("nostr-tools/pure");
    getPublicKey(this.secretKey);
  }

  /** Send an NWC request and wait for the response */
  private async request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 60_000,
  ): Promise<Record<string, unknown>> {
    const { finalizeEvent } = await import("nostr-tools/pure");
    const { nip04 } = await import("nostr-tools");
    const { Relay } = await import("nostr-tools/relay");

    const content = JSON.stringify({ method, params });
    const encrypted = await nip04.encrypt(
      this.secretKey,
      this.walletPubkey,
      content,
    );

    const requestEvent = finalizeEvent(
      {
        kind: 23194,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.walletPubkey]],
        content: encrypted,
      },
      this.secretKey,
    );

    const relay = await Relay.connect(this.relayUrl);

    try {
      // Subscribe for the response before publishing the request
      const responsePromise = new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            sub.close();
            reject(new Error(`NWC request timed out after ${timeoutMs}ms`));
          }, timeoutMs);

          const sub = relay.subscribe(
            [
              {
                kinds: [23195],
                authors: [this.walletPubkey],
                "#e": [requestEvent.id],
              },
            ],
            {
              onevent: async (event) => {
                clearTimeout(timeout);
                sub.close();
                try {
                  const decrypted = await nip04.decrypt(
                    this.secretKey,
                    this.walletPubkey,
                    event.content,
                  );
                  const response = JSON.parse(decrypted);
                  if (response.error) {
                    reject(
                      new Error(
                        response.error.message ||
                          response.error.code ||
                          "NWC error",
                      ),
                    );
                  } else {
                    resolve(response.result ?? {});
                  }
                } catch (err) {
                  reject(err);
                }
              },
            },
          );
        },
      );

      // Publish the request
      await relay.publish(requestEvent);

      return await responsePromise;
    } finally {
      relay.close();
    }
  }

  async getBalance(): Promise<number> {
    const result = await this.request("get_balance", {});
    // Balance is returned in msats
    return Math.floor((result.balance as number) / 1000);
  }

  async payInvoice(bolt11: string): Promise<string> {
    const result = await this.request("pay_invoice", { invoice: bolt11 });
    return (result.preimage as string) ?? "";
  }

  async makeInvoice(amountSats: number): Promise<string> {
    const result = await this.request("make_invoice", {
      amount: amountSats * 1000, // NWC uses msats
      description: "Satora",
    });
    return result.invoice as string;
  }

  async getInfo(): Promise<Record<string, unknown>> {
    return await this.request("get_info", {}, 10_000);
  }
}

interface NwcProviderProps {
  children: ReactNode;
}

export function NwcProvider({ children }: NwcProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<NwcClient | null>(null);

  // Restore connection from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    let cancelled = false;
    (async () => {
      try {
        const client = new NwcClient(stored);
        await client.init();
        // Quick connectivity test
        const balance = await client.getBalance();
        if (!cancelled) {
          clientRef.current = client;
          setBalanceSats(balance);
          setIsConnected(true);
        }
      } catch (err) {
        console.warn("Failed to restore NWC connection:", err);
        // Don't remove from storage - wallet might just be offline
        if (!cancelled) {
          // Still mark as "connected" (URI is stored) but with null balance
          try {
            const client = new NwcClient(stored);
            await client.init();
            clientRef.current = client;
            if (!cancelled) setIsConnected(true);
          } catch {
            // URI is actually invalid - clear it
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (pairingUri: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      const client = new NwcClient(pairingUri);
      await client.init();
      // Test the connection
      const balance = await client.getBalance();
      clientRef.current = client;
      localStorage.setItem(STORAGE_KEY, pairingUri);
      setBalanceSats(balance);
      setIsConnected(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    setIsConnected(false);
    setBalanceSats(null);
    setError(null);
  }, []);

  const payInvoice = useCallback(async (bolt11: string): Promise<string> => {
    if (!clientRef.current) throw new Error("NWC not connected");
    setError(null);
    try {
      return await clientRef.current.payInvoice(bolt11);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      setError(msg);
      throw err;
    }
  }, []);

  const makeInvoice = useCallback(
    async (amountSats: number): Promise<string> => {
      if (!clientRef.current) throw new Error("NWC not connected");
      setError(null);
      try {
        return await clientRef.current.makeInvoice(amountSats);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Invoice creation failed";
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const refreshBalance = useCallback(async () => {
    if (!clientRef.current) return;
    try {
      const balance = await clientRef.current.getBalance();
      setBalanceSats(balance);
    } catch (err) {
      console.warn("Failed to refresh NWC balance:", err);
    }
  }, []);

  return (
    <NwcContext.Provider
      value={{
        isConnected,
        isConnecting,
        balanceSats,
        error,
        connect,
        disconnect,
        payInvoice,
        makeInvoice,
        refreshBalance,
      }}
    >
      {children}
    </NwcContext.Provider>
  );
}
