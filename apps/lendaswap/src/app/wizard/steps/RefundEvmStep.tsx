import { useAppKit } from "@reown/appkit/react";
import {
  type EvmToArkadeSwapResponse,
  type EvmToBitcoinSwapResponse,
  type EvmToLightningSwapResponse,
  isEvmToken,
  toChainName,
} from "@satora/swap";
import { ArrowRight, Clock, Loader2, RefreshCw, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  Account,
  Transport,
  Chain as ViemChain,
  WalletClient,
} from "viem";
import {
  useAccount,
  useBytecode,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { api } from "../../api";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import {
  evmRefundOptions,
  isContractWallet,
} from "../../utils/evmRefundOptions";
import { buildEvmSigner } from "../../utils/evmSigner";
import {
  displayTargetToken,
  getViemChain,
  isNativeLockSwap,
} from "../../utils/tokenUtils";
import { DepositCard } from "../components";

interface RefundEvmStepProps {
  swapData:
    | EvmToBitcoinSwapResponse
    | EvmToArkadeSwapResponse
    | EvmToLightningSwapResponse;
}

function formatAmount(raw: number | string, decimals: number): string {
  return (Number(raw) / 10 ** decimals).toFixed(decimals);
}

export function RefundEvmStep({ swapData }: RefundEvmStepProps) {
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

  // Determine the BTC-pegged token used in the HTLC (WBTC on Polygon, tBTC on Ethereum/Arbitrum)
  const evmChain = isEvmToken(swapData.source_token.chain)
    ? swapData.source_token.chain
    : swapData.target_token.chain;
  // A native lock holds the chain's own coin (RBTC), named by the source token.
  const isNativeLock = isNativeLockSwap(swapData);
  const htlcTokenDecimals = isNativeLock
    ? swapData.source_token.decimals
    : evmChain === "137"
      ? 8
      : 18;
  const htlcTokenSymbol = isNativeLock
    ? swapData.source_token.symbol
    : evmChain === "137"
      ? "WBTC"
      : "tBTC";
  const lockedWbtcFormatted = formatAmount(
    swapData.evm_expected_sats,
    htlcTokenDecimals,
  );

  // The connected wallet's code: a contract wallet cannot give the plain
  // ECDSA signatures some refund paths need.
  const { data: walletCode } = useBytecode({
    address,
    chainId: chain?.id,
    query: { enabled: !!address && !!chain && !swapData.gasless },
  });

  const [newInvoice, setNewInvoice] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrySuccess, setRetrySuccess] = useState<string | null>(null);
  // The timelock the lock continues under after a successful retry. Refund
  // controls stay hidden while the server has time to pay the new invoice,
  // and come back once that timelock has passed, in case it never does.
  const [retriedTimelock, setRetriedTimelock] = useState<number | null>(null);

  // Countdown timer
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // After a successful retry the lock has a new timelock; refunding before it
  // passes would race the server's payment, so refund controls wait for it.
  const retryBlocksRefund =
    retrySuccess !== null &&
    (retriedTimelock === null || now < retriedTimelock);

  const refundLocktime = swapData.evm_refund_locktime || 0;
  const isLocktimePassed = now >= refundLocktime;
  const refundLocktimeDate = new Date(refundLocktime * 1000);

  // What this deployment, chain and wallet can do for the swap. An EVM →
  // Lightning swap the server gave up paying can also keep its position:
  // instead of refunding, the lock moves to a new invoice (`rehash`).
  // The sponsored refund needs the server, bundler and paymaster. Once it
  // fails, the wallet refund (and a gasless collab refund) is offered next
  // to it, which covers bundler, paymaster and AA config failures. The
  // wallet refund still fetches its calldata from the server.
  const [sponsoredFailed, setSponsoredFailed] = useState(false);
  const {
    collab: collabAvailable,
    collabGasless,
    collabNeedsSignature,
    retry: retryAvailable,
    primary,
    primaryNeedsWallet,
    walletFallback,
    secondaryCollab,
  } = evmRefundOptions({
    status: swapData.status,
    htlcKind: swapData.evm_htlc_kind,
    htlcVersion: swapData.evm_htlc_version,
    chainId: swapData.evm_chain_id,
    gasless: !!swapData.gasless,
    isLightning: "client_lightning_invoice" in swapData,
    locktimePassed: isLocktimePassed,
    walletIsContract: isContractWallet(walletCode),
    sponsoredFailed,
  });

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

  // Collab refund for wallet-funded swaps needs a wallet connection: to sign
  // for the coordinator, or to send `refundBySig` on the direct path
  const collabNeedsWallet = collabAvailable && !swapData.gasless;

  const handleRefund = async () => {
    if (primary === "collab") {
      return handleCollabRefund();
    }
    if (primary === "sponsored") {
      return handleSponsoredRefund();
    }
    return handleManualRefund();
  };

  // Gasless swap after the timelock: the SDK key's account refunds itself
  // with a sponsored UserOp, so no wallet and no gas.
  async function handleSponsoredRefund() {
    setIsRefunding(true);
    setRefundError(null);
    setRefundSuccess(null);
    try {
      const { txHash } = await api.refundEvmSponsored(swapId);
      setRefundSuccess(
        `Refund as ${htlcTokenSymbol} successful! Transaction: ${txHash}`,
      );
    } catch (err) {
      console.error("Sponsored refund error:", err);
      setSponsoredFailed(true);
      const reason =
        err instanceof Error ? err.message : "Failed to execute refund";
      setRefundError(
        `Gasless refund failed: ${reason}. Try again, or refund with your wallet instead.`,
      );
    } finally {
      setIsRefunding(false);
    }
  }

  async function handleCollabRefund() {
    setIsRefunding(true);
    setRefundError(null);
    setRefundSuccess(null);

    try {
      let txHash: string;

      if (swapData.gasless) {
        // Gasless swap - SDK's embedded key is the depositor
        const result = await api.collabRefundEvmSwap(swapId);
        txHash = result.txHash;
      } else {
        // Wallet-funded swap: the wallet signs and, on HTLC v7, sends the
        // refund itself, so it must be on the lock's chain.
        if (!walletClient || !address || !chain) {
          open().catch(console.error);
          return;
        }
        if (!switchChainAsync) {
          setRefundError(
            "Chain switching not available. Please refresh and try again.",
          );
          return;
        }
        await switchChainAsync({ chainId: chain.id });
        const signer = buildEvmSigner(
          walletClient as WalletClient<Transport, ViemChain, Account>,
          chain,
        );
        const result = await api.collabRefundEvmWithSigner(swapId, signer);
        txHash = result.txHash;
      }

      setRefundSuccess(
        `Refund as ${htlcTokenSymbol} successful! Transaction: ${txHash}`,
      );
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

  async function handleRetryWithInvoice() {
    const invoice = newInvoice.trim();
    if (!invoice) {
      setRetryError("Paste a new Lightning invoice first");
      return;
    }
    setIsRetrying(true);
    setRetryError(null);
    setRetrySuccess(null);
    try {
      let txHash: string;
      if (swapData.gasless) {
        let newTimelock: number;
        ({ txHash, newTimelock } = await api.retrySwapWithInvoice(
          swapId,
          invoice,
        ));
        setRetriedTimelock(newTimelock);
      } else {
        if (!walletClient || !address || !chain) {
          open().catch(console.error);
          return;
        }
        if (!switchChainAsync) {
          setRetryError(
            "Chain switching not available. Please refresh and try again.",
          );
          return;
        }
        await switchChainAsync({ chainId: chain.id });
        const signer = buildEvmSigner(
          walletClient as WalletClient<Transport, ViemChain, Account>,
          chain,
        );
        let newTimelock: number;
        ({ txHash, newTimelock } = await api.retrySwapWithInvoiceWithSigner(
          swapId,
          invoice,
          signer,
        ));
        setRetriedTimelock(newTimelock);
      }
      setRetrySuccess(
        `Lock moved to the new invoice (tx ${txHash}). The server pays it once the move is confirmed; this page updates when it does.`,
      );
    } catch (err) {
      console.error("Retry with invoice error:", err);
      setRetryError(
        err instanceof Error
          ? err.message
          : "Failed to retry with a new invoice",
      );
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleManualRefund() {
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
      const { txHash } = await api.refundEvmWithSigner(swapId, signer);

      setRefundSuccess(`Refund successful! Transaction: ${txHash}`);
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
      targetToken={displayTargetToken(swapData)}
      swapId={swapId}
      title={`Refund ${swapData.source_token.symbol} → ${swapData.target_token.symbol}`}
    >
      <div className="space-y-6">
        {/* Status line */}
        {!refundSuccess && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {primary === "sponsored" ? (
              <>
                <Clock className="h-4 w-4 text-green-500" />
                <span>Refund available · gasless</span>
              </>
            ) : primary === "timelock" ? (
              <>
                <Clock className="h-4 w-4 text-green-500" />
                <span>Refund available via wallet transaction</span>
              </>
            ) : primary === "collab" ? (
              <>
                <Zap className="h-4 w-4 text-blue-500" />
                <span>
                  {collabGasless
                    ? `Instant refund available · gasless${collabNeedsSignature ? ", wallet signature required" : ""}`
                    : "Instant refund available · sent from your wallet, which pays gas"}
                </span>
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-lime-400" />
                <span>Refund available in {timeRemaining}</span>
              </>
            )}
          </div>
        )}

        {/* Retry with a new invoice: the stuck Lightning payout, not a refund */}
        {retryAvailable && !refundSuccess && !retrySuccess && (
          <div className="space-y-2 rounded-lg border border-blue-500/30 bg-blue-50 p-4 dark:bg-blue-950/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw className="h-4 w-4 text-blue-500" />
              Retry with a new invoice
            </div>
            <p className="text-xs text-muted-foreground">
              The server could not pay your invoice. Paste a new one for at most
              the same amount, valid for at least 30 minutes, and the locked
              funds move to it instead of being refunded
              {swapData.gasless
                ? "."
                : "; your wallet signs the authorization and sends the transaction."}
            </p>
            <Textarea
              value={newInvoice}
              onChange={(e) => setNewInvoice(e.target.value)}
              placeholder="lnbc…"
              className="font-mono text-xs"
              disabled={isRetrying}
            />
            <Button
              onClick={() => handleRetryWithInvoice()}
              disabled={
                isRetrying ||
                isRefunding ||
                !newInvoice.trim() ||
                (!swapData.gasless && !address)
              }
              className="h-10 w-full"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Moving the lock...
                </>
              ) : (
                "Retry with this invoice"
              )}
            </Button>
            {retryError && (
              <SupportErrorBanner
                message="Retry failed"
                error={retryError}
                swapId={swapId}
              />
            )}
          </div>
        )}
        {retrySuccess && (
          <Alert>
            <AlertDescription>{retrySuccess}</AlertDescription>
          </Alert>
        )}

        {/* Primary refund button */}
        {!refundSuccess && !retryBlocksRefund && primary !== "none" && (
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => handleRefund()}
              disabled={
                isRefunding || isRetrying || (primaryNeedsWallet && !address)
              }
              className="h-12 w-full text-base font-semibold"
            >
              {isRefunding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : primary === "sponsored" ? (
                sponsoredFailed ? (
                  "Try gasless refund again"
                ) : (
                  `Refund as ${htlcTokenSymbol} (gasless)`
                )
              ) : (
                `Refund as ${htlcTokenSymbol}`
              )}
            </Button>
            {(primary === "timelock" || walletFallback) && !address && (
              <Alert variant="destructive">
                <AlertDescription>
                  Connect your wallet to refund via wallet transaction
                </AlertDescription>
              </Alert>
            )}
            {/* After a failed sponsored refund: the wallet pays gas, and the
                refund still goes to the swap's depositor account */}
            {walletFallback && (
              <Button
                onClick={() => handleManualRefund()}
                disabled={isRefunding || isRetrying || !address}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Refund with wallet as {htlcTokenSymbol} (you pay gas)
              </Button>
            )}
            {swapData.gasless && (primary === "timelock" || walletFallback) && (
              <p className="text-xs text-muted-foreground">
                This swap was funded gasless, so the refund goes to the address
                this site keeps for your swaps, not to your wallet.
              </p>
            )}
            {/* The server may still sign an early refund that saves the gas */}
            {secondaryCollab && (
              <Button
                onClick={() => handleCollabRefund()}
                disabled={
                  isRefunding || isRetrying || (collabNeedsWallet && !address)
                }
                variant="outline"
                size="sm"
                className="w-full"
              >
                Try instant refund (gasless)
              </Button>
            )}
          </div>
        )}

        {/* No refund path available - collab unavailable and timelock not passed */}
        {!refundSuccess && primary === "none" && (
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
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{targetSymbol}</span>
            <span className="ml-1 text-muted-foreground">
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
            <p className="break-all font-mono text-muted-foreground">
              {swapData.evm_htlc_address}
            </p>
          </div>
        </div>

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
