import type {
  LightningToArkadeSwapResponse,
  LightningToEvmSwapResponse,
} from "@satora/swap";
import { Loader2, Zap } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "#/components/ui/button";
import isValidSpeedWalletContext, {
  triggerSpeedWalletPayment,
} from "../../../utils/speedWallet";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import { useNwc } from "../../NwcContext";
import { getTargetChainDisplayName } from "../../utils/tokenUtils";
import { useWalletBridge } from "../../WalletBridgeContext";
import {
  AddressDisplay,
  AmountRow,
  AmountSummary,
  DepositActions,
  DepositCard,
  QrCodeSection,
} from "../components";

interface SendLightningStepProps {
  swapData: LightningToEvmSwapResponse | LightningToArkadeSwapResponse;
}

export function DepositLightningStep({ swapData }: SendLightningStepProps) {
  const navigate = useNavigate();
  const { client, isEmbedded, isReady } = useWalletBridge();
  const { isConnected: isNwcConnected, payInvoice: nwcPayInvoice } = useNwc();
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [speedPaymentTriggered, setSpeedPaymentTriggered] = useState(false);
  const [isNwcPaying, setIsNwcPaying] = useState(false);
  const [nwcPaymentSent, setNwcPaymentSent] = useState(false);

  const lightningInvoice = swapData.bolt11_invoice;
  const lightningQrValue = `lightning:${lightningInvoice}`;
  const tokenAmount = (
    Number(swapData.target_amount) /
    10 ** swapData.target_token.decimals
  ).toFixed(swapData.target_token.decimals);

  const tokenSymbol = swapData.target_token.symbol;

  const isSpeedWallet = isValidSpeedWalletContext();
  const showNwc = !isEmbedded && !isSpeedWallet && isNwcConnected;

  const handleNwcPayment = async () => {
    try {
      setIsNwcPaying(true);
      setSendError(null);
      await nwcPayInvoice(lightningInvoice);
      setNwcPaymentSent(true);
      // Swap wizard polling will detect the payment and advance
    } catch (error) {
      console.error("NWC payment failed:", error);
      setSendError(
        error instanceof Error
          ? error.message
          : "Lightning wallet payment failed",
      );
    } finally {
      setIsNwcPaying(false);
    }
  };

  const sourceAmountBtc = (Number(swapData.source_amount) / 100000000).toFixed(
    8,
  );
  const feeBtc = (Number(swapData.fee_sats) / 100000000).toFixed(8);

  const handleSendFromWallet = async () => {
    if (!client) return;
    try {
      setIsSending(true);
      setSendError(null);
      await client.sendToAddress(
        lightningInvoice,
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

  const handleSpeedWalletPayment = () => {
    if (!lightningInvoice) {
      setSendError("Payment details not available");
      return;
    }

    const success = triggerSpeedWalletPayment(
      lightningInvoice,
      Number(swapData.source_amount),
      `Satora: ${tokenAmount} ${tokenSymbol} swap`,
    );

    if (success) {
      setSpeedPaymentTriggered(true);
      setSendError(null);
    } else {
      setSendError("Failed to trigger Speed Wallet payment");
    }
  };

  // Speed Wallet mode: simplified UI with pay button
  if (isSpeedWallet) {
    return (
      <DepositCard
        sourceToken={swapData.source_token}
        targetToken={swapData.target_token}
        swapId={swapData.id}
        title="Pay with Speed Wallet"
      >
        <p className="text-muted-foreground text-center text-sm">
          Tap the button below to complete your payment
        </p>

        <AmountSummary>
          <AmountRow
            label="You Receive"
            value={`${tokenAmount} ${tokenSymbol} on ${getTargetChainDisplayName(swapData)}`}
          />
        </AmountSummary>

        {sendError && (
          <SupportErrorBanner
            message="Failed to send payment"
            error={sendError}
            swapId={swapData.id}
          />
        )}

        <div className="flex flex-col gap-3">
          <Button
            className="h-14 w-full text-base font-semibold"
            onClick={handleSpeedWalletPayment}
            disabled={speedPaymentTriggered}
          >
            {speedPaymentTriggered ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Waiting for payment...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-5 w-5" />
                Pay {sourceAmountBtc} BTC
              </>
            )}
          </Button>

          <Button
            variant="outline"
            className="h-12 w-full"
            onClick={() => navigate("/")}
          >
            Cancel Swap
          </Button>
        </div>
      </DepositCard>
    );
  }

  // Standard mode: QR code + invoice + wallet bridge

  return (
    <DepositCard
      sourceToken={swapData.source_token}
      targetToken={swapData.target_token}
      swapId={swapData.id}
      title={`${swapData.source_token.symbol} → ${swapData.target_token.symbol}`}
    >
      <QrCodeSection value={lightningQrValue} />
      <AddressDisplay label="Lightning Invoice" value={lightningInvoice} />
      <AmountSummary>
        <AmountRow
          label="Required BTC"
          value={`${sourceAmountBtc} BTC`}
          copyValue={String(swapData.source_amount)}
          copiable
        />
        <AmountRow
          label="You Receive"
          value={`~${tokenAmount} ${tokenSymbol} on ${getTargetChainDisplayName(swapData)}`}
        />
        <AmountRow label="Fee" value={`${feeBtc} BTC`} />
      </AmountSummary>
      <DepositActions
        onSendFromWallet={
          isEmbedded && isReady && client ? handleSendFromWallet : undefined
        }
        onCancel={() => navigate("/")}
        isSending={isSending}
        sendError={sendError}
        swapId={swapData.id}
        extraButtons={
          showNwc ? (
            <Button
              className="h-12 w-full text-base font-semibold"
              onClick={handleNwcPayment}
              disabled={isNwcPaying || nwcPaymentSent}
            >
              {nwcPaymentSent ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Confirming...
                </>
              ) : isNwcPaying ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Paying...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-5 w-5" />
                  Pay with Lightning Wallet
                </>
              )}
            </Button>
          ) : undefined
        }
      />
    </DepositCard>
  );
}
