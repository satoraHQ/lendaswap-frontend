import { useCallback } from "react";
import { useArkadeWallet } from "../ArkadeWalletContext";
import { useWalletBridge } from "../WalletBridgeContext";

export type ArkadeFundingWalletSource = "embedded" | "inscrib3";

export interface ArkadeFundingWallet {
  /** Where the wallet comes from, or `null` when none is available. */
  source: ArkadeFundingWalletSource | null;
  /** The wallet's Arkade address for receive / refund autofill. */
  address: string | null;
  /** Whether `sendToAddress` can be used right now. */
  canSend: boolean;
  /** Pay `amountSats` to an Arkade address. Resolves with the txid. */
  sendToAddress: (address: string, amountSats: number) => Promise<string>;
}

/**
 * The one Arkade wallet the UI should use, whichever is present:
 *
 * 1. the embedding Lendasat wallet (iframe bridge), which always wins because
 *    the host wallet owns the funds the user is swapping, else
 * 2. a connected Inscrib3 wallet (extension or web wallet).
 *
 * Components that autofill an Arkade address or offer "Send from wallet" use
 * this instead of reaching for either context directly.
 */
export function useArkadeFundingWallet(): ArkadeFundingWallet {
  const bridge = useWalletBridge();
  const inscrib3 = useArkadeWallet();

  const sendViaBridge = useCallback(
    async (address: string, amountSats: number): Promise<string> => {
      if (!bridge.client) throw new Error("Embedded wallet not available");
      return bridge.client.sendToAddress(address, amountSats, "bitcoin");
    },
    [bridge.client],
  );

  if (bridge.isEmbedded) {
    return {
      source: "embedded",
      address: bridge.arkAddress,
      canSend: bridge.isReady && bridge.client !== null,
      sendToAddress: sendViaBridge,
    };
  }

  if (inscrib3.isConnected && inscrib3.address) {
    return {
      source: "inscrib3",
      address: inscrib3.address,
      canSend: true,
      sendToAddress: inscrib3.sendToAddress,
    };
  }

  return {
    source: null,
    address: null,
    canSend: false,
    sendToAddress: async () => {
      throw new Error("No Arkade wallet connected");
    },
  };
}
