import {
  type EvmToArkadeSwapResponse,
  type EvmToBitcoinSwapResponse,
  type EvmToLightningSwapResponse,
  isArkade,
  isBtcOnchain,
  isLightning,
  toChainName,
} from "@satora/swap";
import { AlertCircle, Check, Clock, Loader } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { createPublicClient, erc20Abi } from "viem";
import { Button } from "#/components/ui/button";
import { api } from "../../api";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import { buildTransport } from "../../utils/evmTransport";
import { totalFeeSats } from "../../utils/feeUtils";
import {
  displaySourceToken,
  displayTargetToken,
  getBlockexplorerAddressLink,
  getTargetChainDisplayName,
  getViemChain,
} from "../../utils/tokenUtils";
import {
  AddressDisplay,
  AmountRow,
  AmountSummary,
  DepositCard,
  QrCodeSection,
} from "../components";
import { useCopyToClipboard } from "../components/useCopyToClipboard";
import { WalletDepositButton } from "../components/WalletDepositButton";

interface EvmDepositGaslessStepProps {
  swapData:
    | EvmToArkadeSwapResponse
    | EvmToBitcoinSwapResponse
    | EvmToLightningSwapResponse;
  swapId: string;
  autoFund?: boolean;
}

export function DepositEvmGaslessStep({
  swapData,
  swapId,
  autoFund = false,
}: EvmDepositGaslessStepProps) {
  const navigate = useNavigate();
  const { copiedValue, handleCopy } = useCopyToClipboard();

  const [isFunding, setIsFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [funded, setFunded] = useState(false);

  // ── Funding capability ────────────────────────────────────────────────
  // On chains where the SDK submits the funding itself as a sponsored
  // UserOp, a missing AA configuration means a deposit could never be
  // moved into the swap. Checked up front so the user is not asked to
  // deposit before the problem surfaces.
  const setupKey = `${swapId}:${swapData.source_token.chain}`;
  const [checkedSetup, setCheckedSetup] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .gaslessFundingPlan(Number(swapData.source_token.chain))
      .then((plan) => {
        if (plan.mode === "self-paid") {
          throw new Error("Gasless deposits require sponsored funding.");
        }
        if (!cancelled) {
          setSetupError(null);
          setCheckedSetup(setupKey);
        }
      })
      .catch((err) => {
        console.error("Gasless funding unavailable:", err);
        if (!cancelled) {
          setCheckedSetup(setupKey);
          setSetupError(
            err instanceof Error ? err.message : "Gasless funding unavailable",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setupKey, swapData.source_token.chain]);

  // ── Balance polling ────────────────────────────────────────────────────
  const chain = getViemChain(swapData.source_token.chain);
  const tokenAddress = swapData.source_token.token_id as `0x${string}`;
  const depositAddress = swapData.client_evm_address as `0x${string}`;
  const requiredAmount = BigInt(swapData.source_amount);

  const rpcClient = useMemo(() => {
    if (!chain) return null;
    return createPublicClient({ chain, transport: buildTransport(chain) });
  }, [chain]);

  const [balance, setBalance] = useState<bigint | null>(null);
  const hasSufficientBalance = balance !== null && balance >= requiredAmount;

  useEffect(() => {
    if (!rpcClient || funded) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const bal = await rpcClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [depositAddress],
        });
        if (!cancelled) setBalance(bal);
      } catch (err) {
        console.error("Balance poll error:", err);
      }
    };

    // Poll immediately, then every 3 seconds
    poll();
    const interval = setInterval(poll, 3_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [rpcClient, tokenAddress, depositAddress, funded]);

  // ── Expiry countdown ──────────────────────────────────────────────────
  // For a Lightning target the invoice expiry is the deadline: the server
  // pays it once the deposit is final, so funding after expiry only refunds.
  const refundLocktime = isLightning(swapData.target_token)
    ? ((swapData as EvmToLightningSwapResponse).invoice_expires_at ?? 0)
    : isBtcOnchain(swapData.target_token)
      ? ((swapData as EvmToBitcoinSwapResponse).btc_refund_locktime ?? 0)
      : ((swapData as EvmToArkadeSwapResponse).vhtlc_refund_locktime ?? 0);
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

  // ── Display values ────────────────────────────────────────────────────
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
    : isArkade(swapData.target_token)
      ? "You Receive"
      : "You Receive";

  const chainName = toChainName(swapData.source_token.chain);
  const explorerUrl = getBlockexplorerAddressLink(
    swapData.source_token.chain,
    depositAddress,
  );

  const balanceDisplay =
    balance !== null
      ? (Number(balance) / 10 ** sourceDecimals).toFixed(sourceDecimals)
      : "-";

  const qrValue = depositAddress;

  const fundingInFlight = useRef(false);
  const autoAttempted = useRef(false);
  const handleFundGasless = useCallback(async () => {
    if (fundingInFlight.current) return;
    fundingInFlight.current = true;
    setIsFunding(true);
    setFundError(null);
    try {
      await api.fundSwapGasless(swapId);
      setFunded(true);
    } catch (err) {
      console.error("Gasless fund error:", err);
      setFundError(
        err instanceof Error ? err.message : "Gasless funding failed",
      );
    } finally {
      fundingInFlight.current = false;
      setIsFunding(false);
    }
  }, [swapId]);

  useEffect(() => {
    if (
      !autoFund ||
      !hasSufficientBalance ||
      isExpired ||
      funded ||
      autoAttempted.current
    )
      return;
    autoAttempted.current = true;
    void handleFundGasless();
  }, [autoFund, hasSufficientBalance, isExpired, funded, handleFundGasless]);

  if (autoFund)
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Fund payment</h2>
          <span className="text-sm text-muted-foreground">
            {isExpired
              ? "Funding expired"
              : timeRemaining
                ? `Expires in ${timeRemaining}`
                : ""}
          </span>
        </div>
        {!isExpired && !funded && (
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="mx-auto w-full max-w-64 rounded-2xl border bg-white p-4">
              <QRCodeSVG
                value={qrValue}
                size={240}
                className="h-auto w-full"
                level="M"
                aria-label="Deposit address QR code"
                role="img"
              />
            </div>
            <div className="min-w-0 space-y-6">
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  Send exactly
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="break-all text-2xl font-semibold">
                    {sourceAmount} {tokenSymbol}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => handleCopy(sourceAmount)}
                  >
                    {copiedValue === sourceAmount ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  on {chainName} network only
                </p>
              </div>
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  To deposit address
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-xl bg-muted/50 p-3 text-sm">
                    {depositAddress}
                  </code>
                  <Button
                    variant="outline"
                    onClick={() => handleCopy(depositAddress)}
                  >
                    {copiedValue === depositAddress ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              {chain && rpcClient && (
                <WalletDepositButton
                  key={swapId}
                  swapId={swapId}
                  chainId={chain.id}
                  chainName={chainName}
                  token={tokenAddress}
                  recipient={depositAddress}
                  amount={requiredAmount}
                  deadline={refundLocktime}
                  disabled={
                    isExpired || funded || isFunding || hasSufficientBalance
                  }
                  client={rpcClient}
                />
              )}
            </div>
          </div>
        )}
        {(isExpired || funded || hasSufficientBalance) && (
          <p role="status" className="text-sm text-muted-foreground">
            {isExpired
              ? "Funding has expired. Do not send tokens to this payment."
              : funded
                ? "Funding submitted. Waiting for network confirmation."
                : "Deposit detected. Your payment is being funded automatically."}
          </p>
        )}
        {fundError && (
          <>
            <SupportErrorBanner
              message="Gasless funding failed"
              error={fundError}
              swapId={swapId}
            />
            <Button
              disabled={isFunding || isExpired || !hasSufficientBalance}
              onClick={handleFundGasless}
            >
              {isFunding ? "Retrying…" : "Retry funding"}
            </Button>
          </>
        )}
      </div>
    );

  // Funding cannot complete on this client: say so instead of directing
  // the user to deposit into an account the funding could not move.
  if (checkedSetup !== setupKey) {
    return <p role="status">Checking gasless funding availability…</p>;
  }

  if (setupError) {
    return (
      <DepositCard
        sourceToken={displaySourceToken(swapData)}
        targetToken={displayTargetToken(swapData)}
        swapId={swapId}
        title={`${tokenSymbol} → ${swapData.target_token.symbol}`}
      >
        <SupportErrorBanner
          message="Gasless funding is not available"
          error={setupError}
          swapId={swapId}
        />
        <p className="text-xs text-muted-foreground text-center">
          Do not send {tokenSymbol} to this swap — the deposit could not be
          completed. Cancel the swap and try again, or contact support.
        </p>
        <Button
          variant="outline"
          className="h-12 w-full"
          onClick={() => navigate("/")}
        >
          Cancel Swap
        </Button>
      </DepositCard>
    );
  }

  return (
    <DepositCard
      sourceToken={displaySourceToken(swapData)}
      targetToken={displayTargetToken(swapData)}
      swapId={swapId}
      title={`${tokenSymbol} → ${swapData.target_token.symbol}`}
    >
      <QrCodeSection value={qrValue} />
      <AddressDisplay
        label={`Deposit Address (${chainName})`}
        value={depositAddress}
        explorerUrl={explorerUrl}
      />
      <AmountSummary>
        <AmountRow
          label="You Send"
          value={`${sourceAmount} ${tokenSymbol} on ${chainName}`}
          copyValue={sourceAmount}
          copiable
        />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Deposit</span>
          {hasSufficientBalance ? (
            <span className="flex items-center gap-1.5 font-medium text-green-600 dark:text-green-400">
              <Check className="h-3.5 w-3.5" />
              {balanceDisplay} {tokenSymbol} received
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader className="h-3.5 w-3.5 animate-spin" />
              Waiting for {sourceAmount} {tokenSymbol}...
            </span>
          )}
        </div>
        <AmountRow
          label={receiveLabel}
          value={`~${targetAmount} ${swapData.target_token.symbol} on ${getTargetChainDisplayName(swapData)}`}
        />
        <AmountRow
          label="Fee"
          value={`${totalFeeSats(swapData).toLocaleString()} sats`}
        />
        {timeRemaining && (
          <div className="flex justify-between border-t border-border/50 pt-1 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Expires in
            </span>
            <span className="font-mono font-medium">{timeRemaining}</span>
          </div>
        )}
      </AmountSummary>

      {/* Expiry warning */}
      {isExpired && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          This swap has expired. Funding is no longer possible.
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {hasSufficientBalance
          ? autoFund
            ? `${tokenSymbol} received. Your payment proceeds automatically; keep this page open.`
            : `${tokenSymbol} received. Click Fund Swap to complete - no wallet connection or gas needed.`
          : `Send ${sourceAmount} ${tokenSymbol} to the address above. This page updates automatically once payment is detected.`}
      </p>

      {/* Fund error */}
      {fundError && (
        <SupportErrorBanner
          message="Gasless funding failed"
          error={fundError}
          swapId={swapId}
        />
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        {!isExpired && !funded && (
          <Button
            onClick={handleFundGasless}
            disabled={isFunding || !hasSufficientBalance}
            className="h-12 w-full text-base font-semibold"
          >
            {isFunding ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Funding...
              </>
            ) : !hasSufficientBalance ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Waiting for {tokenSymbol}...
              </>
            ) : fundError ? (
              "Retry funding"
            ) : autoFund ? (
              "Processing deposit…"
            ) : (
              "Fund Swap"
            )}
          </Button>
        )}

        <Button
          variant="outline"
          className="h-12 w-full"
          onClick={() => navigate("/swaps")}
        >
          Back to swaps
        </Button>
      </div>
    </DepositCard>
  );
}
