import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "#/components/ui/button";
import type { GetSwapResponse, StoredSwap } from "../../api";
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
  const txid =
    swap.direction === "evm_to_bitcoin" ? swap.btc_claim_txid : undefined;
  const [payout, setPayout] = useState<typeof quotedPayout>();
  const [verificationError, setVerificationError] = useState("");
  const explorer = paymentExplorer(swap.network);
  useEffect(() => {
    let cancelled = false;
    setPayout(undefined);
    setVerificationError("");
    if (!txid || swap.direction !== "evm_to_bitcoin") return;
    void fetch(`${explorer}/api/tx/${encodeURIComponent(txid)}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Could not load the Bitcoin transaction. Reload to retry.",
          );
        const result = executedPayment(
          quotedPayout,
          await response.json(),
          txid,
          swap.btc_htlc_address,
        );
        if (!cancelled) setPayout(result);
      })
      .catch((error) => {
        if (!cancelled) setVerificationError(String(error.message));
      });
    return () => {
      cancelled = true;
    };
  }, [txid, explorer, quotedPayout, swap]);
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
        <h1 className="text-2xl font-semibold">Payment complete</h1>
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
      <Button
        className="w-full rounded-full"
        onClick={download}
        disabled={downloading}
      >
        {downloading ? "Preparing PDF…" : "Download receipt (PDF)"}
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
