import { allocateBitcoinPayout, toChainName } from "@satora/swap";
import { Check, RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import type { GetSwapResponse, StoredSwap } from "../api";
import { PayBackupDownload } from "../components/PayBackupDownload";
import { PayExpiredDeposit } from "../components/PayExpiredDeposit";
import { totalFeeSats } from "../utils/feeUtils";
import { payProgress } from "./payFundingState";

export function PayFundingLayout({
  children,
  swap,
  payout,
  names,
  requestedAmounts,
  step,
}: {
  children: ReactNode;
  swap: GetSwapResponse;
  payout: NonNullable<StoredSwap["bitcoinPayout"]>;
  names?: string[];
  /** Nominal amounts asked for; the stored payout holds the lower floors. */
  requestedAmounts?: string[];
  step?: string;
}) {
  const navigate = useNavigate();
  const [expiredDepositClear, setExpiredDepositClear] = useState(false);
  const amount = (
    Number(swap.source_amount) /
    10 ** swap.source_token.decimals
  ).toLocaleString(undefined, {
    maximumFractionDigits: swap.source_token.decimals,
  });
  // Stored amounts are each recipient's floor; show what a claim of the
  // funded amount pays, with the surplus shared in proportion.
  let displayedPayout = payout;
  try {
    displayedPayout = allocateBitcoinPayout(payout, BigInt(swap.target_amount));
  } catch {
    // Keep the committed floors visible while the claim/refund panel explains
    // why the funded amount cannot satisfy this payment.
  }
  const total = displayedPayout.recipients.reduce(
    (sum, r) => sum + BigInt(r.amountSats),
    0n,
  );
  const paymentFee = BigInt(displayedPayout.feeSats);
  const progress = payProgress(step, swap.status);
  const exceptional = ["expired", "refundable", "refunded"].includes(
    step ?? "",
  );
  const recoveryState = step === "expired" || step === "refundable";
  const mismatch = swap.status === "clientinvalidfunded";
  const newQuote = () =>
    navigate("/pay", {
      state: {
        retryPayment: {
          sourceId: `${swap.source_token.chain}:${swap.source_token.token_id}`,
          // Re-quote the amounts originally asked for, never the floors,
          // so a retry does not pay each recipient less.
          recipients: payout.recipients.map((recipient, i) => ({
            ...recipient,
            amountSats:
              requestedAmounts?.length === payout.recipients.length
                ? requestedAmounts[i]
                : recipient.amountSats,
          })),
          names,
          feeSats: payout.feeSats,
          recovery: "target_btc_address" in swap ? swap.target_btc_address : "",
        },
      },
    });
  const deadline =
    "btc_refund_locktime" in swap ? swap.btc_refund_locktime : undefined;
  const labels = [
    "Awaiting deposit",
    "Deposit received",
    "Swapping to BTC",
    "Paying recipients",
  ];
  const status = exceptional
    ? step === "refundable"
      ? "Refund available"
      : step === "refunded"
        ? "Refunded"
        : "Quote expired"
    : progress === 4
      ? "Complete"
      : labels[progress];
  return (
    <section className="space-y-8 pb-12">
      <header className="space-y-4">
        <nav
          aria-label="Payment progress"
          className="flex gap-3 text-sm text-muted-foreground"
        >
          <span>1 · Recipients</span>
          <span>—</span>
          <span>2 · Review</span>
          <span>—</span>
          <span aria-current="step" className="font-semibold text-foreground">
            3 · Fund
          </span>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          One swap. Multiple Bitcoin payments.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Fund once with USDC or USDT. Everyone on the list gets paid in onchain
          BTC.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-6 rounded-3xl border bg-card p-5 sm:p-8">
          {recoveryState && (
            <div className="space-y-5">
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {step === "expired"
                  ? "Quote expired"
                  : mismatch
                    ? "Amount didn’t match"
                    : "Payment didn’t complete"}
              </span>
              <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                {step === "expired"
                  ? "The funding window for this quote has ended."
                  : mismatch
                    ? "Your deposit didn’t match the quote, so the swap couldn’t complete."
                    : "This payment couldn’t be completed."}
              </h2>
              <p className="leading-relaxed text-muted-foreground">
                {step === "expired"
                  ? "Don’t send funds to the old deposit address. If you sent funds, check the deposit account before funding another payment."
                  : "Retrying with the existing funds is not supported for this payment. Review the gasless refund details below."}
              </p>
              <dl className="divide-y rounded-2xl bg-muted/40 px-5 py-2 text-sm">
                <div className="flex justify-between gap-4 py-4">
                  <dt className="text-muted-foreground">Original quote</dt>
                  <dd className="text-right font-medium">
                    {amount} {swap.source_token.symbol}
                  </dd>
                </div>
                {step === "expired" && (
                  <div className="flex justify-between gap-4 py-4">
                    <dt className="text-muted-foreground">Deposit</dt>
                    <dd>Check deposit account below</dd>
                  </div>
                )}
                {step === "expired" && deadline && (
                  <div className="flex justify-between gap-4 py-4">
                    <dt className="text-muted-foreground">
                      Funding window ended
                    </dt>
                    <dd className="text-right">
                      {new Date(deadline * 1000).toLocaleString()}
                    </dd>
                  </div>
                )}
                {step === "refundable" && (
                  <div className="flex justify-between gap-4 py-4">
                    <dt className="text-muted-foreground">Next step</dt>
                    <dd>Request a refund</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          {step === "expired" ? (
            <PayExpiredDeposit swap={swap} onClear={setExpiredDepositClear} />
          ) : (
            children
          )}
          {((step === "expired" && expiredDepositClear) ||
            step === "refunded") && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">What to do next</p>
              <div
                className={`flex flex-col gap-5 rounded-2xl border p-5 sm:flex-row sm:items-center ${step === "expired" ? "border-foreground" : ""}`}
              >
                <div className="flex flex-1 items-start gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#11150f] text-white">
                    <RotateCcw className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">
                      Try again with a new quote
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Same {payout.recipients.length} recipients and BTC
                      amounts. Review a fresh rate, then get a new deposit
                      address. The new payment needs new funding.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={newQuote}
                  className="shrink-0 rounded-full bg-lime-400 px-6 py-4 text-sm font-semibold text-black hover:bg-lime-300"
                >
                  Get new quote
                </button>
              </div>
            </div>
          )}
          {!exceptional && progress < 4 && (
            <ol aria-label="Payment status" className="space-y-5 border-t pt-6">
              {labels.map((label, i) => (
                <li
                  key={label}
                  aria-current={progress === i ? "step" : undefined}
                  className={`flex gap-4 ${progress < i ? "text-muted-foreground" : ""}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${progress > i ? "border-lime-400 bg-lime-400 text-black" : progress === i ? "border-foreground" : "border-muted"}`}
                  >
                    {progress > i && <Check className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="font-medium">{label}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {progress < 4 && (
            <details className="border-t pt-4">
              <summary className="cursor-pointer text-sm font-medium">
                View recipients
              </summary>
              <ul className="mt-3 space-y-3">
                {displayedPayout.recipients.map((recipient, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Read-only payment outputs retain their committed order, including duplicate recipients.
                  <li key={index} className="text-sm">
                    <p className="font-medium">
                      {(Number(recipient.amountSats) / 1e8).toFixed(8)} BTC
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {recipient.address}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {progress < 4 && (
            <p className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
              {step === "refundable" ||
              (step === "expired" && !expiredDepositClear) ? (
                "Your recipients and amounts remain saved in this browser."
              ) : exceptional ? (
                <>
                  Recipients are saved in this browser.{" "}
                  <button
                    type="button"
                    onClick={newQuote}
                    className="text-foreground underline underline-offset-4"
                  >
                    Edit recipients
                  </button>{" "}
                  if anything needs to change first.
                </>
              ) : (
                "Keep this page open while the payment completes. Your recipients are saved in this browser."
              )}
            </p>
          )}
          <PayBackupDownload swapId={swap.id} />
        </div>
        <aside className="space-y-6 rounded-3xl bg-[#11150f] p-6 text-[#f5f6f2] sm:p-8 lg:sticky lg:top-6">
          <p className="text-sm text-[#a7ada2]">Summary</p>
          <div>
            <p className="mb-2 text-sm text-[#a7ada2]">
              {exceptional ? "Original quote" : "You pay"}
            </p>
            <p className="break-words text-4xl font-semibold tabular-nums tracking-tight">
              {amount}
            </p>
            <p className="mt-2 text-sm text-[#a7ada2]">
              {swap.source_token.symbol} on{" "}
              {toChainName(swap.source_token.chain)}
            </p>
          </div>
          <dl className="space-y-3 border-t border-white/15 pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#a7ada2]">Recipients</dt>
              <dd>{payout.recipients.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              {/* A preview at the committed fee; a raised claim fee comes out
                  of the surplus, and the success step shows what was paid. */}
              <dt className="text-[#a7ada2]">Expected recipient payouts</dt>
              <dd>~{(Number(total) / 1e8).toFixed(8)} BTC</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#a7ada2]">Bitcoin transaction fee</dt>
              <dd>~{Number(paymentFee).toLocaleString()} sats</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#a7ada2]">Swap fee</dt>
              <dd>{totalFeeSats(swap).toLocaleString()} sats</dd>
            </div>
          </dl>
          <div
            role="status"
            className="flex justify-between gap-3 border-t border-white/15 pt-5 text-sm"
          >
            <span className="text-[#a7ada2]">Status</span>
            <span className={exceptional ? "text-amber-300" : "text-lime-400"}>
              {status}
            </span>
          </div>
          {recoveryState && (
            <p className="text-sm leading-relaxed text-[#a7ada2]">
              {step === "expired"
                ? "If you already sent a deposit, wait for its status to update before funding another payment."
                : "Retrying with the existing funds is not supported for this payment. Refund availability is shown in the recovery panel."}
            </p>
          )}
          {!exceptional && (
            <button
              type="button"
              onClick={() => navigate("/pay")}
              className="h-12 w-full rounded-full border border-white/20 text-sm hover:bg-white/5"
            >
              New swap
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}
