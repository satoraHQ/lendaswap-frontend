import {
  type EvmToArkadeSwapResponse,
  type EvmToBitcoinSwapResponse,
  type EvmToLightningSwapResponse,
  isBtcOnchain,
  isLightning,
  isUserRejection,
  toChainName,
} from "@lendasat/lendaswap-sdk-pure";
import { useAppKit } from "@reown/appkit/react";
import {
  AlertCircle,
  Check,
  Circle,
  Clock,
  Loader,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type {
  Account,
  Transport,
  Chain as ViemChain,
  WalletClient,
} from "viem";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { Button } from "#/components/ui/button";
import { api } from "../../api";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import { buildEvmSigner } from "../../utils/evmSigner";
import {
  getTargetChainDisplayName,
  getViemChain,
} from "../../utils/tokenUtils";
import { AmountRow, AmountSummary, DepositCard } from "../components";

type StepStatus = "pending" | "active" | "completed" | "error";

interface StepState {
  status: StepStatus;
  error?: string;
}

interface EvmDepositStepProps {
  swapData:
    | EvmToArkadeSwapResponse
    | EvmToBitcoinSwapResponse
    | EvmToLightningSwapResponse;
  swapId: string;
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return <Check className="h-4 w-4 text-green-500" />;
    case "active":
      return <Loader className="text-primary h-4 w-4 animate-spin" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Circle className="text-muted-foreground/40 h-4 w-4" />;
  }
}

export function DepositEvmStep({ swapData, swapId }: EvmDepositStepProps) {
  const navigate = useNavigate();
  const chain = getViemChain(swapData.source_token.chain);

  const { address, chainId: currentChainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { open } = useAppKit();

  // Expiry countdown — field name depends on swap type
  const refundLocktime = isBtcOnchain(swapData.target_token)
    ? ((swapData as EvmToBitcoinSwapResponse).btc_refund_locktime ?? 0)
    : ((swapData as EvmToArkadeSwapResponse | EvmToLightningSwapResponse)
        .vhtlc_refund_locktime ?? 0);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!refundLocktime) return;
    const interval = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(interval);
  }, [refundLocktime]);
  const isExpired = refundLocktime > 0 && now >= refundLocktime;
  const timeRemaining = useMemo(() => {
    if (!refundLocktime || isExpired) return null;
    const secondsLeft = refundLocktime - now;
    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = secondsLeft % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, [now, refundLocktime, isExpired]);

  const [steps, setSteps] = useState<Record<string, StepState>>({
    switchChain: { status: "pending" },
    fund: { status: "pending" },
  });

  const [isRunning, setIsRunning] = useState(false);
  const [userRejected, setUserRejected] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  // Open wallet connect dialog if not connected
  useEffect(() => {
    if (!address) {
      open().catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open may not be referentially stable
  }, [address, open]);

  // Auto-mark switchChain as completed if already on the correct chain
  useEffect(() => {
    if (chain && currentChainId === chain.id) {
      setSteps((prev) => ({
        ...prev,
        switchChain: { status: "completed" },
      }));
    }
  }, [currentChainId, chain]);

  const tokenSymbol = swapData.source_token.symbol;
  const sourceDecimals = swapData.source_token.decimals;
  const sourceAmount = (
    Number(swapData.source_amount) /
    10 ** sourceDecimals
  ).toFixed(sourceDecimals);

  const targetDecimals = swapData.target_token.decimals;
  const targetAmount = (
    Number(swapData.target_amount) /
    10 ** targetDecimals
  ).toFixed(targetDecimals);

  const receiveLabel = isLightning(swapData.target_token)
    ? "We will send"
    : "You Receive";

  const handleFund = async () => {
    if (!address) {
      open().catch(console.error);
      return;
    }
    if (!walletClient || !chain) {
      open().catch(console.error);
      return;
    }
    if (!switchChainAsync) return;

    setIsRunning(true);
    setUserRejected(false);
    setFundError(null);

    const updateStep = (key: string, state: StepState) => {
      setSteps((prev) => ({ ...prev, [key]: state }));
    };

    try {
      // 1. Switch chain if needed
      if (currentChainId !== chain.id) {
        updateStep("switchChain", { status: "active" });
        await switchChainAsync({ chainId: chain.id });
      }
      updateStep("switchChain", { status: "completed" });

      // 2. Fund swap (approve + sign + send — all handled by the SDK)
      updateStep("fund", { status: "active" });
      const signer = buildEvmSigner(
        walletClient as WalletClient<Transport, ViemChain, Account>,
        chain,
      );
      await api.fundSwap(swapId, signer);
      updateStep("fund", { status: "completed" });

      // Wizard polling will detect the status change and advance
    } catch (err) {
      console.error("Fund error:", err);
      if (isUserRejection(err)) {
        setUserRejected(true);
        // Reset the active step back to pending so user can retry
        setSteps((prev) => {
          const updated = { ...prev };
          for (const key of Object.keys(updated)) {
            if (updated[key].status === "active") {
              updated[key] = { status: "pending" };
            }
          }
          return updated;
        });
      } else {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setFundError(msg);
        updateStep("fund", { status: "error", error: msg });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const chainLabel = chain?.name ?? toChainName(swapData.source_token.chain);

  const stepDefs = [
    { key: "switchChain", label: `Switch to ${chainLabel}` },
    { key: "fund", label: "Approve & fund swap" },
  ];

  const allCompleted = stepDefs.every(
    (s) => steps[s.key]?.status === "completed",
  );
  const hasError = stepDefs.some((s) => steps[s.key]?.status === "error");

  return (
    <DepositCard
      sourceToken={swapData.source_token}
      targetToken={swapData.target_token}
      swapId={swapId}
      title={`${tokenSymbol} → ${swapData.target_token.symbol}`}
    >
      <AmountSummary>
        <AmountRow
          label="You Send"
          value={`${sourceAmount} ${tokenSymbol} on ${toChainName(swapData.source_token.chain)}`}
        />
        <AmountRow
          label={receiveLabel}
          value={`~${targetAmount} ${swapData.target_token.symbol} on ${getTargetChainDisplayName(swapData)}`}
        />
        <AmountRow
          label="Fee"
          value={`${swapData.fee_sats.toLocaleString()} sats`}
        />
      </AmountSummary>

      {/* Expiry warning */}
      {isExpired ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          This swap has expired. Funding is no longer possible.
        </div>
      ) : timeRemaining ? (
        <div className="border-border bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-lg border p-3 text-sm">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Time remaining to fund:{" "}
            <span className="font-mono font-medium">{timeRemaining}</span>
          </span>
        </div>
      ) : null}

      {/* Step checklist */}
      <div className="space-y-4">
        <p className="text-muted-foreground text-xs">
          Your wallet approves and submits all transactions directly.
        </p>
        <div className="space-y-2">
          {stepDefs.map(({ key, label }) => {
            const step = steps[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <StepIcon status={step.status} />
                <span
                  className={`flex-1 text-sm ${
                    step.status === "completed"
                      ? "text-muted-foreground line-through"
                      : step.status === "error"
                        ? "text-red-500"
                        : step.status === "active"
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
                {step.status === "error" && !isExpired && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={handleFund}
                    disabled={isRunning}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Retry
                  </Button>
                )}
              </div>
            );
          })}
          {/* Show error message below the failed step */}
          {fundError && (
            <div className="ml-7">
              <SupportErrorBanner
                message="Funding transaction failed"
                error={fundError}
                swapId={swapId}
              />
            </div>
          )}
          {userRejected && (
            <div className="ml-7 rounded-lg border border-lime-400 bg-lime-50 p-2 text-xs text-lime-500 dark:bg-lime-950/20">
              You rejected the request in your wallet. Click the button below to
              try again.
            </div>
          )}
        </div>
      </div>

      {/* Wallet Connection Warning */}
      {!address && (
        <div className="rounded-lg border border-lime-400 bg-lime-50 p-3 text-sm text-lime-500 dark:bg-lime-950/20">
          Please connect your wallet to continue
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        {!address ? (
          <Button
            onClick={() => open().catch(console.error)}
            className="h-12 w-full text-base font-semibold"
          >
            Connect Wallet
          </Button>
        ) : !allCompleted && !isExpired ? (
          <Button
            onClick={handleFund}
            disabled={isRunning}
            className="h-12 w-full bg-black text-base font-semibold text-white hover:bg-black/90"
          >
            {isRunning ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : hasError ? (
              "Retry"
            ) : (
              "Fund Swap"
            )}
          </Button>
        ) : null}

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
