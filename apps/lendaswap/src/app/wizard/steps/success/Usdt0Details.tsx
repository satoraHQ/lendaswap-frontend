import {
  getLzExplorerUrl,
  type LayerZeroMessageStatus,
  LZ_EIDS,
  toChain,
  trackLzMessage,
} from "@satora/swap";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import type { GetSwapResponse } from "../../../api";
import {
  getBridgeInfo,
  getDirectionConfig,
  getSwapDisplayInfo,
} from "./config";
import { AddressRow, AmountRow, CrossChainStatusRow } from "./DetailRows";
import { SuccessLayout } from "./SuccessLayout";

export function Usdt0Details({ swapData }: { swapData: GetSwapResponse }) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const handleCopy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const config = getDirectionConfig(swapData);
  const { sourceSymbol, targetSymbol, sourceNetwork, targetNetwork } =
    getSwapDisplayInfo(swapData);
  const bridgeInfo = getBridgeInfo(swapData);
  const bridgeTxHash = bridgeInfo.claimTxHash;

  // LayerZero tracking state
  const [bridgeStatus, setBridgeStatus] =
    useState<LayerZeroMessageStatus | null>(null);
  const [destinationTxHash, setDestinationTxHash] = useState<string | null>(
    null,
  );
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    setBridgeStatus(null);
    setBridgeError(null);
    setDestinationTxHash(null);
    if (!bridgeTxHash) return;
    let cancelled = false;
    const controller = new AbortController();

    trackLzMessage({
      txHash: bridgeTxHash,
      signal: controller.signal,
      destinationEid: LZ_EIDS[targetNetwork as keyof typeof LZ_EIDS],
      pollIntervalMs: 5_000,
      timeoutMs: 600_000,
      onStatusChange: (status) => {
        if (!cancelled) setBridgeStatus(status);
      },
    })
      .then((result) => {
        if (!cancelled) {
          setBridgeStatus(result.status);
          setDestinationTxHash(result.dstTxHash ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) setBridgeError(String(err));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bridgeTxHash, targetNetwork]);

  const bridgeStatusKind: "pending" | "complete" | "error" = bridgeError
    ? "error"
    : bridgeStatus === "DELIVERED"
      ? "complete"
      : "pending";

  const statusText =
    bridgeStatus === "CONFIRMING"
      ? "Confirming..."
      : `Bridging to ${targetNetwork}...`;

  const description =
    bridgeStatus === "DELIVERED" ? (
      <>Arrived on {targetNetwork} via LayerZero.</>
    ) : bridgeError ? (
      <>
        Delivery is not confirmed. Check the LayerZero transaction before taking
        further action.
      </>
    ) : (
      <>
        Bridging from Arbitrum to {targetNetwork} via LayerZero. Delivery may
        take several minutes.
      </>
    );

  return (
    <SuccessLayout
      swapData={swapData}
      copiedAddress={copiedAddress}
      onCopyAddress={handleCopy}
      sourceSymbol={sourceSymbol}
      targetSymbol={targetSymbol}
      targetChainOverride={toChain(targetNetwork)}
    >
      <div className="w-full max-w-md space-y-3 rounded-lg bg-muted/50 p-4">
        <AmountRow label="Amount Sent">
          {config.sourceAmount} {sourceSymbol} on {sourceNetwork}
        </AmountRow>
        <AmountRow label="Expected Amount">
          {config.targetAmount} {targetSymbol} on {targetNetwork}
        </AmountRow>

        {config.targetAddress && (
          <AddressRow
            label="Sent to Address"
            address={config.targetAddress}
            chain={toChain(targetNetwork)}
            copiedAddress={copiedAddress}
            onCopy={handleCopy}
          />
        )}

        {targetNetwork === "Tron" && destinationTxHash && (
          <a
            href={`https://tronscan.org/#/transaction/${destinationTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm underline"
          >
            View delivery on Tronscan
          </a>
        )}

        {bridgeTxHash && (
          <div className="flex flex-col gap-2 border-t border-border pt-2 text-sm">
            <span className="text-muted-foreground">LayerZero Transfer</span>
            <div className="flex items-center gap-2">
              <a
                href={getLzExplorerUrl(bridgeTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 break-all font-mono text-xs hover:underline"
              >
                View on LayerZero Scan
              </a>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" asChild className="h-8 w-8">
                  <a
                    href={getLzExplorerUrl(bridgeTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        )}

        <CrossChainStatusRow
          status={bridgeStatusKind}
          statusText={statusText}
          description={description}
        />
      </div>
    </SuccessLayout>
  );
}
