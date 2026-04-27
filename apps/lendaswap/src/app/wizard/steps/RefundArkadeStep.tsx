import type {
  ArkadeToEvmSwapResponse,
  ArkadeToLightningSwapResponse,
} from "@lendasat/lendaswap-sdk-pure";
import { ArrowRight, Clock, Loader2, Unlock } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { api, type VhtlcAmounts } from "../../api";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import { useWalletBridge } from "../../WalletBridgeContext";
import { DepositCard } from "../components";

interface RefundArkadeStepProps {
  swapData: ArkadeToEvmSwapResponse | ArkadeToLightningSwapResponse;
}

export function RefundArkadeStep({ swapData }: RefundArkadeStepProps) {
  const posthog = usePostHog();
  const [refundAddress, setRefundAddress] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<VhtlcAmounts | null>(null);
  const [isLoadingAmounts, setIsLoadingAmounts] = useState(false);
  const { arkAddress } = useWalletBridge();

  // Auto-populate refund address if arkAddress is provided
  useEffect(() => {
    if (arkAddress && !refundAddress) {
      setRefundAddress(arkAddress);
    }
  }, [arkAddress, refundAddress]);

  // Fetch amounts once
  useEffect(() => {
    if (amounts !== null) return;

    const fetchAmounts = async () => {
      setIsLoadingAmounts(true);
      try {
        const fetchedAmounts = await api.amountsForSwap(swapData.id);
        setAmounts(fetchedAmounts);
      } catch (error) {
        console.error("Failed to fetch amounts:", error);
        setRefundError(
          `Failed to fetch amounts: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setIsLoadingAmounts(false);
      }
    };

    fetchAmounts();
  }, [swapData, amounts]);

  // Calculate if swap can be refunded.
  // With collaborative refund, no locktime wait is needed — the server cosigns
  // immediately when the swap is in a safe state. The SDK handles the fallback
  // to non-collab (locktime-based) refund if the server rejects.
  const canRefund = (() => {
    if (!swapData || amounts === null) return false;
    return amounts.spendable > 0 || amounts.recoverable > 0;
  })();

  const refundLocktimeDate = new Date(swapData.vhtlc_refund_locktime * 1000);

  const handleRefund = async () => {
    if (!refundAddress.trim()) {
      setRefundError("Please enter a refund address");
      return;
    }

    if (!refundAddress.startsWith("tark") && !refundAddress.startsWith("ark")) {
      setRefundError("Please enter a valid Arkade address");
      return;
    }

    setIsRefunding(true);
    setRefundError(null);
    setRefundSuccess(null);

    try {
      const txid = await api.refundVhtlc(swapData.id, refundAddress);
      setRefundSuccess(`Refund successful! Transaction ID: ${txid}`);

      posthog?.capture("swap_refunded", {
        swap_id: swapData.id,
        swap_direction: "arkade-to-evm",
        refund_reason: "user_initiated",
        refund_txid: txid,
      });
    } catch (error) {
      console.error("Refund failed:", error);
      setRefundError(
        error instanceof Error
          ? error.message
          : "Failed to refund swap. Check the logs or try again later.",
      );
    } finally {
      setIsRefunding(false);
    }
  };

  const alreadyRefunded = amounts !== null && amounts.vtxoStatus === "spent";

  const sourceSymbol = swapData.source_token.symbol;
  const targetSymbol = swapData.target_token.symbol;

  return (
    <DepositCard
      sourceToken={swapData.source_token}
      targetToken={swapData.target_token}
      swapId={swapData.id}
      title={`Refund ${swapData.source_token.symbol} → ${swapData.target_token.symbol}`}
    >
      <div className="space-y-6">
        {/* Refund Status Banner */}
        {alreadyRefunded && (
          <div className="space-y-3 rounded-lg border border-green-500 bg-green-50 p-4 dark:bg-green-950/20">
            <div className="flex items-center gap-3">
              <Unlock className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                Already Refunded
              </h3>
            </div>
            <p className="text-sm text-green-800 dark:text-green-200">
              This swap has already been refunded
            </p>
          </div>
        )}

        {!alreadyRefunded && canRefund && (
          <div className="space-y-3 rounded-lg border border-green-500 bg-green-50 p-4 dark:bg-green-950/20">
            <div className="flex items-center gap-3">
              <Unlock className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                Refund Available
              </h3>
            </div>
            <p className="text-sm text-green-800 dark:text-green-200">
              You can refund your Bitcoin from this swap instantly.
            </p>
          </div>
        )}
        {!alreadyRefunded &&
          !canRefund &&
          amounts !== null &&
          amounts.vtxoStatus !== "spent" &&
          amounts.vtxoStatus !== "not_funded" && (
            <div className="space-y-3 rounded-lg border border-lime-400 bg-lime-50 p-4 dark:bg-lime-950/20">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-lime-500 dark:text-lime-300" />
                <h3 className="text-sm font-semibold text-lime-800 dark:text-lime-100">
                  Refund Unavailable
                </h3>
              </div>
              <p className="text-sm text-lime-700 dark:text-lime-200">
                This swap cannot be refunded at this time. Please try again
                later.
              </p>
            </div>
          )}

        {/* Swap Details */}
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Swap</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{sourceSymbol}</span>
              <ArrowRight className="text-muted-foreground h-3 w-3" />
              <span className="text-xs font-medium">{targetSymbol}</span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">Swap Status</p>
            <p className="text-muted-foreground break-all font-mono text-xs">
              {swapData.status}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">VHTLC Address</p>
            <p className="text-muted-foreground break-all font-mono text-xs">
              {"btc_vhtlc_address" in swapData
                ? swapData.btc_vhtlc_address
                : swapData.arkade_vhtlc_address}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">VHTLC Status</p>
            {isLoadingAmounts ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <p className="text-muted-foreground text-xs">Loading...</p>
              </div>
            ) : amounts !== null ? (
              <div className="space-y-1">
                {amounts.vtxoStatus === "not_funded" && (
                  <p className="text-muted-foreground text-xs">
                    Not yet funded
                  </p>
                )}
                {amounts.vtxoStatus === "spendable" && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {amounts.spendable.toLocaleString()} sats — spendable
                  </p>
                )}
                {amounts.vtxoStatus === "recoverable" && (
                  <p className="text-xs text-lime-500 dark:text-lime-300">
                    {amounts.recoverable.toLocaleString()} sats — recoverable
                    (batch expired)
                  </p>
                )}
                {amounts.vtxoStatus === "mixed" && (
                  <>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {amounts.spendable.toLocaleString()} sats — spendable
                    </p>
                    <p className="text-xs text-lime-500 dark:text-lime-300">
                      {amounts.recoverable.toLocaleString()} sats — recoverable
                      (batch expired)
                    </p>
                  </>
                )}
                {amounts.vtxoStatus === "spent" && (
                  <p className="text-muted-foreground text-xs">
                    {amounts.spent.toLocaleString()} sats — already spent
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">Unknown</p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">Refund Locktime</p>
            <p className="text-muted-foreground text-xs">
              {refundLocktimeDate.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Refund not available warning */}
        {!canRefund && amounts !== null && (
          <Alert>
            <AlertDescription>
              {amounts.vtxoStatus === "spent"
                ? "This VHTLC has already been refunded."
                : amounts.vtxoStatus === "not_funded"
                  ? "No funds found at this VHTLC address."
                  : "This swap cannot be refunded at this time."}
            </AlertDescription>
          </Alert>
        )}

        {/* Refund Form */}
        {canRefund && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refundAddress">
                Refund Address (Arkade Address)
              </Label>
              <Input
                id="refundAddress"
                type="text"
                placeholder="ark1..."
                value={refundAddress}
                onChange={(e) => setRefundAddress(e.target.value)}
                disabled={isRefunding || !!arkAddress}
                className={arkAddress ? "cursor-not-allowed opacity-60" : ""}
              />
            </div>

            <Button
              onClick={handleRefund}
              disabled={isRefunding || !refundAddress.trim() || !canRefund}
              className="h-12 w-full text-base font-semibold"
            >
              {isRefunding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refunding...
                </>
              ) : (
                "Refund Swap"
              )}
            </Button>
          </div>
        )}

        {/* Error Display */}
        {refundError && (
          <SupportErrorBanner
            message="Refund failed"
            error={refundError}
            swapId={swapData.id}
          />
        )}

        {/* Success Display */}
        {refundSuccess && (
          <Alert>
            <AlertDescription>{refundSuccess}</AlertDescription>
          </Alert>
        )}
      </div>
    </DepositCard>
  );
}
