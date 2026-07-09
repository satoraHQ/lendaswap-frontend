import {
  getLzExplorerUrl,
  type LayerZeroMessageStatus,
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
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    if (!bridgeTxHash) return;
    let cancelled = false;

    trackLzMessage({
      txHash: bridgeTxHash,
      pollIntervalMs: 5_000,
      timeoutMs: 600_000,
      onStatusChange: (status) => {
        if (!cancelled) setBridgeStatus(status);
      },
    })
      .then(() => {
        if (!cancelled) setBridgeStatus("DELIVERED");
      })
      .catch((err) => {
        if (!cancelled) setBridgeError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [bridgeTxHash]);

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
    bridgeStatus === "DELIVERED" || !bridgeTxHash ? (
      <>Arrived on {targetNetwork} via LayerZero.</>
    ) : bridgeError ? (
      <>Tracking failed. Your funds are safe.</>
    ) : (
      <>
        Bridging from Arbitrum to {targetNetwork} via LayerZero. Usually 30-60s.
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
      <div className="bg-muted/50 w-full max-w-md space-y-3 rounded-lg p-4">
        <AmountRow label="Amount Sent">
          {config.sourceAmount} {sourceSymbol} on {sourceNetwork}
        </AmountRow>
        <AmountRow label="Amount Received">
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

        {bridgeTxHash && (
          <div className="border-border flex flex-col gap-2 border-t pt-2 text-sm">
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
