import {
  type EvmToArkadeSwapResponse,
  type EvmToBitcoinSwapResponse,
  type EvmToLightningSwapResponse,
  isBtcPegged,
  isEvmToken,
  toChainName,
} from "@lendasat/lendaswap-sdk-pure";
import { useAppKit } from "@reown/appkit/react";
import { ArrowRight, ChevronDown, Clock, Loader2, Zap } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useMemo, useState } from "react";
import type {
  Account,
  Transport,
  Chain as ViemChain,
  WalletClient,
} from "viem";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible";
import { api } from "../../api";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import { buildEvmSigner } from "../../utils/evmSigner";
import { getViemChain } from "../../utils/tokenUtils";
import { DepositCard } from "../components";

interface RefundEvmStepProps {
  swapData:
    | EvmToBitcoinSwapResponse
    | EvmToArkadeSwapResponse
    | EvmToLightningSwapResponse;
}

type RefundMode = "swap-back" | "direct";

const COLLAB_REFUND_STATUSES = new Set([
  "pending",
  "clientfundedserverrefunded",
  "expired",
  "clientinvalidfunded",
  "clientfundedtoolate",
  "serverpaymenterror",
]);

function formatAmount(raw: number | string, decimals: number): string {
  return (Number(raw) / 10 ** decimals).toFixed(decimals);
}

export function RefundEvmStep({ swapData }: RefundEvmStepProps) {
  const posthog = usePostHog();
  const { address } = useAccount();
  const { open } = useAppKit();

  const swapId = swapData.id;
  const chain = getViemChain(swapData.source_token.chain);

  const { data: walletClient } = useWalletClient({ chainId: chain?.id });
  const { switchChainAsync } = useSwitchChain();

  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null);

  const sourceSymbol = swapData.source_token.symbol;
  const sourceDecimals = swapData.source_token.decimals;
  const sourceAmount = formatAmount(swapData.source_amount, sourceDecimals);

  const targetSymbol = swapData.target_token.symbol;

  const isWbtcSource = isBtcPegged(swapData.source_token);

  // Determine the BTC-pegged token used in the HTLC (WBTC on Polygon, tBTC on Ethereum/Arbitrum)
  const evmChain = isEvmToken(swapData.source_token.chain)
    ? swapData.source_token.chain
    : swapData.target_token.chain;
  const htlcTokenDecimals = evmChain === "137" ? 8 : 18;
  const htlcTokenSymbol = evmChain === "137" ? "WBTC" : "tBTC";
  const lockedWbtcFormatted = formatAmount(
    swapData.evm_expected_sats,
    htlcTokenDecimals,
  );

  const collabAvailable = COLLAB_REFUND_STATUSES.has(swapData.status);

  // Countdown timer
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const refundLocktime = swapData.evm_refund_locktime || 0;
  const isLocktimePassed = now >= refundLocktime;
  const refundLocktimeDate = new Date(refundLocktime * 1000);

  const timeRemaining = useMemo(() => {
    if (isLocktimePassed) return null;

    const secondsLeft = refundLocktime - now;
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
  }, [now, refundLocktime, isLocktimePassed]);

  // Whether any refund action is possible right now
  const canRefund = collabAvailable || isLocktimePassed;

  // Collab refund for wallet-funded swaps needs a wallet connection (for signing, not gas)
  const collabNeedsWallet = collabAvailable && !swapData.gasless;

  const handleRefund = async (mode: RefundMode) => {
    if (collabAvailable) {
      return handleCollabRefund(mode);
    }
    return handleManualRefund(mode);
  };

  async function handleCollabRefund(settlement: RefundMode) {
    setIsRefunding(true);
    setRefundError(null);
    setRefundSuccess(null);

    try {
      let txHash: string;

      if (swapData.gasless) {
        // Gasless swap - SDK's embedded key is the depositor
        const result = await api.collabRefundEvmSwap(swapId, settlement);
        txHash = result.txHash;
      } else {
        // Wallet-funded swap - sign via external wallet
        if (!walletClient || !address || !chain) {
          open().catch(console.error);
          return;
        }
        const signer = buildEvmSigner(
          walletClient as WalletClient<Transport, ViemChain, Account>,
          chain,
        );
        const result = await api.collabRefundEvmWithSigner(
          swapId,
          signer,
          settlement,
        );
        txHash = result.txHash;
      }

      const label = settlement === "swap-back" ? sourceSymbol : "WBTC";
      setRefundSuccess(`Refund as ${label} successful! Transaction: ${txHash}`);

      posthog?.capture("swap_refunded", {
        swap_id: swapId,
        refund_mode: `collab-${settlement}`,
        refund_txid: txHash,
      });
    } catch (err) {
      console.error("Collaborative refund error:", err);
      setRefundError(
        err instanceof Error
          ? err.message
          : "Failed to execute collaborative refund",
      );
    } finally {
      setIsRefunding(false);
    }
  }

  async function handleManualRefund(mode: RefundMode) {
    if (!address || !walletClient || !chain) {
      open().catch(console.error);
      return;
    }
    if (!switchChainAsync) {
      setRefundError(
        "Chain switching not available. Please refresh and try again.",
      );
      return;
    }
    if (!isLocktimePassed) {
      setRefundError("The refund locktime has not been reached yet");
      return;
    }

    setIsRefunding(true);
    setRefundError(null);
    setRefundSuccess(null);

    try {
      await switchChainAsync({ chainId: chain.id });

      const signer = buildEvmSigner(
        walletClient as WalletClient<Transport, ViemChain, Account>,
        chain,
      );
      const { txHash } = await api.refundEvmWithSigner(swapId, signer, mode);

      setRefundSuccess(`Refund successful! Transaction: ${txHash}`);

      posthog?.capture("swap_refunded", {
        swap_id: swapId,
        refund_mode: `manual-${mode}`,
        refund_txid: txHash,
      });
    } catch (err) {
      console.error("Manual refund error:", err);
      setRefundError(
        err instanceof Error ? err.message : "Failed to execute refund",
      );
    } finally {
      setIsRefunding(false);
    }
  }

  return (
    <DepositCard
      sourceToken={swapData.source_token}
      targetToken={swapData.target_token}
      swapId={swapId}
      title={`Refund ${swapData.source_token.symbol} → ${swapData.target_token.symbol}`}
    >
      <div className="space-y-6">
        {/* Status line */}
        {!refundSuccess && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            {collabAvailable ? (
              <>
                <Zap className="h-4 w-4 text-blue-500" />
                <span>
                  Instant refund available · gasless
                  {!swapData.gasless && ", wallet signature required"}
                </span>
              </>
            ) : isLocktimePassed ? (
              <>
                <Clock className="h-4 w-4 text-green-500" />
                <span>Refund available via wallet transaction</span>
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-lime-400" />
                <span>Refund available in {timeRemaining}</span>
              </>
            )}
          </div>
        )}

        {/* Primary refund buttons */}
        {!refundSuccess && canRefund && (
          <div className="flex flex-col gap-2">
            {!isWbtcSource && (
              <>
                <Button
                  onClick={() => handleRefund("swap-back")}
                  disabled={
                    isRefunding ||
                    ((collabNeedsWallet || !collabAvailable) && !address)
                  }
                  className="h-12 w-full text-base font-semibold"
                >
                  {isRefunding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Refund as ${sourceSymbol}`
                  )}
                </Button>
                <Button
                  onClick={() => handleRefund("direct")}
                  disabled={
                    isRefunding ||
                    ((collabNeedsWallet || !collabAvailable) && !address)
                  }
                  variant="outline"
                  className="h-12 w-full text-base font-semibold"
                >
                  {isRefunding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Refund as WBTC"
                  )}
                </Button>
              </>
            )}

            {isWbtcSource && (
              <Button
                onClick={() => handleRefund("direct")}
                disabled={
                  isRefunding ||
                  ((collabNeedsWallet || !collabAvailable) && !address)
                }
                className="h-12 w-full text-base font-semibold"
              >
                {isRefunding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Refund as WBTC"
                )}
              </Button>
            )}

            {!isWbtcSource && (
              <p className="text-muted-foreground text-xs">
                Refunding as {sourceSymbol} swaps {htlcTokenSymbol} back via a
                DEX - amount may vary slightly due to exchange rate.
              </p>
            )}
          </div>
        )}

        {/* No refund path available - collab unavailable and timelock not passed */}
        {!refundSuccess && !canRefund && (
          <div className="space-y-2 rounded-lg border border-lime-400/30 bg-lime-50 p-4 dark:bg-lime-950/20">
            <p className="text-sm text-lime-700 dark:text-lime-200">
              Instant refund is not available for this swap. Manual refund will
              unlock in:
            </p>
            <div className="font-mono text-2xl font-bold text-lime-800 dark:text-lime-100">
              {timeRemaining}
            </div>
          </div>
        )}

        {/* Swap details */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">{sourceSymbol}</span>
            <ArrowRight className="text-muted-foreground h-3 w-3" />
            <span className="font-medium">{targetSymbol}</span>
            <span className="text-muted-foreground ml-1">
              ({sourceAmount} {sourceSymbol} on{" "}
              {toChainName(swapData.source_token.chain)})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Locked in HTLC</p>
              <p className="font-mono">
                {lockedWbtcFormatted} {htlcTokenSymbol}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Refund Locktime</p>
              <p className="font-mono">
                {refundLocktimeDate.toLocaleString()}
                <span
                  className={`ml-1 ${isLocktimePassed ? "text-green-600" : "text-lime-500"}`}
                >
                  ({isLocktimePassed ? "Passed" : "Locked"})
                </span>
              </p>
            </div>
          </div>

          <div className="text-xs">
            <p className="text-muted-foreground">HTLC Address</p>
            <p className="text-muted-foreground break-all font-mono">
              {swapData.evm_htlc_address}
            </p>
          </div>
        </div>

        {/* Manual refund disclosure - only shown when collab is available and timelock has also passed */}
        {collabAvailable && isLocktimePassed && !refundSuccess && (
          <Collapsible>
            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors">
              <ChevronDown className="h-3 w-3" />
              Advanced: refund manually via wallet
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              {!address && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Connect your wallet to use manual refund
                  </AlertDescription>
                </Alert>
              )}

              {!isWbtcSource && (
                <Button
                  onClick={() => handleManualRefund("swap-back")}
                  disabled={isRefunding || !address}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Manual Refund as {sourceSymbol}
                </Button>
              )}
              <Button
                onClick={() => handleManualRefund("direct")}
                disabled={isRefunding || !address}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Manual Refund as WBTC
              </Button>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Error Display */}
        {refundError && (
          <SupportErrorBanner
            message="Refund failed"
            error={refundError}
            swapId={swapId}
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
