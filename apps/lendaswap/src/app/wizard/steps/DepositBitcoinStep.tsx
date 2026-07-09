import {
  type BitcoinToEvmSwapResponse,
  isArkade,
  isEvmToken,
} from "@satora/swap";
import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { BtcToArkadeSwapResponse } from "../../api";
import { getTargetChainDisplayName } from "../../utils/tokenUtils";
import {
  AddressDisplay,
  AmountRow,
  AmountSummary,
  DepositActions,
  DepositCard,
  QrCodeSection,
} from "../components";

interface SendOnchainBtcStepProps {
  swapData: BitcoinToEvmSwapResponse | BtcToArkadeSwapResponse;
  swapId: string;
}

export function DepositBitcoinStep({
  swapData,
  swapId,
}: SendOnchainBtcStepProps) {
  const navigate = useNavigate();

  // Countdown timer state
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const timeRemaining = useMemo(() => {
    const secondsLeft = Number(swapData.btc_refund_locktime) - now;
    if (secondsLeft <= 0) return null;

    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = secondsLeft % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }, [now, swapData.btc_refund_locktime]);

  const btcAmountInBtc = (Number(swapData.source_amount) / 100_000_000).toFixed(
    8,
  );
  const bitcoinUri = `bitcoin:${swapData.btc_htlc_address}?amount=${btcAmountInBtc}`;

  const tokenAmount = (
    Number(swapData.target_amount) /
    10 ** swapData.target_token.decimals
  ).toFixed(swapData.target_token.decimals);

  const receiveLabel = isArkade(swapData.target_token)
    ? `${Number((swapData as BtcToArkadeSwapResponse).target_amount).toLocaleString()} sats on Arkade`
    : isEvmToken(swapData.target_token.chain)
      ? `${tokenAmount} ${swapData.target_token.symbol} on ${getTargetChainDisplayName(swapData)}`
      : undefined;

  return (
    <DepositCard
      sourceToken={swapData.source_token}
      targetToken={swapData.target_token}
      swapId={swapId}
      title={`${swapData.source_token.symbol} → ${swapData.target_token.symbol}`}
    >
      <QrCodeSection value={bitcoinUri} />
      <AddressDisplay
        label="Bitcoin Address"
        value={swapData.btc_htlc_address}
        explorerUrl={`https://mempool.space/address/${swapData.btc_htlc_address}`}
      />
      <AmountSummary>
        <AmountRow
          label="You Send"
          value={`${Number(swapData.source_amount).toLocaleString()} sats`}
          copyValue={String(swapData.source_amount)}
          copiable
        />
        {receiveLabel && <AmountRow label="You Receive" value={receiveLabel} />}
        <AmountRow
          label="Fee"
          value={`${swapData.fee_sats.toLocaleString()} sats`}
        />
        {timeRemaining && (
          <div className="flex justify-between text-sm pt-1 border-t border-border/50">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Expires in
            </span>
            <span className="font-medium font-mono">{timeRemaining}</span>
          </div>
        )}
      </AmountSummary>

      <p className="text-xs text-muted-foreground text-center">
        Send the exact amount above. This page updates automatically once
        payment is detected.
      </p>

      <DepositActions onCancel={() => navigate("/")} />
    </DepositCard>
  );
}
