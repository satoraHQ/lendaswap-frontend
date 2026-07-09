import type {
  ArkadeToEvmSwapResponse,
  ArkadeToLightningSwapResponse,
} from "@satora/swap";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useWalletBridge } from "../../WalletBridgeContext";
import {
  AddressDisplay,
  AmountRow,
  AmountSummary,
  DepositActions,
  DepositCard,
  QrCodeSection,
} from "../components";

interface DepositArkadeStepProps {
  swapData: ArkadeToEvmSwapResponse | ArkadeToLightningSwapResponse;
}

export function DepositArkadeStep({ swapData }: DepositArkadeStepProps) {
  const navigate = useNavigate();
  const { client, isEmbedded, isReady } = useWalletBridge();
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const arkadeAddress =
    "btc_vhtlc_address" in swapData
      ? swapData.btc_vhtlc_address
      : swapData.arkade_vhtlc_address;
  const tokenSymbol = swapData.target_token.symbol;
  const tokenAmount = (
    Number(swapData.target_amount) /
    10 ** swapData.target_token.decimals
  ).toFixed(swapData.target_token.decimals);

  const qrValue = `bitcoin:?ark=${arkadeAddress}&amount=${(Number(swapData.source_amount) / 100_000_000).toFixed(8)}`;

  const handleSendFromWallet = async () => {
    if (!client || !arkadeAddress) return;
    try {
      setIsSending(true);
      setSendError(null);
      await client.sendToAddress(
        arkadeAddress,
        Number(swapData.source_amount),
        "bitcoin",
      );
    } catch (error) {
      console.error("Failed to send from wallet:", error);
      setSendError(
        error instanceof Error ? error.message : "Failed to send from wallet",
      );
      setIsSending(false);
    }
  };

  return (
    <DepositCard
      sourceToken={swapData.source_token}
      targetToken={swapData.target_token}
      swapId={swapData.id}
      title={`${swapData.source_token.symbol} → ${swapData.target_token.symbol}`}
    >
      <QrCodeSection value={qrValue} />
      <AddressDisplay label="Arkade Address" value={arkadeAddress} />
      <AmountSummary>
        <AmountRow
          label="Required Sats"
          value={`${Number(swapData.source_amount).toLocaleString()} sats`}
          copyValue={String(swapData.source_amount)}
          copiable
        />
        <AmountRow
          label="You Receive"
          value={`${tokenAmount} ${tokenSymbol}`}
        />
        <AmountRow
          label="Fee"
          value={`${swapData.fee_sats.toLocaleString()} sats`}
        />
      </AmountSummary>
      <DepositActions
        onSendFromWallet={
          isEmbedded && isReady && client ? handleSendFromWallet : undefined
        }
        onCancel={() => navigate("/")}
        isSending={isSending}
        sendError={sendError}
        swapId={swapData.id}
      />
    </DepositCard>
  );
}
