import {
  type ArkadeToEvmSwapResponse,
  type ArkadeToLightningSwapResponse,
  isValidArkadeAddress,
  type SwapStatus,
} from "@satora/swap";
import { Clock, ExternalLink, Loader2, Unlock } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { api, type VhtlcAmounts } from "../../api";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import { useBitcoinChainClock } from "../../hooks/useBitcoinChainClock";
import { extractRefundAddress } from "../../utils/bip21";
import {
  getBlockexplorerAddressLink,
  getBlockexplorerTxLink,
} from "../../utils/tokenUtils";
import { useWalletBridge } from "../../WalletBridgeContext";
import { DepositCard } from "../components";

interface RefundArkadeStepProps {
  swapData: ArkadeToEvmSwapResponse | ArkadeToLightningSwapResponse;
}

/**
 * Failed states where the server co-signs a COLLABORATIVE refund immediately —
 * no timelock wait. In any other state only the unilateral (timelocked) path
 * exists, so the refund unlocks at `vhtlc_refund_locktime`.
 */
const COLLAB_REFUND_STATUSES: SwapStatus[] = [
  "serverwontfund",
  "clientinvalidfunded",
  "clientfundedserverrefunded",
  "clientfundedtoolate",
];

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function RefundArkadeStep({ swapData }: RefundArkadeStepProps) {
  const [refundAddress, setRefundAddress] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  /** Txid of a successful refund, rendered as an explorer link. */
  const [refundTxid, setRefundTxid] = useState<string | null>(null);
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

  // Which refund mode applies: in a failed state the server co-signs a collab
  // refund instantly; otherwise only the unilateral path exists and it unlocks
  // at the VHTLC refund locktime. (The SDK still falls back from collab to
  // unilateral if the server unexpectedly rejects.)
  const collabAvailable = COLLAB_REFUND_STATUSES.includes(swapData.status);
  const locktimeMs = swapData.vhtlc_refund_locktime * 1000;
  // The unilateral unlock is judged by the Bitcoin chain clock (MTP) from the
  // backend, NOT wall clock — MTP lags it by ~30–90 min, and the VHTLC CLTV is
  // enforced against MTP. Until the first reading lands we stay "locked" (the
  // safe direction); the display countdown falls back to wall clock meanwhile.
  const chainNowMs = useBitcoinChainClock(!collabAvailable);
  const locktimePassed = chainNowMs !== undefined && chainNowMs >= locktimeMs;
  const refundUnlocked = collabAvailable || locktimePassed;

  const hasFunds =
    amounts !== null && (amounts.spendable > 0 || amounts.recoverable > 0);
  const canRefund = hasFunds && refundUnlocked;

  const refundLocktimeDate = new Date(locktimeMs);

  const handleRefund = async () => {
    if (!refundAddress.trim()) {
      setRefundError("Please enter a refund address");
      return;
    }

    if (!isValidArkadeAddress(refundAddress.trim())) {
      setRefundError("Please enter a valid Arkade address");
      return;
    }

    setIsRefunding(true);
    setRefundError(null);
    setRefundTxid(null);

    try {
      const txid = await api.refundVhtlc(swapData.id, refundAddress);
      setRefundTxid(txid);
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
              {collabAvailable
                ? "The swap failed, so the server co-signs your refund immediately — no need to wait for the timelock."
                : "The refund timelock has passed — you can reclaim your deposit now."}
            </p>
          </div>
        )}
        {!alreadyRefunded && hasFunds && !refundUnlocked && (
          <div className="space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-4 dark:bg-amber-950/20">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Refund Locked
              </h3>
            </div>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Your deposit unlocks at {refundLocktimeDate.toLocaleString()} — in{" "}
              {formatCountdown(locktimeMs - (chainNowMs ?? Date.now()))}.
            </p>
          </div>
        )}
        {!alreadyRefunded &&
          !hasFunds &&
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
            <p className="text-sm font-medium">Swap Status</p>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {swapData.status}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">VHTLC Address</p>
            {(() => {
              const vhtlcAddress =
                "btc_vhtlc_address" in swapData
                  ? swapData.btc_vhtlc_address
                  : swapData.arkade_vhtlc_address;
              return (
                <a
                  href={getBlockexplorerAddressLink("Arkade", vhtlcAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1 break-all font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  <span className="break-all">{vhtlcAddress}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0" />
                </a>
              );
            })()}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">VHTLC Status</p>
            {isLoadingAmounts ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            ) : amounts !== null ? (
              <div className="space-y-1">
                {amounts.vtxoStatus === "not_funded" && (
                  <p className="text-xs text-muted-foreground">
                    Not yet funded
                  </p>
                )}
                {amounts.vtxoStatus === "spendable" && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {amounts.spendable.toLocaleString()} sats - spendable
                  </p>
                )}
                {amounts.vtxoStatus === "recoverable" && (
                  <p className="text-xs text-lime-500 dark:text-lime-300">
                    {amounts.recoverable.toLocaleString()} sats - recoverable
                    (batch expired)
                  </p>
                )}
                {amounts.vtxoStatus === "mixed" && (
                  <>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {amounts.spendable.toLocaleString()} sats - spendable
                    </p>
                    <p className="text-xs text-lime-500 dark:text-lime-300">
                      {amounts.recoverable.toLocaleString()} sats - recoverable
                      (batch expired)
                    </p>
                  </>
                )}
                {amounts.vtxoStatus === "spent" && (
                  <p className="text-xs text-muted-foreground">
                    {amounts.spent.toLocaleString()} sats - already spent
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Unknown</p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">
              {collabAvailable
                ? "Backup: refund on your own"
                : "Refund Locktime"}
            </p>
            <p className="text-xs text-muted-foreground">
              {collabAvailable
                ? `If the instant refund fails, you can refund without the server's help from ${refundLocktimeDate.toLocaleString()}.`
                : refundLocktimeDate.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Refund not available warning */}
        {!hasFunds && amounts !== null && (
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
                onChange={(e) => {
                  // Accept a pasted BIP21 URI (bitcoin:…?ark=ark1…) and pull
                  // out the Arkade address; plain addresses pass through.
                  const raw = e.target.value;
                  setRefundAddress(extractRefundAddress(raw, "arkade") ?? raw);
                }}
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
        {refundTxid && (
          <Alert>
            <AlertDescription>
              <span>
                Refund successful!{" "}
                <a
                  href={getBlockexplorerTxLink("Arkade", refundTxid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1 break-all font-mono underline-offset-2 hover:underline"
                >
                  <span className="break-all">{refundTxid}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0" />
                </a>
              </span>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </DepositCard>
  );
}
