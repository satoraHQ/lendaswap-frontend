import { useEffect, useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";

/**
 * Typical block interval per EVM chain, for the "about N min" estimate
 * next to the confirmation count. Rough on purpose: Rootstock is
 * merge-mined and varies a lot around its 30 s target.
 */
const BLOCK_MS: Record<number, number> = {
  1: 12_000,
  137: 2_000,
  42161: 250,
  30: 30_000,
};

export interface EvmFundingConfirmations {
  /** Blocks on top of the funding block, inclusive; undefined until the
   *  receipt and head are known. 0 while the tx is still pending. */
  confirmations?: number;
  /** Blocks the server waits for before it acts on the deposit. */
  required: number;
  /** Rough time until `required` is reached, when the chain's block time is known. */
  etaMs?: number;
}

/**
 * How deep the user's EVM deposit is against the server's funding-finality
 * floor. The funding receipt is read once; the chain head is watched so
 * the count advances block by block.
 */
export function useEvmFundingConfirmations(params: {
  chainId: number;
  txid: string | null | undefined;
  required: number;
  enabled: boolean;
}): EvmFundingConfirmations {
  const { chainId, txid, required, enabled } = params;
  const publicClient = usePublicClient({ chainId });
  const { data: head } = useBlockNumber({
    chainId,
    watch: true,
    query: { enabled: enabled && !!txid },
  });
  const [fundBlock, setFundBlock] = useState<bigint | null | undefined>();

  // Read the receipt once it exists; until then (`null`: the node knows no
  // receipt yet) try again on every new head.
  const mined = fundBlock !== undefined && fundBlock !== null;
  useEffect(() => {
    // `head` gates the read so a retry follows each new block.
    if (!enabled || !txid || !publicClient || mined || head === undefined) {
      return;
    }
    let cancelled = false;
    publicClient
      .getTransactionReceipt({ hash: txid as `0x${string}` })
      .then((receipt) => {
        if (!cancelled) setFundBlock(receipt.blockNumber);
      })
      .catch(() => {
        if (!cancelled) setFundBlock(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, txid, publicClient, mined, head]);

  if (!enabled || !txid || head === undefined || fundBlock === undefined) {
    return { required };
  }
  if (fundBlock === null) {
    return { confirmations: 0, required };
  }
  const confirmations = Math.max(0, Number(head - fundBlock) + 1);
  const blockMs = BLOCK_MS[chainId];
  const remaining = Math.max(0, required - confirmations);
  return {
    confirmations,
    required,
    etaMs: blockMs === undefined ? undefined : remaining * blockMs,
  };
}

/** "about 3 min" / "under a minute" for the confirmation ETA. */
export function formatEta(etaMs: number): string {
  const minutes = Math.round(etaMs / 60_000);
  return minutes < 1 ? "under a minute" : `about ${minutes} min`;
}
