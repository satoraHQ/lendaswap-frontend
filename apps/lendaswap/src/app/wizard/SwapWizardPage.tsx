import type {
  ArkadeToEvmSwapResponse,
  ArkadeToLightningSwapResponse,
  BitcoinToEvmSwapResponse,
  BtcToArkadeSwapResponse,
  EvmToArkadeSwapResponse,
  EvmToBitcoinSwapResponse,
  EvmToLightningSwapResponse,
  GetSwapResponse,
  LightningToArkadeSwapResponse,
  LightningToEvmSwapResponse,
  SwapStatus,
} from "@lendasat/lendaswap-sdk-pure";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAsyncRetry } from "react-use";
import { api } from "../api";
import { SupportErrorBanner } from "../components/SupportErrorBanner";
import { db } from "../db";
import { assertNever } from "../utils/assertNever";
import {
  CctpInboundRecoveryStep,
  DepositArkadeStep,
  DepositBitcoinStep,
  DepositEvmGaslessStep,
  DepositEvmStep,
  RefundArkadeStep,
  RefundBitcoinStep,
  RefundEvmStep,
  RefundedStep,
  RefundLightningStep,
  SuccessStep,
  SwapProcessingStep,
} from "./steps";
import { BridgingCctpStep } from "./steps/BridgingCctpStep";
import { DepositLightningStep } from "./steps/DepositLightningStep";

export type SwapDirection =
  | "btc-to-evm"
  | "evm-to-btc"
  | "btc-to-arkade"
  | "onchain-to-evm"
  | "arkade-to-evm"
  | "evm-to-arkade";

type StepId =
  | "user-deposit"
  | "user-deposit-seen"
  | "server-depositing"
  | "server-deposit"
  | "user-redeem"
  | "server-redeem"
  | "success"
  | "expired"
  | "refundable"
  | "refunded";

function determineStepFromStatus(
  swapData: null | undefined | GetSwapResponse,
): StepId | undefined {
  if (!swapData) {
    return undefined;
  }

  // Get the user-side refund locktime based on swap direction
  const getRefundLocktime = (): number | undefined => {
    switch (swapData.direction) {
      case "btc_to_arkade":
        return swapData.vhtlc_refund_locktime;
      case "bitcoin_to_evm":
        return swapData.evm_refund_locktime;
      case "arkade_to_evm":
        return swapData.vhtlc_refund_locktime;
      case "evm_to_arkade":
        return swapData.evm_refund_locktime;
      case "evm_to_bitcoin":
        return swapData.evm_refund_locktime;
      case "lightning_to_evm":
        return swapData.vhtlc_refund_locktime;
      case "lightning_to_arkade":
        return swapData.vhtlc_refund_locktime;
      case "evm_to_lightning":
        return swapData.evm_refund_locktime;
      case "arkade_to_lightning":
        return swapData.vhtlc_refund_locktime;
    }
  };

  const refundLocktime = getRefundLocktime();
  const refundLocktimeDate = refundLocktime
    ? new Date(Number(refundLocktime) * 1000)
    : undefined;
  const isRefundTimelockExpired =
    refundLocktimeDate !== undefined && refundLocktimeDate < new Date();

  // Arkade-to-EVM and Arkade-to-Lightning swaps support collaborative refund (instant, no locktime
  // wait) but only in statuses where the swap has clearly failed - NOT in `clientfunded` which is
  // the normal progression (server hasn't funded yet).
  //
  // TODO: `clientfunded` could also benefit from a collab refund escape hatch (e.g. if the server
  // is down and never funds the EVM HTLC). The challenge is deciding when to show it - any timeout
  // is arbitrary and risks users refunding a swap that was about to succeed. A possible approach:
  // show a "having trouble? refund now" link after N seconds on the processing screen. For now, if
  // the server truly fails the swap will transition to `clientfundedtoolate` / `expired` and collab
  // refund kicks in then.

  const supportsInstantRefund =
    swapData.direction === "arkade_to_evm" ||
    swapData.direction === "arkade_to_lightning";

  switch (swapData.status) {
    case "pending":
      return "user-deposit";

    case "clientfundingseen":
      return isRefundTimelockExpired ? "refundable" : "user-deposit-seen";

    case "clientfunded":
    case "serverfunded":
      return isRefundTimelockExpired ? "refundable" : "server-depositing";
    case "serverredeemed":
    case "clientredeeming":
    case "clientredeemed":
      return "success";
    case "expired":
      return "expired";
    case "clientfundedserverrefunded":
    case "clientinvalidfunded":
    case "clientfundedtoolate":
      return "refundable";

    case "serverwontfund":
      return supportsInstantRefund || isRefundTimelockExpired
        ? "refundable"
        : "server-depositing";

    case "clientrefundedserverfunded":
    case "clientrefundedserverrefunded":
    case "clientrefunded":
      return "refunded";

    case "clientredeemedandclientrefunded":
      return "refunded";
  }

  return assertNever(
    swapData.status,
    "Unhandled SwapStatus in determineStepFromStatus",
  );
}

export function SwapWizardPage() {
  // const posthog = usePostHog();
  const { swapId } = useParams<{ swapId: string }>();
  const navigate = useNavigate();

  //
  useEffect(() => {
    document.title = "Swap in Progress | Satora";
  }, []);

  // Reactively watch for an in-flight CCTP-inbound bridging session on this
  // swap. If one exists and isn't done, the wizard renders BridgingCctpStep
  // in place of the normal deposit step. Deletion inside the step triggers
  // a re-render and the standard flow takes over.
  const cctpSession = useLiveQuery(
    () => (swapId ? db.cctpInboundSessions.get(swapId) : undefined),
    [swapId],
  );
  const hasActiveCctpSession =
    !!cctpSession &&
    cctpSession.phase !== "done" &&
    cctpSession.phase !== "submitted";

  const lastStatusRef = useRef<SwapStatus | null>(null);
  const [displaySwapData, setDisplaySwapData] =
    useState<GetSwapResponse | null>(null);
  const [currentStep, setCurrentStep] = useState<StepId | undefined>();

  const {
    loading: isLoading,
    value: swapData,
    retry,
    error,
  } = useAsyncRetry(async () => {
    if (!swapId) {
      navigate("/", { replace: true });
      return;
    }

    return await api.getSwap(swapId);
  }, [swapId]);

  if (error) {
    // TODO: show error in frontend
    console.error(`Failed fetching swap ${error}`);
  }

  // Update display data when swap data changes and status is different
  useEffect(() => {
    if (!swapData) return;

    const statusChanged = swapData.response.status !== lastStatusRef.current;

    if (statusChanged || !displaySwapData) {
      console.log(
        `Swap data updated: status=${JSON.stringify(swapData.response.status)}, source=${JSON.stringify(swapData.response.source_token)}, target=${JSON.stringify(swapData.response.target_token)}`,
      );
      lastStatusRef.current = swapData.response.status;
      setDisplaySwapData(swapData.response);
      setCurrentStep(determineStepFromStatus(swapData.response));
    }
  }, [swapData, displaySwapData]);
  //
  const swapDirectionValue = displaySwapData?.direction;

  // Subscribe to swap status updates via WebSocket (replaces 2s polling).
  useEffect(() => {
    if (!swapId || !swapData) return;

    const statusIsTerminal = {
      pending: false,
      clientfundingseen: false,
      clientfunded: false,
      clientrefunded: true,
      serverfunded: false,
      clientredeeming: false,
      clientredeemed: false,
      serverredeemed: true,
      clientfundedserverrefunded: false,
      clientrefundedserverfunded: true,
      clientrefundedserverrefunded: true,
      expired: true,
      clientinvalidfunded: false,
      clientfundedtoolate: false,
      serverwontfund: false,
      clientredeemedandclientrefunded: true,
    } satisfies Record<SwapStatus, boolean>;

    if (displaySwapData && statusIsTerminal[displaySwapData.status]) {
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    api
      .subscribeToSwaps([swapId], (_id, status) => {
        console.log(`ws status update: ${status}`);
        if (!displaySwapData || status !== displaySwapData.status) {
          retry();
          return;
        }
        const next = determineStepFromStatus({ ...displaySwapData, status });
        if (next === "refundable") retry();
      })
      .then((unsub) => {
        if (cancelled) unsub();
        else unsubscribe = unsub;
      })
      .catch((err) =>
        console.error("Failed to subscribe to swap status:", err),
      );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [swapId, retry, displaySwapData, swapData]);

  // Locktime-based refundability can flip without a status change, so the
  // WS subscription above won't catch it.  Re-evaluate the step from local
  // data every 30s and trigger a refresh when it transitions to refundable.
  useEffect(() => {
    if (!displaySwapData) return;

    const terminalStates: SwapStatus[] = [
      "clientredeemed",
      "serverredeemed",
      "expired",
      "clientrefundedserverfunded",
      "clientrefundedserverrefunded",
      "clientrefunded",
    ];
    if (terminalStates.includes(displaySwapData.status)) return;

    const id = setInterval(() => {
      if (determineStepFromStatus(displaySwapData) === "refundable") {
        retry();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [displaySwapData, retry]);

  return (
    <>
      {/* Error State */}
      {error && (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
          <div className="space-y-4 px-6 py-6">
            <SupportErrorBanner
              message="Failed to load swap"
              error={String(error)}
              swapId={swapId}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => retry()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Not Found State */}
      {!isLoading && !error && !swapData && swapId && (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
          <div className="bg-warning/10 space-y-4 px-6 py-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-warning h-6 w-6" />
              <h3 className="text-xl font-semibold">Swap Not Found</h3>
            </div>
            <p className="text-muted-foreground">
              The swap with ID{" "}
              <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                {swapId}
              </code>{" "}
              could not be found.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go Home
              </button>
              <button
                type="button"
                onClick={() => navigate("/swaps")}
                className="rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                View All Swaps
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !displaySwapData && (
        <div className="rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-center py-12">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-muted border-t-foreground" />
          </div>
        </div>
      )}

      {/* Step-specific content */}
      {displaySwapData && !error && (
        <>
          {currentStep === "user-deposit" && hasActiveCctpSession && (
            <BridgingCctpStep
              swapId={displaySwapData.id}
              swapData={
                displaySwapData as
                  | EvmToArkadeSwapResponse
                  | EvmToBitcoinSwapResponse
                  | EvmToLightningSwapResponse
              }
            />
          )}
          {currentStep === "user-deposit" && !hasActiveCctpSession && (
            <>
              {(swapDirectionValue === "arkade_to_evm" ||
                swapDirectionValue === "arkade_to_lightning") && (
                <DepositArkadeStep
                  swapData={
                    displaySwapData as
                      | ArkadeToEvmSwapResponse
                      | ArkadeToLightningSwapResponse
                  }
                />
              )}
              {(swapDirectionValue === "lightning_to_evm" ||
                swapDirectionValue === "lightning_to_arkade") && (
                <DepositLightningStep
                  swapData={
                    displaySwapData as
                      | LightningToEvmSwapResponse
                      | LightningToArkadeSwapResponse
                  }
                />
              )}
              {(swapDirectionValue === "bitcoin_to_evm" ||
                swapDirectionValue === "btc_to_arkade") && (
                <DepositBitcoinStep
                  swapData={
                    displaySwapData as
                      | BtcToArkadeSwapResponse
                      | BitcoinToEvmSwapResponse
                  }
                  swapId={displaySwapData.id}
                />
              )}
              {(swapDirectionValue === "evm_to_arkade" ||
                swapDirectionValue === "evm_to_bitcoin" ||
                swapDirectionValue === "evm_to_lightning") &&
                ((
                  displaySwapData as
                    | EvmToArkadeSwapResponse
                    | EvmToBitcoinSwapResponse
                    | EvmToLightningSwapResponse
                ).gasless ? (
                  <DepositEvmGaslessStep
                    swapData={
                      displaySwapData as
                        | EvmToArkadeSwapResponse
                        | EvmToBitcoinSwapResponse
                        | EvmToLightningSwapResponse
                    }
                    swapId={displaySwapData.id}
                  />
                ) : (
                  <DepositEvmStep
                    swapData={
                      displaySwapData as
                        | EvmToArkadeSwapResponse
                        | EvmToBitcoinSwapResponse
                        | EvmToLightningSwapResponse
                    }
                    swapId={displaySwapData.id}
                  />
                ))}
            </>
          )}

          {currentStep === "server-deposit" && (
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
              <div className="flex items-center gap-3 border-b border-border/50 bg-muted/30 px-6 py-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Swap ID:
                </p>
                <code className="flex-1 font-mono text-xs text-foreground">
                  {displaySwapData.id}
                </code>
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary/50" />
              </div>

              <div className="space-y-4 p-6">
                <h3 className="text-xl font-semibold">Processing Swap</h3>
                <p className="text-muted-foreground">
                  Please wait while we confirm your deposit and process the
                  swap...
                </p>
                <div className="flex items-center justify-center py-12">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-muted border-t-primary" />
                </div>
              </div>
            </div>
          )}

          {swapDirectionValue &&
            (currentStep === "user-deposit-seen" ||
              currentStep === "server-depositing") && (
              <SwapProcessingStep
                swapData={displaySwapData}
                swapId={displaySwapData.id}
              />
            )}

          {currentStep === "expired" && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-3 border-b border-border/50 bg-muted/30 px-6 py-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Swap ID:
                  </p>
                  <code className="flex-1 font-mono text-xs text-foreground">
                    {displaySwapData.id}
                  </code>
                  <div className="h-2 w-2 animate-pulse rounded-full bg-primary/50" />
                </div>

                <div className="space-y-4 p-6">
                  <h3 className="text-xl font-semibold text-destructive">
                    Swap Expired
                  </h3>
                  <p className="text-muted-foreground">
                    This swap has expired. The time window to complete the swap
                    has passed.
                  </p>
                </div>
              </div>

              {/* CCTP-inbound recovery: rendered only when a session with a
                  recorded burn_tx_hash exists — the component self-hides
                  otherwise. */}
              {cctpSession?.burn_tx_hash && (
                <CctpInboundRecoveryStep swapId={displaySwapData.id} />
              )}
            </div>
          )}

          {currentStep === "refundable" && (
            <>
              {(swapDirectionValue === "arkade_to_evm" ||
                swapDirectionValue === "arkade_to_lightning") && (
                <RefundArkadeStep
                  swapData={
                    displaySwapData as
                      | ArkadeToEvmSwapResponse
                      | ArkadeToLightningSwapResponse
                  }
                />
              )}

              {(swapDirectionValue === "evm_to_bitcoin" ||
                swapDirectionValue === "evm_to_arkade" ||
                swapDirectionValue === "evm_to_lightning") && (
                <RefundEvmStep
                  swapData={
                    displaySwapData as
                      | EvmToBitcoinSwapResponse
                      | EvmToArkadeSwapResponse
                      | EvmToLightningSwapResponse
                  }
                />
              )}

              {(swapDirectionValue === "lightning_to_evm" ||
                swapDirectionValue === "lightning_to_arkade") && (
                <RefundLightningStep
                  swapData={
                    displaySwapData as
                      | LightningToEvmSwapResponse
                      | LightningToArkadeSwapResponse
                  }
                />
              )}

              {(swapDirectionValue === "btc_to_arkade" ||
                swapDirectionValue === "bitcoin_to_evm") && (
                <RefundBitcoinStep
                  swapData={
                    displaySwapData as
                      | BtcToArkadeSwapResponse
                      | BitcoinToEvmSwapResponse
                  }
                />
              )}
            </>
          )}

          {currentStep === "success" && swapDirectionValue && (
            <SuccessStep swapData={displaySwapData} />
          )}

          {currentStep === "refunded" && (
            <RefundedStep swapData={displaySwapData} />
          )}
        </>
      )}
    </>
  );
}
