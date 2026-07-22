import { ArkAddress } from "@arkade-os/sdk";
import { decode } from "@gandlaf21/bolt11-decode";
import { validate as validateBtcAddress } from "bitcoin-address-validation";
import { AlertCircle, Check, Loader } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  isBolt11Invoice,
  isLightningAddress,
  isLnurl,
} from "../../utils/lightningAddress";
import { api, type ContinueRefundedEvmSwapInfo } from "../api";

function formatAmount(
  amount: string | undefined,
  decimals: number | undefined,
) {
  if (!amount || decimals === undefined) return "—";
  const value = Number(amount) / 10 ** decimals;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(decimals, 8),
  });
}

function validateTarget(direction: string | undefined, value: string) {
  const target = value.trim();
  if (!target) return "Enter a fresh destination.";
  try {
    switch (direction) {
      case "evm_to_arkade":
        ArkAddress.decode(target);
        return null;
      case "evm_to_bitcoin":
        return validateBtcAddress(target)
          ? null
          : "Enter a valid Bitcoin address.";
      case "evm_to_lightning":
        if (isLightningAddress(target) || isLnurl(target)) return null;
        if (isBolt11Invoice(target)) {
          const decoded = decode(target);
          const hasAmount = Object.values(decoded.sections).some(
            (section) => section.name === "amount" && Number(section.value) > 0,
          );
          return hasAmount
            ? null
            : "Invoices without an amount are not supported.";
        }
        return "Enter a valid BOLT11 invoice, Lightning address, or LNURL.";
      default:
        return null;
    }
  } catch {
    switch (direction) {
      case "evm_to_arkade":
        return "Enter a valid Arkade address.";
      case "evm_to_lightning":
        return "Enter a valid BOLT11 invoice, Lightning address, or LNURL.";
      default:
        return "Enter a valid destination.";
    }
  }
}

function targetLabel(direction: string | undefined) {
  switch (direction) {
    case "evm_to_arkade":
      return "New Arkade address";
    case "evm_to_bitcoin":
      return "New Bitcoin address";
    case "evm_to_lightning":
      return "New Lightning invoice, Lightning address, or LNURL";
    default:
      return "New target address";
  }
}

export function ContinueRefundedSwapPage() {
  const { swapId } = useParams<{ swapId: string }>();
  const navigate = useNavigate();

  const [info, setInfo] = useState<ContinueRefundedEvmSwapInfo | null>(null);
  const [targetAddress, setTargetAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Continue Refunded Swap | Satora";
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!swapId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await api.getRefundedEvmSwapContinuation(swapId);
        if (!cancelled) setInfo(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [swapId]);

  const oldDirection = info?.oldSwap?.direction;
  const targetError = useMemo(
    () => validateTarget(oldDirection, targetAddress),
    [oldDirection, targetAddress],
  );
  const canSubmit = useMemo(
    () => !!swapId && !!info?.eligible && !targetError,
    [swapId, info, targetError],
  );

  async function handleContinue() {
    if (!swapId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.continueRefundedEvmSwap(
        swapId,
        targetAddress.trim(),
      );
      navigate(`/swap/${result.newSwapId}/wizard`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
        <div className="border-b border-border/50 bg-muted/30 px-6 py-4">
          <h2 className="text-lg font-semibold">Continue refunded swap</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the refunded balance in your Satora recovery account to create
            and fund a fresh swap.
          </p>
        </div>

        <div className="space-y-5 p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader className="h-4 w-4 animate-spin" /> Checking recovery
              account…
            </div>
          ) : info?.eligible ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-green-600">
                <Check className="h-4 w-4" /> Refund balance found
              </div>
              <div className="mt-3 space-y-2 text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <span>Amount</span>
                  <span className="text-right font-medium text-foreground">
                    {formatAmount(info.amount, info.token?.decimals)}{" "}
                    {info.token?.symbol}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Recovery account</span>
                  <span className="break-all text-right font-mono text-xs text-foreground">
                    {info.smartAccountAddress}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {info?.reason ?? "This swap cannot be continued."}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label htmlFor="continue-target" className="text-sm font-medium">
              {targetLabel(oldDirection)}
            </label>
            <input
              id="continue-target"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              disabled={!info?.eligible || submitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              placeholder="Enter a fresh destination"
            />
            {targetAddress && targetError ? (
              <p className="text-xs text-destructive">{targetError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Always provide a new destination. The old target is not reused.
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              className="h-11 flex-1"
              disabled={!canSubmit || submitting}
              onClick={handleContinue}
            >
              {submitting ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" /> Continuing…
                </>
              ) : (
                "Continue swap"
              )}
            </Button>
            <Button variant="outline" onClick={() => navigate("/")}>
              Start new
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
