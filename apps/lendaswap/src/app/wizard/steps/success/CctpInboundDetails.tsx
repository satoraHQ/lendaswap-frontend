/**
 * Success-page details for CCTP source-side inbound swaps.
 *
 * The backend knows the swap as "Arbitrum USDC → BTC", but the user
 * actually sent USDC on the source chain (e.g. Optimism). Surface that
 * truth here, along with the source-chain burn tx hash (link to the
 * source-chain explorer) and Circle's bridge contribution.
 */

import { toChain } from "@satora/swap";
import { useLiveQuery } from "dexie-react-hooks";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import type { GetSwapResponse } from "../../../api";
import { db } from "../../../db";
import { formatAmount, getDirectionConfig, getSwapDisplayInfo } from "./config";
import { AddressRow, AmountRow, TxHashRow } from "./DetailRows";
import { getRangeUsdcUrl } from "./rangeExplorer";
import { SuccessLayout } from "./SuccessLayout";

export function CctpInboundDetails({
  swapData,
}: {
  swapData: GetSwapResponse;
}) {
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

  const session = useLiveQuery(
    () => db.cctpInboundSessions.get(swapData.id),
    [swapData.id],
  );

  const config = getDirectionConfig(swapData);
  const { targetSymbol, targetNetwork } = getSwapDisplayInfo(swapData);

  // Source chain info comes from the stored CCTP session - the backend's
  // source_token is Arbitrum USDC (the bridged form), not what the user
  // actually sent.
  const sourceChainName = session?.source_chain ?? "Arbitrum";
  const sourceChainId = toChain(sourceChainName);
  const sourceAmountHuman = session?.source_amount
    ? formatAmount(session.source_amount, 6)
    : formatAmount(swapData.source_amount, swapData.source_token.decimals);
  const burnTxHash = session?.burn_tx_hash;

  return (
    <SuccessLayout
      swapData={swapData}
      copiedAddress={copiedAddress}
      onCopyAddress={handleCopy}
      sourceSymbol="USDC"
      targetSymbol={targetSymbol}
      sourceChainOverride={sourceChainId}
    >
      <div className="bg-muted/50 w-full max-w-md space-y-3 rounded-lg p-4">
        <AmountRow label="Amount Sent">
          {sourceAmountHuman} USDC on {sourceChainName}
        </AmountRow>
        <AmountRow label="Bridged via CCTP">→ Arbitrum</AmountRow>
        <AmountRow label="Amount Received">
          {config.targetAmount} {targetSymbol} on {targetNetwork}
        </AmountRow>

        {config.targetAddress && (
          <AddressRow
            label={
              config.isLightning ? "Sent to Invoice/Address" : "Sent to Address"
            }
            address={config.targetAddress}
            chain={swapData.target_token.chain}
            noLink={config.noAddressLink}
            copiedAddress={copiedAddress}
            onCopy={handleCopy}
          />
        )}

        {burnTxHash && (
          <div className="border-border flex flex-col gap-2 border-t pt-2 text-sm">
            <span className="text-muted-foreground">CCTP Transfer</span>
            <div className="flex items-center gap-2">
              <a
                href={getRangeUsdcUrl(burnTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 break-all font-mono text-xs hover:underline"
              >
                View on Range Explorer
              </a>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" asChild className="h-8 w-8">
                  <a
                    href={getRangeUsdcUrl(burnTxHash)}
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

        {config.swapTxId && (
          <TxHashRow
            label={`Claim Transaction (${targetNetwork})`}
            txHash={config.swapTxId}
            chain={swapData.target_token.chain}
            copiedAddress={copiedAddress}
            onCopy={handleCopy}
          />
        )}
      </div>
    </SuccessLayout>
  );
}
