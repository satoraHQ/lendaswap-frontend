import { decode } from "@gandlaf21/bolt11-decode";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import {
  isArkade,
  isBtcOnchain,
  isEvmToken,
  isLightning,
  isSolanaToken,
  isValidArkadeAddress,
  isValidSolanaAddress,
  type TokenInfo,
} from "@satora/swap";
import { validate as validateBtcAddress } from "bitcoin-address-validation";
import { isAddress } from "ethers";
import { Loader2, ScanLine, Wallet, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { isSupportedUri, parseUri } from "../../utils/bip321";
import {
  isBolt11Invoice,
  isLightningAddress,
  isLnurl,
} from "../../utils/lightningAddress";
import { hasCameraApi, normalizeScannedText } from "../../utils/qrScan";
import isValidSpeedWalletContext from "../../utils/speedWallet";
import { useNwc } from "../NwcContext";
import { useWalletBridge } from "../WalletBridgeContext";
import { QrScannerDialog } from "./QrScannerDialog";

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  targetToken?: TokenInfo;
  className?: string;
  setAddressIsValid: (valid: boolean) => void;
  setBitcoinAmount: (amount: number) => void;
  disabled?: boolean;
  /** Current target amount in sats - needed for NWC makeInvoice */
  targetAmountSats?: number;
}

export function AddressInput({
  value,
  onChange,
  targetToken,
  className = "",
  setAddressIsValid,
  setBitcoinAmount,
  disabled = false,
  targetAmountSats,
}: AddressInputProps) {
  const isEvmTarget = targetToken ? isEvmToken(targetToken.chain) : false;
  const isSolanaTarget = targetToken ? isSolanaToken(targetToken.chain) : false;
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  // Solana namespace via Reown AppKit's Solana adapter — surfaces Phantom /
  // Solflare / Backpack / etc. The address is read-only here (we never
  // sign on Solana ourselves; Circle's forwarder handles the destination
  // mint).
  const solanaAccount = useAppKitAccount({ namespace: "solana" });
  const solanaAddress = solanaAccount.address;
  const isSolanaConnected = solanaAccount.isConnected;
  const [validationError, setValidationError] = useState<string>("");
  const isSpeedWallet = isValidSpeedWalletContext();
  const { isEmbedded } = useWalletBridge();

  const { isConnected: isNwcConnected, makeInvoice } = useNwc();
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const showScanButton = !disabled && hasCameraApi();

  const isLightningTarget = targetToken ? isLightning(targetToken) : false;
  // Solana addresses come in two structurally-identical-looking shapes:
  // wallet pubkeys (on-curve, signable) and PDAs like SPL token accounts
  // (off-curve, unsignable). Pasting a token account address by mistake
  // would let the swap proceed and lose funds (see PR review). We surface
  // this as a *warning* not an error so legitimate off-curve wallets
  // (Squads, smart-wallets) can still proceed.
  const [solanaWarning, setSolanaWarning] = useState<string>("");
  const showNwcGenerate =
    !isEmbedded &&
    !isSpeedWallet &&
    isNwcConnected &&
    isLightningTarget &&
    !disabled;

  const handleInputChange = (raw: string) => {
    if (isSupportedUri(raw)) {
      try {
        const parsed = parseUri(raw);

        // If URI contains an amount (BTC), convert to sats
        if (parsed.amount !== undefined && parsed.amount > 0) {
          setBitcoinAmount(parsed.amount * 100_000_000);
        }

        // Pick the best address based on the target token type:
        // - unified bitcoin: URI may carry lightning= and ark= params
        // - standalone lightning: or ark: URIs carry just the address
        let resolvedAddress = parsed.address;

        if (targetToken) {
          if (isLightning(targetToken) && parsed.lightning) {
            resolvedAddress = parsed.lightning;
          } else if (isArkade(targetToken) && parsed.ark) {
            resolvedAddress = parsed.ark;
          }
          // For BTC onchain or if no matching param, use the main address
        }

        onChange(resolvedAddress);
        return;
      } catch {
        // Fall through - let normal validation handle it
      }
    }
    onChange(raw);
  };

  const handleScan = (data: string) => {
    handleInputChange(normalizeScannedText(data));
  };

  const handleGenerateInvoice = async () => {
    if (!targetAmountSats || targetAmountSats <= 0) return;
    setIsGeneratingInvoice(true);
    setValidationError("");
    try {
      const bolt11 = await makeInvoice(targetAmountSats);
      onChange(bolt11);
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : "Failed to generate invoice",
      );
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  useEffect(() => {
    if (!value || !targetToken) {
      setValidationError("");
      setAddressIsValid(true);
      return;
    }

    setAddressIsValid(true);

    if (isEvmTarget) {
      if (!isAddress(value)) {
        setValidationError("Invalid Ethereum/Polygon address");
        setAddressIsValid(false);
      } else {
        setValidationError("");
      }
    } else if (isSolanaTarget) {
      if (!isValidSolanaAddress(value)) {
        setValidationError("Invalid Solana address");
        setAddressIsValid(false);
      } else {
        setValidationError("");
      }
    } else if (isLightning(targetToken)) {
      // Accept both Lightning addresses and BOLT11 invoices
      if (isLightningAddress(value) || isLnurl(value)) {
        // Valid Lightning address or LNURL (will be resolved to invoice later)
        setValidationError("");
        setAddressIsValid(true);
      } else if (isBolt11Invoice(value)) {
        // Valid BOLT11 invoice - decode and validate amount
        try {
          setValidationError("");
          const bolt11Invoice = decode(value);
          let hasAmount = false;
          for (const sectionsKey in bolt11Invoice.sections) {
            const section = bolt11Invoice.sections[sectionsKey];
            if (section.name === "amount" && section.value) {
              const amount = Number.parseInt(section.value, 10);
              if (amount > 0) {
                setAddressIsValid(true);
                hasAmount = true;
                setBitcoinAmount(amount / 1_000);
              }
            }
          }
          if (!hasAmount) {
            setAddressIsValid(true);
            setValidationError("Invoices without amount are not supported.");
          }
        } catch (_e) {
          setValidationError("Invalid Lightning invoice");
          setAddressIsValid(false);
        }
      } else {
        setValidationError(
          "Invalid Lightning input. Expected: BOLT11 invoice, Lightning address, or LNURL",
        );
        setAddressIsValid(false);
      }
    } else if (isArkade(targetToken)) {
      if (!isValidArkadeAddress(value)) {
        setValidationError("Invalid Arkade address");
        setAddressIsValid(false);
      } else {
        setValidationError("");
      }
    } else if (isBtcOnchain(targetToken)) {
      if (!validateBtcAddress(value)) {
        setValidationError("Invalid Bitcoin address");
        setAddressIsValid(false);
      } else {
        setValidationError("");
      }
    }
  }, [
    value,
    targetToken,
    isEvmTarget,
    isSolanaTarget,
    setAddressIsValid,
    setBitcoinAmount,
  ]);

  // Off-curve Solana address probe: if the user pasted a value that
  // structurally can't be a regular wallet keypair (e.g. an SPL token
  // account address), warn them. Soft check — leaves `addressIsValid`
  // alone so users with Squads / smart-wallet PDAs can still proceed.
  useEffect(() => {
    if (!isSolanaTarget || !value || !isValidSolanaAddress(value)) {
      setSolanaWarning("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { isSolanaWalletPubkey } = await import("../utils/solana");
        const isWallet = await isSolanaWalletPubkey(value);
        if (cancelled) return;
        setSolanaWarning(
          isWallet
            ? ""
            : "This looks like a token account, not a wallet. If you're using a Squads / smart wallet you can ignore this; otherwise please paste your Solana wallet address.",
        );
      } catch (_err) {
        if (!cancelled) setSolanaWarning("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, isSolanaTarget]);

  const showWalletButton = (isEvmTarget || isSolanaTarget) && !isSpeedWallet;
  const inputPaddingRight =
    showWalletButton && showScanButton
      ? "pr-36"
      : showWalletButton
        ? "pr-28"
        : showScanButton
          ? "pr-10"
          : "";

  const getPlaceholder = () => {
    if (!targetToken) return "Receive address";
    if (isLightning(targetToken))
      return "Receive address (BOLT11 invoice or Lightning address)";
    if (isArkade(targetToken)) return "Receive address (Arkade)";
    if (isBtcOnchain(targetToken)) return "Receive address (Bitcoin)";
    if (isSolanaToken(targetToken.chain)) return "Receive address (Solana)";
    if (isEvmToken(targetToken.chain)) return "Receive address (EVM)";
    return "Receive address";
  };

  return (
    <div>
      <div className="relative">
        <Input
          type="text"
          mono
          placeholder={getPlaceholder()}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          disabled={disabled}
          className={`${inputPaddingRight} ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          } ${className}`}
          data-1p-ignore
          data-lpignore="true"
          autoComplete="off"
        />

        {/* Right-side actions: wallet connect / autofill (EVM + Solana,
            hidden in Speed Wallet) and the QR scanner. */}
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isEvmTarget &&
            !isSpeedWallet &&
            (isConnected && !value ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (address) {
                    onChange(address);
                  }
                }}
                type="button"
                className="h-7 px-2 text-xs"
              >
                Use wallet
              </Button>
            ) : !isConnected ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => open().catch(console.error)}
                type="button"
                className="h-7 px-2 text-xs"
              >
                <Wallet className="mr-1 h-3 w-3" />
                Connect
              </Button>
            ) : null)}

          {/* Solana variant: auto-fill from a connected Phantom / Solflare /
              Backpack / etc., or prompt to connect if none is yet picked.
              Speed Wallet hides this — that flow has its own address pipe. */}
          {isSolanaTarget &&
            !isSpeedWallet &&
            (isSolanaConnected && solanaAddress && !value ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChange(solanaAddress)}
                type="button"
                className="h-7 px-2 text-xs"
              >
                Use wallet
              </Button>
            ) : !isSolanaConnected ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  open({ view: "Connect", namespace: "solana" }).catch(
                    console.error,
                  )
                }
                type="button"
                className="h-7 px-2 text-xs"
              >
                <Wallet className="mr-1 h-3 w-3" />
                Connect
              </Button>
            ) : null)}

          {showScanButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsScannerOpen(true)}
              type="button"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Scan QR code"
              title="Scan QR code"
            >
              <ScanLine className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {showScanButton && (
        <QrScannerDialog
          open={isScannerOpen}
          onOpenChange={setIsScannerOpen}
          onScan={handleScan}
        />
      )}

      {/* Address Error Display */}
      {validationError && (
        <p className="mt-2 text-xs text-destructive">{validationError}</p>
      )}

      {/* Solana off-curve soft warning — non-blocking. */}
      {!validationError && solanaWarning && (
        <p className="mt-2 text-xs text-amber-500">{solanaWarning}</p>
      )}

      {/* Generate Invoice via NWC */}
      {showNwcGenerate && !value && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGenerateInvoice}
          disabled={
            isGeneratingInvoice || !targetAmountSats || targetAmountSats <= 0
          }
          type="button"
          className="mt-2 h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          {isGeneratingInvoice ? (
            <>
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Generating invoice...
            </>
          ) : (
            <>
              <Zap className="mr-1.5 h-3 w-3" />
              Generate invoice from wallet
            </>
          )}
        </Button>
      )}
    </div>
  );
}
