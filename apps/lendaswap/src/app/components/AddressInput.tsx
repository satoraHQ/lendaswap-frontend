import { decode } from "@gandlaf21/bolt11-decode";
import {
  isArkade,
  isBtcOnchain,
  isEvmToken,
  isLightning,
  type TokenInfo,
} from "@lendasat/lendaswap-sdk-pure";
import { useAppKit } from "@reown/appkit/react";
import { validate as validateBtcAddress } from "bitcoin-address-validation";
import { isAddress } from "ethers";
import { Loader2, Wallet, Zap } from "lucide-react";
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
import isValidSpeedWalletContext from "../../utils/speedWallet";
import { useNwc } from "../NwcContext";
import { useWalletBridge } from "../WalletBridgeContext";

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
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const [validationError, setValidationError] = useState<string>("");
  const isSpeedWallet = isValidSpeedWalletContext();
  const { isEmbedded } = useWalletBridge();
  const { isConnected: isNwcConnected, makeInvoice } = useNwc();
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

  const isLightningTarget = targetToken ? isLightning(targetToken) : false;
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
      // Basic Arkade address validation (starts with ark1)
      if (
        !value.toLowerCase().startsWith("ark1") &&
        !value.toLowerCase().startsWith("tark1")
      ) {
        setValidationError("Invalid Arkade address (must start with 'ark1')");
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
  }, [value, targetToken, isEvmTarget, setAddressIsValid, setBitcoinAmount]);

  const getPlaceholder = () => {
    if (!targetToken) return "";
    if (isLightning(targetToken))
      return "BOLT11 invoice or Lightning address (LNURL)";
    if (isArkade(targetToken)) return "Provide an Arkade address";
    if (isBtcOnchain(targetToken)) return "Provide a Bitcoin address";
    if (isEvmToken(targetToken.chain)) return "Provide an EVM address";
    return "";
  };

  return (
    <div className="rounded-2xl bg-muted p-4">
      <div className="text-sm text-muted-foreground mb-2">Receive address</div>
      <div className="relative">
        <Input
          type="text"
          placeholder={getPlaceholder()}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          disabled={disabled}
          className={`px-3 py-2 min-h-[2.75rem] bg-background border-0 rounded-xl text-sm font-mono placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-ring ${
            isEvmTarget ? "pr-28" : ""
          } ${disabled ? "cursor-not-allowed opacity-60" : ""} ${className}`}
          data-1p-ignore
          data-lpignore="true"
          autoComplete="off"
        />

        {/* Get Address Button - Only for EVM addresses, hidden in Speed Wallet */}
        {isEvmTarget && !isSpeedWallet && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            {isConnected && !value ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (address) {
                    onChange(address);
                  }
                }}
                type="button"
                className="h-7 text-xs px-2"
              >
                Use wallet
              </Button>
            ) : !isConnected ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => open().catch(console.error)}
                type="button"
                className="h-7 text-xs px-2"
              >
                <Wallet className="w-3 h-3 mr-1" />
                Connect
              </Button>
            ) : null}
          </div>
        )}

        {/* Generate Invoice Button - Lightning target with NWC connected */}
      </div>

      {/* Address Error Display */}
      {validationError && (
        <p className="text-destructive text-xs mt-2">{validationError}</p>
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
          className="mt-2 h-8 text-xs px-3 text-muted-foreground hover:text-foreground"
        >
          {isGeneratingInvoice ? (
            <>
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              Generating invoice...
            </>
          ) : (
            <>
              <Zap className="w-3 h-3 mr-1.5" />
              Generate invoice from wallet
            </>
          )}
        </Button>
      )}
    </div>
  );
}
