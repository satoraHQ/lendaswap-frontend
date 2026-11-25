import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "#/components/ui/button";
import { api, type GetSwapResponse, type StoredSwap } from "../../api";
import { PayRecipients } from "../../components/PayRecipients";
import { executedPayment, paymentExplorer } from "../../utils/payExecution";
import { downloadPayReceipt } from "../../utils/payReceipt";
import { payUsdValuation } from "../../utils/payUsdValue";
import { TxHashRow } from "./success/DetailRows";

export function PaySuccessStep({
  swap,
  payout: quotedPayout,
  names,
  usdRate,
}: {
  swap: GetSwapResponse;
  names?: string[];
  usdRate?: number;
  payout: NonNullable<StoredSwap["bitcoinPayout"]>;
}) {
  const navigate = useNavigate();
  const valuation = payUsdValuation(swap, usdRate);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  // A speed-up replaces the claim; follow the replacement until the server
  // reports it.
  const [replacementTxid, setReplacementTxid] = useState<string>();
  const serverTxid =
    swap.direction === "evm_to_bitcoin" ? swap.btc_claim_txid : undefined;
  const txid = replacementTxid ?? serverTxid ?? undefined;
  const [payout, setPayout] = useState<typeof quotedPayout>();
  const [confirmed, setConfirmed] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [poll, setPoll] = useState(0);
  const [speedUpRate, setSpeedUpRate] = useState("");
  const [speedingUp, setSpeedingUp] = useState(false);
  const [speedUpError, setSpeedUpError] = useState("");
  const explorer = paymentExplorer(swap.network);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `poll` deliberately re-runs the fetch until the claim confirms.
  useEffect(() => {
    let cancelled = false;
    setVerificationError("");
    if (!txid || swap.direction !== "evm_to_bitcoin") return;
    void fetch(`${explorer}/api/tx/${encodeURIComponent(txid)}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Could not load the Bitcoin transaction. Reload to retry.",
          );
        const tx = await response.json();
        const result = executedPayment(
          quotedPayout,
          tx,
          txid,
          swap.btc_htlc_address,
        );
        if (!cancelled) {
          setPayout(result);
          setConfirmed(tx.status?.confirmed === true);
        }
      })
      .catch((error) => {
        if (!cancelled) setVerificationError(String(error.message));
      });
    return () => {
      cancelled = true;
    };
  }, [txid, explorer, quotedPayout, swap, poll]);
  // The server marks the swap done once the claim is broadcast; a mempool
  // transaction is not final, so keep checking until it confirms.
  useEffect(() => {
    if (confirmed || !txid) return;
    const timer = setInterval(() => setPoll((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [confirmed, txid]);
  async function speedUp() {
    const rate = Number(speedUpRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setSpeedUpError("Enter a positive fee rate in sat/vB.");
      return;
    }
    setSpeedingUp(true);
    setSpeedUpError("");
    try {
      const result = await api.claim(swap.id, { feeRateSatPerVb: rate });
      if (!result.success) setSpeedUpError(result.message);
      else if (result.txHash) {
        setReplacementTxid(result.txHash);
        setPayout(undefined);
        setConfirmed(false);
      }
    } catch (error) {
      setSpeedUpError(error instanceof Error ? error.message : String(error));
    } finally {
      setSpeedingUp(false);
    }
  }
  if (!txid)
    return (
      <p role="status">
        Your Bitcoin payment has been submitted. Waiting for the transaction to
        appear; this page updates automatically.
      </p>
    );
  if (!payout)
    return (
      <p role="status">
        {verificationError ||
          "Verifying paid amounts against the Bitcoin transaction…"}
      </p>
    );
  const total = payout.recipients.reduce(
    (sum, r) => sum + BigInt(r.amountSats),
    0n,
  );
  const feeSats = payout.feeSats;
  async function download() {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadPayReceipt({
        swap,
        payout: payout!,
        names,
        usdRate,
        feeSats,
      });
    } catch {
      setDownloadError("Could not create the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <section className="space-y-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lime-400 text-black">
        <Check />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">
          {confirmed ? "Payment complete" : "Payment sent"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {payout.recipients.length} recipients ·{" "}
          {(Number(total) / 1e8).toFixed(8)} BTC paid
        </p>
      </div>
      <PayRecipients
        recipients={payout.recipients}
        names={names}
        usdRate={valuation?.rate}
      />
      {valuation?.basis === "funding" && (
        <p className="text-xs text-muted-foreground">
          USD equivalents are estimated from this payment’s recorded funding and
          Bitcoin amounts, including conversion costs.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Bitcoin transaction fee: {feeSats} sats
      </p>
      {txid ? (
        <TxHashRow
          label="Bitcoin transaction"
          txHash={txid}
          chain={swap.target_token.chain}
          explorerUrl={`${explorer}/tx/${txid}`}
          copiedAddress={copied}
          onCopy={async (value) => {
            await navigator.clipboard.writeText(value);
            setCopied(value);
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Transaction details are awaiting synchronization.
        </p>
      )}
      {!confirmed && (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm" role="status">
            Waiting for the Bitcoin transaction to confirm. If it is taking
            long, raise its fee. The extra comes out of the amount above the
            recipients' minimums; no recipient is paid less than their minimum.
          </p>
          <label className="text-sm">
            Fee rate (sat/vB)
            <input
              type="number"
              min="0"
              step="any"
              value={speedUpRate}
              onChange={(event) => setSpeedUpRate(event.target.value)}
              className="ml-3 w-24 rounded border bg-background p-2"
            />
          </label>
          <Button
            onClick={speedUp}
            disabled={speedingUp || !speedUpRate}
            className="ml-3"
            size="sm"
            variant="outline"
          >
            {speedingUp ? "Speeding up…" : "Speed up"}
          </Button>
          {speedUpError && (
            <p role="alert" className="text-sm text-destructive">
              {speedUpError}
            </p>
          )}
        </div>
      )}
      <Button
        className="w-full rounded-full"
        onClick={download}
        disabled={downloading || !confirmed}
      >
        {downloading
          ? "Preparing PDF…"
          : confirmed
            ? "Download receipt (PDF)"
            : "Receipt available once confirmed"}
      </Button>
      {downloadError && (
        <p role="alert" className="text-sm text-destructive">
          {downloadError}
        </p>
      )}
      <Button
        variant="outline"
        className="w-full rounded-full"
        onClick={() => navigate("/pay")}
      >
        New payment
      </Button>
    </section>
  );
}
