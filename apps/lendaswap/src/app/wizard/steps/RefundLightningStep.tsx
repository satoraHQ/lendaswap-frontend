import type {
  LightningToArkadeSwapResponse,
  LightningToEvmSwapResponse,
} from "@lendasat/lendaswap-sdk-pure";
import { toChainName } from "@lendasat/lendaswap-sdk-pure";
import { ArrowRight, Info, Zap } from "lucide-react";
import { getTargetChainDisplayName } from "../../utils/tokenUtils";
import { DepositCard } from "../components";

interface RefundLightningStepProps {
  swapData: LightningToEvmSwapResponse | LightningToArkadeSwapResponse;
}

export function RefundLightningStep({ swapData }: RefundLightningStepProps) {
  return (
    <DepositCard
      sourceToken={swapData.source_token}
      targetToken={swapData.target_token}
      swapId={swapData.id}
      title={`Refund ${swapData.source_token.symbol} → ${swapData.target_token.symbol}`}
    >
      <div className="space-y-6">
        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-500 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Lightning Refund - No Action Needed
            </h3>
          </div>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            This swap could not be completed. Your Lightning payment will be
            refunded automatically by your Lightning wallet. No action is
            required on your part.
          </p>
        </div>

        {/* Explanation */}
        <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Lightning payments are secured by the network. When a swap times
            out, the payment is automatically reversed and the sats are returned
            to your wallet's balance. This usually happens within a few minutes.
          </p>
        </div>

        {/* Swap Details */}
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Swap</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">
                {swapData.source_token.symbol} on{" "}
                {toChainName(swapData.source_token.chain)}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium">
                {swapData.target_token.symbol} on{" "}
                {getTargetChainDisplayName(swapData)}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">Swap Status</p>
            <p className="text-xs text-muted-foreground font-mono break-all">
              {swapData.status}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">Amount Sent</p>
            <p className="text-xs text-muted-foreground">
              {Number(swapData.source_amount).toLocaleString()} sats
            </p>
          </div>
        </div>
      </div>
    </DepositCard>
  );
}
