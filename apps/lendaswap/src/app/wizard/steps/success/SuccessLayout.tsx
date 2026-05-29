import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  Heart,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "#/components/ui/button";
import isValidSpeedWalletContext from "../../../../utils/speedWallet";
import { api, type GetSwapResponse } from "../../../api";
import { getTokenIcon, getTokenNetworkIcon } from "../../../utils/tokenUtils";

interface SuccessLayoutProps {
  swapData: GetSwapResponse;
  copiedAddress: string | null;
  onCopyAddress: (address: string) => void;
  sourceSymbol: string;
  targetSymbol: string;
  /** Override target token chain for the network icon (for cross-chain bridges). */
  targetChainOverride?: string;
  /** Override source token chain for the network icon (for CCTP-inbound). */
  sourceChainOverride?: string;
  children: ReactNode;
}

export function SuccessLayout({
  swapData,
  copiedAddress,
  onCopyAddress,
  sourceSymbol,
  targetSymbol,
  targetChainOverride,
  sourceChainOverride,
  children,
}: SuccessLayoutProps) {
  const navigate = useNavigate();
  const swapId = swapData.id;

  const isArkadeTarget =
    swapData.direction === "evm_to_arkade" ||
    swapData.direction === "btc_to_arkade" ||
    swapData.direction === "lightning_to_arkade";

  const [hasVtxo, setHasVtxo] = useState(false);
  useEffect(() => {
    if (!isArkadeTarget) return;
    let cancelled = false;
    api
      .hasReceivedVtxo(swapId)
      .then((result) => {
        if (!cancelled) setHasVtxo(result);
      })
      .catch((err) => {
        console.error("hasReceivedVtxo error:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [swapId, isArkadeTarget]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
              <div className="flex h-5 w-5 items-center justify-center">
                {getTokenIcon(swapData.source_token)}
              </div>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background p-[1px]">
              <div className="flex h-full w-full items-center justify-center rounded-full [&_svg]:h-full [&_svg]:w-full">
                {getTokenNetworkIcon(
                  sourceChainOverride
                    ? {
                        ...swapData.source_token,
                        chain:
                          sourceChainOverride as typeof swapData.source_token.chain,
                      }
                    : swapData.source_token,
                )}
              </div>
            </div>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="relative">
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
              <div className="flex h-5 w-5 items-center justify-center">
                {getTokenIcon(swapData.target_token)}
              </div>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background p-[1px]">
              <div className="flex h-full w-full items-center justify-center rounded-full [&_svg]:h-full [&_svg]:w-full">
                {getTokenNetworkIcon(
                  targetChainOverride
                    ? {
                        ...swapData.target_token,
                        chain:
                          targetChainOverride as typeof swapData.target_token.chain,
                      }
                    : swapData.target_token,
                )}
              </div>
            </div>
          </div>
          <h3 className="text-sm font-semibold">
            {sourceSymbol} → {targetSymbol}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCopyAddress(swapId)}
            className="flex cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
            title="Copy Swap ID"
          >
            <code className="font-mono text-[10px]">{swapId.slice(0, 8)}…</code>
            {copiedAddress === swapId ? (
              <CheckCheck className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
          <div className="h-2 w-2 rounded-full bg-green-500" />
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="flex flex-col items-center space-y-6">
          {/* Success Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground">
            <Check className="h-8 w-8 text-background" />
          </div>

          {/* Success Message */}
          <div className="space-y-2 text-center">
            {isValidSpeedWalletContext() ? (
              <h3 className="flex items-center justify-center gap-2 text-2xl font-semibold">
                Speed <Heart className="h-6 w-6 fill-red-500 text-red-500" />{" "}
                Satora
              </h3>
            ) : (
              <h3 className="text-2xl font-semibold">Swap Complete!</h3>
            )}
            <p className="text-sm text-muted-foreground">
              Your {targetSymbol} has been successfully sent to your address
            </p>
          </div>

          {/* Transaction Details - provided by variant */}
          {children}

          {/* Recovery warning for Arkade swaps */}
          {isArkadeTarget && !hasVtxo && (
            <div className="w-full max-w-md space-y-3">
              <div className="rounded-lg border border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/20">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Funds not yet received on Arkade
                </div>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                  Your swap completed but the funds haven't arrived in your
                  Arkade wallet yet. This can happen if the claim wasn't fully
                  finalized. Click below to recover your funds.
                </p>
              </div>
              <Button
                variant="outline"
                className="h-12 w-full border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/20"
                onClick={async () => {
                  try {
                    const result = await api.continueArkadeClaimSwap(swapId);
                    if (result.success) {
                      setHasVtxo(true);
                    }
                    console.log(`continueArkadeClaim(${swapId}):`, result);
                  } catch (err) {
                    console.error("continueArkadeClaim error:", err);
                  }
                }}
              >
                Recover Funds
              </Button>
            </div>
          )}

          {/* Start New Swap */}
          <div className="flex w-full max-w-md flex-col gap-3">
            <Button
              className="h-12 w-full text-base font-semibold"
              onClick={() => navigate("/", { replace: true })}
            >
              Start New Swap
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
