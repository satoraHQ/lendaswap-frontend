import { useState } from "react";
import type { GetSwapResponse } from "../../../api";
import { getDirectionConfig, getSwapDisplayInfo } from "./config";
import { AddressRow, AmountRow, TxHashRow } from "./DetailRows";
import { SuccessLayout } from "./SuccessLayout";

export function DefaultDetails({ swapData }: { swapData: GetSwapResponse }) {
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

  return (
    <SuccessLayout
      swapData={swapData}
      copiedAddress={copiedAddress}
      onCopyAddress={handleCopy}
      sourceSymbol={sourceSymbol}
      targetSymbol={targetSymbol}
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

        {config.swapTxId && (
          <TxHashRow
            label="Transaction Hash"
            txHash={config.swapTxId}
            chain={config.swapTxChain ?? swapData.target_token.chain}
            copiedAddress={copiedAddress}
            onCopy={handleCopy}
          />
        )}
      </div>
    </SuccessLayout>
  );
}
