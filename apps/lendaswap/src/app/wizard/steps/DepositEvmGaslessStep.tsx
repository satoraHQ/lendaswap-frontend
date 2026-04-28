import {
  type EvmToArkadeSwapResponse,
  type EvmToBitcoinSwapResponse,
  type EvmToLightningSwapResponse,
  isArkade,
  isBtcOnchain,
  isLightning,
  toChainName,
} from "@lendasat/lendaswap-sdk-pure";
import { AlertCircle, Check, Clock, Loader } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { createPublicClient, erc20Abi } from "viem";
import { Button } from "#/components/ui/button";
import { api } from "../../api";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import { buildTransport } from "../../utils/evmTransport";
import {
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

interface EvmDepositGaslessStepProps {
  swapData:
    | EvmToArkadeSwapResponse
    | EvmToBitcoinSwapResponse
    | EvmToLightningSwapResponse;
  swapId: string;
}

export function DepositEvmGaslessStep({
  swapData,
  swapId,
}: EvmDepositGaslessStepProps) {
  const navigate = useNavigate();

  const [isFunding, setIsFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [funded, setFunded] = useState(false);

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

  const handleFundGasless = async () => {
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
      setIsFunding(false);
    }
  };

  return (
    <DepositCard
      sourceToken={swapData.source_token}
      targetToken={swapData.target_token}
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
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Deposit</span>
          {hasSufficientBalance ? (
            <span className="font-medium text-green-600 dark:text-green-400 flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              {balanceDisplay} {tokenSymbol} received
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1.5">
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

      {/* Expiry warning */}
      {isExpired && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          This swap has expired. Funding is no longer possible.
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {hasSufficientBalance
          ? `${tokenSymbol} received. Click Fund Swap to complete - no wallet connection or gas needed.`
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
            className="h-12 w-full text-base font-semibold bg-black text-white hover:bg-black/90"
          >
            {isFunding ? (
              <>
                <Loader className="animate-spin h-4 w-4 mr-2" />
                Funding...
              </>
            ) : !hasSufficientBalance ? (
              <>
                <Loader className="animate-spin h-4 w-4 mr-2" />
                Waiting for {tokenSymbol}...
              </>
            ) : (
              "Fund Swap"
            )}
          </Button>
        )}

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
