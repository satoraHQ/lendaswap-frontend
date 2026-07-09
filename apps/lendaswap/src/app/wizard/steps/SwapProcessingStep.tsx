import { useAppKit } from "@reown/appkit/react";
import type { GetSwapResponse } from "@satora/swap";
import {
  Check,
  CheckCheck,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "#/components/ui/button";
import { api } from "../../api";
import { SupportErrorBanner } from "../../components/SupportErrorBanner";
import { getSwapById } from "../../db";
import {
  deriveSolanaUsdcAta,
  isSolanaTokenAccount,
  resolveSolanaBridgeRecipient,
} from "../../utils/solana";
import {
  getBlockexplorerTxLink,
  getTokenIcon,
  getTokenNetworkIcon,
  isEthereumToken,
} from "../../utils/tokenUtils";

/** Directions where the user sends BTC and receives EVM tokens (auto-claim applies) */
function isBtcToEvmDirection(direction: GetSwapResponse["direction"]): boolean {
  return (
    direction === "bitcoin_to_evm" ||
    direction === "arkade_to_evm" ||
    direction === "lightning_to_evm"
  );
}

/** Directions where the user sends EVM and receives BTC */
function isEvmToBtcDirection(direction: GetSwapResponse["direction"]): boolean {
  return (
    direction === "evm_to_arkade" ||
    direction === "evm_to_bitcoin" ||
    direction === "evm_to_lightning"
  );
}

interface ConfirmingDepositStepProps {
  swapData: GetSwapResponse;
  swapId: string;
}

export function SwapProcessingStep({
  swapData,
  swapId,
}: ConfirmingDepositStepProps) {
  const [copiedTxId, setCopiedTxId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const hasClaimedRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 10;

  // Wallet client hooks for Ethereum claiming
  const { address } = useAccount();
  const { open } = useAppKit();

  // Helper function to sleep
  const sleep = useCallback(
    (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    [],
  );

  // Manual retry handler
  const handleManualRetry = async () => {
    setRetryCount(0);
    setClaimError(null);
    hasClaimedRef.current = false;
    const claimKey = `swap_${swapData.id}_claim_attempted`;
    localStorage.removeItem(claimKey);
  };

  // Auto-claim when server is funded (works for all directions via api.claim)
  useEffect(() => {
    const autoClaim = async () => {
      // Lightning-to-evm is claimed by the lightning client, skip auto-claim
      if (swapData.direction === "evm_to_lightning") return;
      if (swapData.status !== "serverfunded") return;

      const claimKey = `swap_${swapData.id}_claim_attempted`;
      const attemptTimestamp = localStorage.getItem(claimKey);

      // Check if we've exhausted retries
      if (attemptTimestamp && retryCount >= maxRetries) {
        console.log("Max retries reached for this swap, stopping");
        return;
      }

      if (hasClaimedRef.current || isClaiming) return;

      hasClaimedRef.current = true;
      setIsClaiming(true);
      setClaimError(null);

      try {
        // Exponential backoff: wait before retry (0s, 2s, 4s, 8s)
        if (retryCount > 0) {
          const backoffMs = 2 ** retryCount * 1000;
          console.log(`Waiting ${backoffMs}ms before retry ${retryCount}...`);
          await sleep(backoffMs);
        }

        console.log("Auto-claiming with parameters:", {
          swapId: swapData.id,
          retryCount,
        });

        // For Solana-bridge destinations the EIP-712 `destination` field
        // can only carry an EVM address, so the user's Solana wallet
        // (stored in `target_evm_address` as a string) has to be turned
        // into its USDC ATA and passed via `bridgeRecipient`. The
        // ATA-existence answer that drives the hookData / maxFee variant
        // is *pinned* at swap creation in IndexedDB so the burn always
        // matches the fee that was funded — see PR review for the
        // divergence failure mode this prevents.
        const bridgeTargetChain = (swapData as { bridge_target_chain?: string })
          .bridge_target_chain;
        const solanaWallet =
          bridgeTargetChain === "Solana"
            ? (swapData as { target_evm_address?: string }).target_evm_address
            : undefined;
        let claimOptions:
          | { bridgeRecipient?: string; bridgeRecipientWallet?: string }
          | undefined;
        if (solanaWallet) {
          // Last-line-of-defense tripwire: if the user pasted an SPL
          // token account address as their "Solana wallet" at create
          // time, deriving an ATA from it would route CCTP funds to a
          // PDA-of-PDA black hole. Fail terminally (no retry) and ask
          // the user to refund. RPC failure on the probe is treated as
          // inconclusive — we proceed rather than letting a flaky RPC
          // permanently brick claims.
          let isTokenAccount = false;
          try {
            isTokenAccount = await isSolanaTokenAccount(solanaWallet);
          } catch (err) {
            console.warn(
              "Solana token-account tripwire failed, proceeding without check:",
              err,
            );
          }
          if (isTokenAccount) {
            const message =
              "Destination address is a Solana token account, not a wallet. CCTP cannot deliver to a token account directly — please refund this swap and start a new one with your Solana wallet address.";
            console.error(message, { swapId, address: solanaWallet });
            setRetryCount(maxRetries);
            setClaimError(message);
            return;
          }
          const stored = await getSwapById(swapId).catch(() => undefined);
          const pinnedSetup = stored?.bridge_recipient_setup;
          if (pinnedSetup !== undefined) {
            // Pinned at create time: deterministic ATA + decision.
            const ata = await deriveSolanaUsdcAta(solanaWallet);
            claimOptions = {
              bridgeRecipient: ata,
              bridgeRecipientWallet: pinnedSetup ? solanaWallet : undefined,
            };
          } else {
            // Fallback: legacy / cross-device claim where the pin isn't
            // available locally. Re-probe and hope the recipient's ATA
            // state matches what was committed at create time.
            console.warn(
              "No pinned bridge_recipient_setup for swap",
              swapId,
              "— re-probing Solana RPC. Funded fee and burn-time fee may diverge.",
            );
            const resolved = await resolveSolanaBridgeRecipient(solanaWallet);
            claimOptions = {
              bridgeRecipient: resolved.ata,
              bridgeRecipientWallet: resolved.bridgeRecipientWallet,
            };
          }
        }

        const claimResponse = await api.claim(swapId, claimOptions);
        if (!claimResponse.success) {
          console.error("Auto-claim returned an unsuccessful response:", {
            swapId: swapData.id,
            retryCount,
            claimResponse,
          });

          setRetryCount(maxRetries);
          setClaimError(claimResponse.message);

          return;
        }

        console.log("Claim request completed successfully", {
          swapId: swapData.id,
          claimResponse,
        });

        // Success! Reset retry count
        setRetryCount(0);
      } catch (error) {
        console.error(
          `Failed to auto-claim (attempt ${retryCount + 1}/${maxRetries}):`,
          error,
        );
        const newRetryCount = retryCount + 1;
        setRetryCount(newRetryCount);

        if (newRetryCount >= maxRetries) {
          const errorMessage =
            error instanceof Error
              ? `${error.message} (Max retries reached)`
              : `Failed to claim tokens after ${maxRetries} attempts. Please try manually.`;
          setClaimError(errorMessage);
        } else {
          setClaimError(
            error instanceof Error
              ? `${error.message} (Retrying...)`
              : `Failed to claim tokens. Retrying...`,
          );
        }

        // Only remove localStorage flag if we haven't exhausted retries
        if (newRetryCount < maxRetries) {
          localStorage.removeItem(claimKey);
          hasClaimedRef.current = false;
        }
      } finally {
        setIsClaiming(false);
      }
    };

    autoClaim();
  }, [swapData, swapId, isClaiming, retryCount, sleep]);

  const handleCopyTxId = async (txId: string) => {
    try {
      await navigator.clipboard.writeText(txId);
      setCopiedTxId(txId);
      setTimeout(() => setCopiedTxId(null), 2000);
    } catch (err) {
      console.error("Failed to copy transaction ID:", err);
    }
  };

  const clipTxId = (txId: string) => {
    return `${txId.slice(0, 8)}...${txId.slice(-8)}`;
  };

  // Define field mappings and labels based on swap direction
  const getConfig = () => {
    switch (swapData.direction) {
      case "btc_to_arkade":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.btc_fund_txid,
          step1IsEvm: false,
          step2LabelActive: "Server Funding",
          step2LabelComplete: "Server Funded",
          step2TxId: swapData.arkade_fund_txid,
          step2IsEvm: false,
          step3Label: "Client Redeeming",
          step3TxId: swapData.arkade_claim_txid,
          step3IsEvm: false,
          step4Label: "Server Redeemed",
          step4TxId: swapData.btc_claim_txid,
          step4IsEvm: false,
        };
      case "bitcoin_to_evm":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.btc_fund_txid,
          step1IsEvm: false,
          step2LabelActive: "Server Funding",
          step2LabelComplete: "Server Funded",
          step2TxId: swapData.evm_fund_txid,
          step2IsEvm: true,
          step3Label: "Client Redeeming",
          step3TxId: swapData.evm_claim_txid,
          step3IsEvm: true,
          step4Label: "Server Redeemed",
          step4TxId: swapData.btc_claim_txid,
          step4IsEvm: false,
        };
      case "arkade_to_evm":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.btc_fund_txid,
          step1IsEvm: false,
          step2LabelActive: "Server Funding",
          step2LabelComplete: "Server Funded",
          step2TxId: swapData.evm_fund_txid,
          step2IsEvm: true,
          step3Label: "Client Redeeming",
          step3TxId: swapData.evm_claim_txid,
          step3IsEvm: true,
          step4Label: "Server Redeemed",
          step4TxId: swapData.btc_claim_txid,
          step4IsEvm: false,
        };
      case "evm_to_arkade":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.evm_fund_txid,
          step1IsEvm: true,
          step2LabelActive: "Server Funding",
          step2LabelComplete: "Server Funded",
          step2TxId: swapData.btc_fund_txid,
          step2IsEvm: false,
          step3Label: "Client Redeeming",
          step3TxId: swapData.btc_claim_txid,
          step3IsEvm: false,
          step4Label: "Server Redeemed",
          step4TxId: swapData.evm_claim_txid,
          step4IsEvm: true,
        };
      case "evm_to_bitcoin":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.evm_fund_txid,
          step1IsEvm: true,
          step2LabelActive: "Server Funding",
          step2LabelComplete: "Server Funded",
          step2TxId: swapData.btc_fund_txid,
          step2IsEvm: false,
          step3Label: "Client Redeeming",
          step3TxId: swapData.btc_claim_txid,
          step3IsEvm: false,
          step4Label: "Server Redeemed",
          step4TxId: swapData.evm_claim_txid,
          step4IsEvm: true,
        };
      case "lightning_to_evm":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.btc_claim_txid,
          step1IsEvm: false,
          step2LabelActive: "Server Funding",
          step2LabelComplete: "Server Funded",
          step2TxId: swapData.evm_fund_txid,
          step2IsEvm: true,
          step3Label: "Client Redeeming",
          step3TxId: swapData.evm_claim_txid,
          step3IsEvm: true,
          step4Label: "Server Redeemed",
          step4TxId: null,
          step4IsEvm: false,
        };
      case "lightning_to_arkade":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.btc_claim_txid,
          step1IsEvm: false,
          step2LabelActive: "Server Funding",
          step2LabelComplete: "Server Funded",
          step2TxId: swapData.arkade_fund_txid,
          step2IsEvm: false,
          step3Label: "Client Redeeming",
          step3TxId: swapData.arkade_claim_txid,
          step3IsEvm: false,
          step4Label: "Server Redeemed",
          step4TxId: null,
          step4IsEvm: false,
        };
      case "evm_to_lightning":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.evm_fund_txid,
          step1IsEvm: true,
          step2LabelActive: "Server Funding",
          step2LabelComplete: "Server Funded",
          step2TxId: swapData.lightning_paid
            ? swapData.client_lightning_invoice
            : null,
          step2IsEvm: false,
          step3Label: "Lightning Payment",
          step3TxId: swapData.lightning_paid
            ? swapData.client_lightning_invoice
            : null,
          step3IsEvm: false,
          step4Label: "Complete",
          step4TxId: swapData.lightning_paid
            ? swapData.client_lightning_invoice
            : null,
          step4IsEvm: true,
        };
      case "arkade_to_lightning":
        return {
          step1Label: "User Funded",
          step1TxId: swapData.arkade_fund_txid,
          step1IsEvm: false,
          step2LabelActive: "Paying Invoice",
          step2LabelComplete: "Invoice Paid",
          step2TxId: swapData.arkade_claim_txid,
          step2IsEvm: false,
          step3Label: "Completing",
          step3TxId: swapData.status === "serverredeemed" ? "complete" : null,
          step3IsEvm: false,
          step4Label: "Complete",
          step4TxId: swapData.status === "serverredeemed" ? "complete" : null,
          step4IsEvm: false,
        };
    }
  };

  const config = getConfig();

  // Check if client funding is still being confirmed (seen but not confirmed)
  const isClientFundingSeen = swapData.status === "clientfundingseen";

  // Determine which step is currently active (the first incomplete step)
  const getCurrentStep = () => {
    if (isClientFundingSeen) return 1; // Client funding seen, awaiting confirmation
    if (!config.step2TxId) return 2; // Server funding
    if (!config.step3TxId) return 3; // Client redeeming
    if (!config.step4TxId) return 4; // Server redeeming
    return 5; // All complete
  };

  const currentStep = getCurrentStep();

  const isBtcToEvm = isBtcToEvmDirection(swapData.direction);
  const isEvmToBtc = isEvmToBtcDirection(swapData.direction);
  const isLightning = swapData.direction === "evm_to_lightning";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
              <div className="flex h-5 w-5 items-center justify-center">
                {getTokenIcon(swapData.target_token)}
              </div>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background p-[1px]">
              <div className="flex h-full w-full items-center justify-center rounded-full [&_svg]:h-full [&_svg]:w-full">
                {getTokenNetworkIcon(swapData.target_token)}
              </div>
            </div>
          </div>
          <h3 className="text-sm font-semibold">
            Receiving {swapData.target_token.symbol}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleCopyTxId(swapId)}
            className="flex cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
            title="Copy Swap ID"
          >
            <code className="font-mono text-[10px]">{swapId.slice(0, 8)}…</code>
            {copiedTxId === swapId ? (
              <CheckCheck className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary/50" />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6 p-6">
        <div className="space-y-4">
          {/* Step 1: User Funded */}
          <div className="flex items-start gap-3">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                isClientFundingSeen ? "bg-muted" : "bg-primary"
              }`}
            >
              {isClientFundingSeen ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Check className="h-4 w-4 text-primary-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <p className="font-medium">
                {isClientFundingSeen
                  ? "User Funding Detected"
                  : config.step1Label}
              </p>
              {config.step1TxId && (
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground">
                    {clipTxId(config.step1TxId)}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyTxId(config.step1TxId || "")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedTxId === config.step1TxId ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <a
                    href={`${getBlockexplorerTxLink(swapData.source_token.chain, config.step1TxId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {isClientFundingSeen && (
                <p className="text-xs text-muted-foreground">
                  Transaction detected, awaiting confirmation...
                </p>
              )}
            </div>
          </div>

          {/* Step 2: Server Funding/Funded */}
          <div className="flex items-start gap-3">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                config.step2TxId ? "bg-primary" : "bg-muted"
              }`}
            >
              {config.step2TxId ? (
                <Check className="h-4 w-4 text-primary-foreground" />
              ) : currentStep === 2 ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <p className="font-medium">
                {config.step2TxId
                  ? config.step2LabelComplete
                  : config.step2LabelActive}
              </p>
              {config.step2TxId && (
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground">
                    {clipTxId(config.step2TxId)}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyTxId(config.step2TxId || "")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedTxId === config.step2TxId ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  {config.step2IsEvm && (
                    <a
                      href={`${getBlockexplorerTxLink(swapData.target_token.chain, config.step2TxId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Client Redeeming */}
          <div className="flex items-start gap-3">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                config.step3TxId ? "bg-primary" : "bg-muted"
              }`}
            >
              {config.step3TxId ? (
                <Check className="h-4 w-4 text-primary-foreground" />
              ) : currentStep === 3 ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <p className="font-medium">{config.step3Label}</p>
              {config.step3TxId && (
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground">
                    {clipTxId(config.step3TxId)}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyTxId(config.step3TxId || "")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedTxId === config.step3TxId ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  {config.step3IsEvm && (
                    <a
                      href={`${getBlockexplorerTxLink(swapData.target_token.chain, config.step3TxId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
              {/* Show claiming status inline when server is funded */}
              {swapData.status === "serverfunded" && !isLightning && (
                <div className="mt-2 space-y-2 rounded-lg border bg-gradient-to-t from-primary/5 to-card p-4">
                  <p className="text-sm font-medium">
                    {isClaiming
                      ? isEvmToBtc
                        ? "Redeeming your sats..."
                        : "Claiming your tokens..."
                      : isEvmToBtc
                        ? "VHTLC Funded"
                        : "HTLC Funded"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isClaiming
                      ? isEvmToBtc
                        ? "Claiming the Bitcoin VHTLC and publishing the transaction..."
                        : isEthereumToken(swapData.target_token.chain)
                          ? "Claiming tokens via your Ethereum wallet (you pay gas)..."
                          : "Submitting claim request..."
                      : isEvmToBtc
                        ? "The VHTLC has been funded. Preparing to claim your sats..."
                        : "The HTLC has been funded. Preparing to claim your tokens..."}
                  </p>
                  {retryCount > 0 && retryCount < maxRetries && (
                    <p className="text-xs text-muted-foreground">
                      Retry attempt {retryCount}/{maxRetries}...
                    </p>
                  )}
                  {isBtcToEvm &&
                    !isClaiming &&
                    !claimError &&
                    isEthereumToken(swapData.target_token.chain) &&
                    !address && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Connect your Ethereum wallet to claim your tokens.
                        </p>
                        <Button
                          onClick={() => open().catch(console.error)}
                          size="sm"
                          className="w-full"
                        >
                          Connect Wallet
                        </Button>
                      </div>
                    )}
                  {isBtcToEvm && !isClaiming && !claimError && address && (
                    <p className="text-xs text-muted-foreground">
                      {isEthereumToken(swapData.target_token.chain)
                        ? "You will need ETH in your wallet to pay for gas fees to claim your tokens."
                        : "Gas fees fully sponsored"}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Server Redeemed */}
          <div className="flex items-start gap-3">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                config.step4TxId ? "bg-primary" : "bg-muted"
              }`}
            >
              {config.step4TxId ? (
                <Check className="h-4 w-4 text-primary-foreground" />
              ) : currentStep === 4 ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <p className="font-medium">{config.step4Label}</p>
              {config.step4TxId && (
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground">
                    {clipTxId(config.step4TxId)}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyTxId(config.step4TxId || "")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedTxId === config.step4TxId ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  {config.step4IsEvm && (
                    <a
                      href={`${getBlockexplorerTxLink(swapData.source_token.chain, config.step4TxId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {claimError && (
          <div className="space-y-2 border-t border-border/50 pt-2">
            <SupportErrorBanner
              message="Claim failed"
              error={claimError}
              swapId={swapId}
            />
            {retryCount >= maxRetries && (
              <Button
                onClick={handleManualRetry}
                size="sm"
                variant="outline"
                className="w-full"
              >
                Retry Manually
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
