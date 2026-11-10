import type {
  ArkadeToEvmSwapResponse,
  ArkadeToLightningSwapResponse,
} from "@satora/swap";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useArkadeFundingWallet } from "../../hooks/useArkadeFundingWallet";
import { totalFeeSats } from "../../utils/feeUtils";
import { displaySourceToken, displayTargetToken } from "../../utils/tokenUtils";
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
  // Embedded Lendasat wallet or a connected Inscrib3 wallet, whichever is
  // present; both pay the VHTLC address directly.
  const wallet = useArkadeFundingWallet();
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
    if (!wallet.canSend || !arkadeAddress) return;
    try {
      setIsSending(true);
      setSendError(null);
      await wallet.sendToAddress(arkadeAddress, Number(swapData.source_amount));
      // Stay in the "Sending..." state: the swap tracker moves the wizard on
      // once the server sees the VHTLC funded.
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
      sourceToken={displaySourceToken(swapData)}
      targetToken={displayTargetToken(swapData)}
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
          value={`${totalFeeSats(swapData).toLocaleString()} sats`}
        />
      </AmountSummary>
      <DepositActions
        onSendFromWallet={wallet.canSend ? handleSendFromWallet : undefined}
        onCancel={() => navigate("/")}
        isSending={isSending}
        sendError={sendError}
        swapId={swapData.id}
      />
    </DepositCard>
  );
}
