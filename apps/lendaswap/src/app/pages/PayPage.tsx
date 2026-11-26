import { isBtcOnchain, type TokenInfo, toChainName } from "@satora/swap";
import { Network, validate } from "bitcoin-address-validation";
import { ArrowRight, Bitcoin, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { api, type QuoteResponse } from "../api";
import { AssetDropDown } from "../components/AssetDropDown";
import {
  HigherLimitsDialog,
  type HigherLimitsRequest,
} from "../components/HigherLimitsDialog";
import { PayBackupImport } from "../components/PayBackupImport";
import { PayRecipients } from "../components/PayRecipients";
import {
  parseBitcoinNetwork,
  validBitcoinAddress,
} from "../utils/bitcoinNetwork";
import { downloadPayBackup } from "../utils/payBackup";
import { paymentFeeSats } from "../utils/payFees";

interface Recipient {
  id: string;
  name: string;
  address: string;
  amount: string;
}
const recipient = (): Recipient => ({
  id: crypto.randomUUID(),
  name: "",
  address: "",
  amount: "",
});

export function PayPage() {
  const { state } = useLocation();
  const retryPayment = state?.retryPayment as
    | {
        sourceId: string;
        names?: string[];
        recipients: { address: string; amountSats: string }[];
        feeSats: string;
        recovery: string;
        /** An expired payment whose deposit funds this one. */
        fundFromSwapId?: string;
      }
    | undefined;
  const [network, setNetwork] = useState<Network>();
  const validAddress = (address: string) =>
    !!network && validBitcoinAddress(address, network);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [target, setTarget] = useState<TokenInfo>();
  const [sourceId, setSourceId] = useState(retryPayment?.sourceId ?? "");
  const [rows, setRows] = useState<Recipient[]>(
    () =>
      retryPayment?.recipients.map((r, i) => ({
        ...recipient(),
        address: r.address,
        name: retryPayment.names?.[i] ?? "",
        amount: (Number(r.amountSats) / 1e8).toFixed(8),
      })) ?? [recipient()],
  );
  const [unit, setUnit] = useState(retryPayment ? "BTC" : "USD");
  const [fee, setFee] = useState(retryPayment?.feeSats ?? "2");
  const [feeMode, setFeeMode] = useState<"absolute" | "rate">(
    retryPayment ? "absolute" : "rate",
  );
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [recovery, setRecovery] = useState(retryPayment?.recovery ?? "");
  const [limitRequest, setLimitRequest] = useState<HigherLimitsRequest>();
  const [error, setError] = useState("");
  const [addressesSubmitted, setAddressesSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{
    quote: QuoteResponse;
    amounts: number[];
    total: number;
    at: number;
    feeSats: number;
    /** USD per BTC: for USD entry, the rate the amounts were converted at. */
    usdRate: number;
  }>();
  const navigate = useNavigate();
  const source = tokens.find((t) => `${t.chain}:${t.token_id}` === sourceId);
  // The expired payment's deposit only funds a retry in the same token.
  const fundFromSwapId =
    retryPayment?.fundFromSwapId && sourceId === retryPayment.sourceId
      ? retryPayment.fundFromSwapId
      : undefined;
  useEffect(() => {
    Promise.all([api.getTokens(), api.getBitcoinNetwork()])
      .then(([data, backendNetwork]) => {
        setNetwork(parseBitcoinNetwork(backendNetwork));
        const all = data.evm_tokens;
        const selected = all.filter(
          (t, i) =>
            ["USDC", "USDT", "USDT0"].includes(t.symbol) &&
            ["1", "42161"].includes(String(t.chain)) &&
            all.findIndex(
              (x) => x.chain === t.chain && x.token_id === t.token_id,
            ) === i,
        );
        setTokens(selected);
        const defaultSource =
          selected.find(
            (t) =>
              `${t.chain}:${t.token_id}`.toLowerCase() ===
              import.meta.env.VITE_PAY_DEFAULT_SOURCE?.toLowerCase(),
          ) ?? selected[0];
        if (defaultSource)
          setSourceId((current) =>
            selected.some((t) => `${t.chain}:${t.token_id}` === current)
              ? current
              : `${defaultSource.chain}:${defaultSource.token_id}`,
          );
        setTarget(data.btc_tokens.find(isBtcOnchain));
      })
      .catch((e) => setError(String(e)));
  }, []);
  const invalidate = () => {
    setLimitRequest(undefined);
    setReview(undefined);
    setError("");
  };
  const edit = (id: string, patch: Partial<Recipient>) => {
    invalidate();
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  async function quote() {
    setLimitRequest(undefined);
    setAddressesSubmitted(true);
    setBusy(true);
    setError("");
    setReview(undefined);
    try {
      if (rows.some((r) => r.name.length > 200))
        throw new Error("Recipient names must be 200 characters or fewer.");
      if (!source || !target || !network)
        throw new Error("Select an available funding asset.");
      if (!validAddress(recovery.trim()))
        throw new Error("Enter your Bitcoin recovery address.");
      const invalidRecipient = rows.findIndex(
        (r) => !validAddress(r.address.trim()),
      );
      if (invalidRecipient !== -1)
        throw new Error(
          `Recipient ${invalidRecipient + 1}: enter a valid Bitcoin address for ${network}.`,
        );
      const absoluteFee = paymentFeeSats(fee, feeMode, rows.length);
      for (const [i, r] of rows.entries()) {
        if (!validAddress(r.address.trim()))
          throw new Error(`Recipient ${i + 1}: enter a valid Bitcoin address.`);
        if (
          !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(r.amount) ||
          Number(r.amount) <= 0 ||
          r.amount.split(".")[1]?.length > (unit === "BTC" ? 8 : 2)
        )
          throw new Error(
            `Recipient ${i + 1}: enter a positive ${unit} amount with at most ${unit === "BTC" ? 8 : 2} decimal places.`,
          );
      }
      const getQuote = (targetAmount: number) =>
        api.getQuote({
          sourceChain: source.chain,
          sourceToken: source.token_id,
          targetChain: target.chain,
          targetToken: target.token_id,
          targetAmount,
        });
      const rate =
        unit === "USD" ? Number((await getQuote(100000)).exchange_rate) : 1;
      if (!Number.isFinite(rate) || rate <= 0)
        throw new Error("No valid exchange rate available.");
      const amounts = rows.map((r) =>
        Math.round((Number(r.amount) * 1e8) / rate),
      );
      if (amounts.some((a) => !Number.isSafeInteger(a) || a < 546))
        throw new Error("Each recipient must receive at least 546 sats.");
      const total = amounts.reduce((a, b) => a + b, absoluteFee);
      if (!Number.isSafeInteger(total))
        throw new Error("Payment total is too large.");
      const result = await getQuote(total);
      if (total > result.max_amount) {
        setLimitRequest({
          requestedSats: total,
          maximumSats: result.max_amount,
          route: `${source.symbol} on ${toChainName(source.chain)} → Bitcoin`,
        });
        throw new Error(
          `Payment exceeds the maximum of ${result.max_amount.toLocaleString()} sats.`,
        );
      }
      if (total < result.min_amount)
        throw new Error(
          `Total must be between ${result.min_amount} and ${result.max_amount} sats.`,
        );
      setReview({
        quote: result,
        amounts,
        total,
        at: Date.now(),
        feeSats: absoluteFee,
        // Show and save the rate the sats were computed at, not a second
        // quote's, so a $100 entry reviews as $100.
        usdRate: unit === "USD" ? rate : Number(result.exchange_rate),
      });
      setNow(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (!review || !source || !target) return;
    if (Date.now() - review.at > 60000) {
      invalidate();
      setError("Quote expired. Review a fresh quote before paying.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const bitcoinPayout = {
        recipients: rows.map((r, i) => ({
          address: r.address.trim(),
          amountSats: String(review.amounts[i]),
        })),
        feeSats: String(review.feeSats),
        maxSlippageBps: 100,
      };
      if (!["1", "42161"].includes(String(source.chain)))
        throw new Error("Satora Pay supports Ethereum and Arbitrum only.");
      const swap = await api.createSwap({
        sourceAsset: source,
        targetAsset: target,
        targetAmount: review.total,
        targetAddress: recovery.trim(),
        bitcoinPayout,
        gasless: true,
        fundFromSwapId,
      });
      // Save names and requested amounts now, so they survive even if the
      // backup below fails: retries re-quote these amounts, not the floors.
      await api
        .savePayMetadata(swap.id, {
          recipientNames: rows.map((r) => r.name),
          usdRate: review.usdRate,
          requestedAmounts: review.amounts.map(String),
        })
        .catch(() => undefined);
      let backupFailed = false;
      try {
        downloadPayBackup(
          await api.exportPayBackup(
            swap.id,
            rows.map((r) => r.name),
            review.usdRate,
            review.amounts.map(String),
          ),
        );
      } catch {
        // Continue to the created swap rather than inviting duplicate creation.
        backupFailed = true;
      }
      navigate(`/pay/${swap.id}`, { state: { backupFailed } });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const expired = !!review && now - review.at >= 60000;
  const usd = (value: number) =>
    value.toLocaleString(undefined, { style: "currency", currency: "USD" });
  const satsUsd = (sats: number) => usd((sats / 1e8) * (review?.usdRate ?? 0));
  const btc = (sats: number) => (sats / 1e8).toFixed(8);
  const payoutTotal = review?.amounts.reduce((a, b) => a + b, 0);
  const tokenAmount = (amount: string | number) =>
    (Number(amount) / 10 ** (source?.decimals ?? 6)).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  const addressProps = {
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "none",
    spellCheck: false,
    "data-1p-ignore": true,
    "data-lpignore": "true",
    "data-bwignore": true,
  } as const;
  let estimatedFee: number | undefined;
  try {
    estimatedFee = paymentFeeSats(fee, feeMode, rows.length);
  } catch {
    /* Validation is displayed on review. */
  }
  return (
    <section className="space-y-8 pb-12">
      <header className="space-y-4">
        <nav
          aria-label="Payment progress"
          className="flex items-center gap-3 text-sm text-muted-foreground"
        >
          <button
            type="button"
            aria-current={!review ? "step" : undefined}
            disabled={busy}
            onClick={() => {
              if (review) invalidate();
            }}
            className={`rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 ${!review ? "font-semibold text-foreground" : "underline-offset-4 hover:text-foreground hover:underline"}`}
          >
            1 · Recipients
          </button>
          <span>—</span>
          <span
            aria-current={review ? "step" : undefined}
            className={review ? "font-semibold text-foreground" : ""}
          >
            2 · Review
          </span>
          <span>—</span>
          <span>3 · Fund</span>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          One swap. Multiple Bitcoin payments.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Send USDC or USDT on Ethereum or Arbitrum. Everyone gets paid in
          onchain BTC.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <div className="min-w-0 rounded-3xl border bg-card p-5 sm:p-8">
          {review ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Review payment</h2>
                <span
                  role="status"
                  className={
                    expired
                      ? "text-sm text-destructive"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {expired
                    ? "Estimate expired"
                    : `Refresh in ${Math.max(0, Math.ceil((60000 - (now - review.at)) / 1000))}s`}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Recipient amounts may be up to 1% lower after conversion. Any
                reduction is shared proportionally; the Bitcoin transaction fee
                stays reserved. Your funding amount is confirmed in the next
                step.
              </p>
              <PayRecipients
                recipients={rows.map((r, i) => ({
                  address: r.address,
                  amountSats: String(review.amounts[i]),
                }))}
                names={rows.map((r) => r.name)}
                usdRate={review.usdRate}
              />
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Paying from</dt>
                  <dd>
                    {source?.symbol} · {source && toChainName(source.chain)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Your recovery address
                  </dt>
                  <dd className="mt-2 break-all font-mono text-xs">
                    {recovery}
                  </dd>
                </div>
              </dl>
              <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                Keep this browser’s payment data until completion. A payment
                recovery backup downloads when you continue. It contains your
                wallet seed; keep it private. Seed-only recovery sends the
                aggregate BTC to your recovery address.
              </p>
            </div>
          ) : (
            <fieldset
              disabled={busy}
              className="min-w-0 space-y-6 disabled:opacity-60"
            >
              <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
                <div className="min-w-0 space-y-2">
                  <p className="text-sm text-muted-foreground">You pay</p>
                  <AssetDropDown
                    value={source}
                    availableAssets={tokens}
                    onChange={(t) => {
                      invalidate();
                      setSourceId(`${t.chain}:${t.token_id}`);
                    }}
                  />
                </div>
                <ArrowRight
                  aria-hidden
                  className="hidden h-5 w-5 text-muted-foreground sm:block"
                />
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Recipients receive
                  </p>
                  <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                    <span className="rounded-full bg-orange-500 p-2 text-white">
                      <Bitcoin className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold">BTC</p>
                      <p className="text-xs text-muted-foreground">
                        Bitcoin{" "}
                        {network === Network.mainnet
                          ? "onchain"
                          : (network ?? "network loading…")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  Recipients{" "}
                  <span className="font-normal text-muted-foreground">
                    {rows.length}
                  </span>
                </h2>
                <div
                  role="group"
                  aria-label="Amount currency"
                  className="flex rounded-xl bg-muted p-1"
                >
                  {["USD", "BTC"].map((u) => (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={unit === u}
                      className={`rounded-lg px-4 py-2 text-sm font-medium ${unit === u ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                      onClick={() => {
                        invalidate();
                        setUnit(u);
                        setRows(rows.map((r) => ({ ...r, amount: "" })));
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                1 USDC = 1 USDT = 1 USD for amount entry. Fees are added to your
                total. Switching units clears entered amounts.
              </p>
              <div className="space-y-3">
                {rows.map((r, i) => (
                  <div
                    key={r.id}
                    className="space-y-3 rounded-2xl border bg-muted/20 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs text-background">
                        {i + 1}
                      </span>
                      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                        <Input
                          aria-label={`Recipient ${i + 1} name`}
                          placeholder="Name (optional)"
                          maxLength={200}
                          value={r.name}
                          onChange={(e) => edit(r.id, { name: e.target.value })}
                          {...addressProps}
                        />
                        <div className="relative">
                          <Input
                            className="pr-14 tabular-nums"
                            aria-label={`Recipient ${i + 1} amount in ${unit}`}
                            placeholder="0.00"
                            inputMode="decimal"
                            value={r.amount}
                            onChange={(e) =>
                              edit(r.id, { amount: e.target.value })
                            }
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <BitcoinAddressField
                        network={network}
                        id={`pay-recipient-${r.id}`}
                        label={`Recipient ${i + 1} Bitcoin address`}
                        placeholder="Bitcoin address"
                        value={r.address}
                        onChange={(value) => edit(r.id, { address: value })}
                        submitted={addressesSubmitted}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove recipient ${i + 1}`}
                        disabled={rows.length === 1}
                        onClick={() => {
                          invalidate();
                          setRows(rows.filter((x) => x.id !== r.id));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-dashed"
                disabled={rows.length >= 100}
                onClick={() => {
                  invalidate();
                  setRows([...rows, recipient()]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add recipient
              </Button>
              <div className="space-y-3 border-t pt-6">
                <label htmlFor="pay-recovery" className="text-sm font-medium">
                  Your Bitcoin recovery address
                </label>
                <BitcoinAddressField
                  network={network}
                  id="pay-recovery"
                  label="Your Bitcoin recovery address"
                  placeholder="An address you control"
                  value={recovery}
                  onChange={(value) => {
                    invalidate();
                    setRecovery(value);
                  }}
                  submitted={addressesSubmitted}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  If the recipient list is lost, you can recover the full BTC
                  amount to this address. Use an address you control.
                </p>
              </div>
              <details className="border-t pt-5">
                <summary className="cursor-pointer text-sm font-medium">
                  Bitcoin transaction fee{" "}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {estimatedFee?.toLocaleString() ?? "—"} sats
                  </span>
                </summary>
                <div className="mt-4 space-y-3">
                  <div
                    role="group"
                    aria-label="Bitcoin fee unit"
                    className="flex gap-2"
                  >
                    {(["rate", "absolute"] as const).map((mode) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={feeMode === mode ? "default" : "outline"}
                        aria-pressed={feeMode === mode}
                        onClick={() => {
                          invalidate();
                          setFeeMode(mode);
                          setFee(
                            mode === "absolute"
                              ? String(estimatedFee ?? 2000)
                              : String(
                                  Math.floor(
                                    ((estimatedFee ?? 2000) /
                                      (150 + rows.length * 43)) *
                                      1e8,
                                  ) / 1e8,
                                ),
                          );
                        }}
                      >
                        {mode === "rate" ? "sat/vB" : "Total sats"}
                      </Button>
                    ))}
                  </div>
                  <Input
                    aria-label={
                      feeMode === "rate"
                        ? "Bitcoin fee rate in satoshis per virtual byte"
                        : "Bitcoin fee in satoshis"
                    }
                    inputMode="decimal"
                    value={fee}
                    onChange={(e) => {
                      invalidate();
                      setFee(e.target.value);
                    }}
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {feeMode === "rate"
                      ? "Fractional rates are supported. Only the total fee is rounded up to a whole satoshi using the estimated transaction size. "
                      : "This is the total miner fee for all recipients. "}
                    The reserved fee is preserved. Recipient amounts may be up
                    to 1% lower after conversion. Low fees may delay
                    confirmation or be rejected by the broadcast service.
                  </p>
                </div>
              </details>
            </fieldset>
          )}
        </div>
        <aside className="space-y-6 rounded-3xl bg-[#11150f] p-6 text-[#f5f6f2] sm:p-8 lg:sticky lg:top-6">
          <p className="text-sm text-[#a7ada2]">Summary</p>
          <div>
            <p className="mb-2 text-sm text-[#a7ada2]">Estimated funding</p>
            <p className="break-words text-4xl font-semibold tabular-nums tracking-tight">
              {review
                ? usd(
                    Number(review.quote.net_source_amount) /
                      10 ** (source?.decimals ?? 6),
                  )
                : "—"}
            </p>
            <p className="mt-2 text-sm text-[#a7ada2]">
              {source
                ? `${review ? tokenAmount(review.quote.net_source_amount) + " " : ""}${source.symbol} on ${toChainName(source.chain)}`
                : "Loading assets…"}
            </p>
          </div>
          <dl className="space-y-3 border-t border-white/15 pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#a7ada2]">Recipients</dt>
              <dd>{rows.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#a7ada2]">Recipient payouts</dt>
              <dd className="text-right">
                {payoutTotal !== undefined ? satsUsd(payoutTotal) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#a7ada2]">Bitcoin transaction fee</dt>
              <dd className="text-right">
                {review
                  ? `~${satsUsd(review.feeSats)}`
                  : estimatedFee !== undefined
                    ? `~${estimatedFee.toLocaleString()} sats`
                    : "—"}
              </dd>
            </div>
            {review && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#a7ada2]">Swap fee</dt>
                  <dd className="text-right">
                    {satsUsd(
                      review.quote.protocol_fee + review.quote.network_fee,
                    )}
                  </dd>
                </div>
                {review.quote.gasless_network_fee > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#a7ada2]">Quoted relay fee</dt>
                    <dd className="text-right">
                      {satsUsd(review.quote.gasless_network_fee)}
                    </dd>
                  </div>
                )}
                {review.quote.bridge_fee != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#a7ada2]">Bridge fee</dt>
                    <dd>
                      {(review.quote.bridge_fee / 1e6).toFixed(6)}{" "}
                      {source?.symbol}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-[#a7ada2]">Total BTC to recipients</dt>
                  <dd className="font-mono">{btc(payoutTotal ?? 0)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#a7ada2]">Quoted exchange rate</dt>
                  <dd>1 BTC ≈ {usd(review.usdRate)}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="text-xs leading-relaxed text-[#a7ada2]">
            {review
              ? "Funding estimate includes quoted swap and relay fees. The final deposit amount is confirmed in the funding step. No wallet connection or separate gas balance is needed here."
              : "Review to fetch a live quote and see the full fee breakdown."}
          </p>
          {retryPayment?.fundFromSwapId && (
            <p role="status" className="text-xs leading-relaxed text-[#a7ada2]">
              {fundFromSwapId
                ? "Your earlier deposit counts towards this payment. The funding step asks only for what is missing."
                : "Your earlier deposit is in another token and does not count towards this payment. Switch back to that token to use it."}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-200"
            >
              {error}
            </p>
          )}
          {limitRequest && (
            <HigherLimitsDialog {...limitRequest} initiallyOpen />
          )}
          <div className="space-y-3">
            <Button
              className="h-12 w-full rounded-full bg-lime-400 font-semibold text-black hover:bg-lime-300"
              disabled={busy || !source || !target || !network}
              onClick={review && !expired ? pay : quote}
            >
              {busy
                ? "Please wait…"
                : expired
                  ? "Refresh estimate"
                  : review
                    ? "Show deposit address"
                    : "Review payment"}
            </Button>
            {review && (
              <button
                type="button"
                disabled={busy}
                className="h-12 w-full rounded-full border border-white/20 text-sm hover:bg-white/5 disabled:opacity-50"
                onClick={invalidate}
              >
                Edit recipients
              </button>
            )}
          </div>
        </aside>
      </div>
      {!review && (
        <div className="border-t pt-6">
          <PayBackupImport />
        </div>
      )}
    </section>
  );
}

function BitcoinAddressField({
  network,
  id,
  label,
  placeholder,
  value,
  onChange,
  submitted,
}: {
  network: Network | undefined;
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  submitted: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const trimmed = value.trim();
  const error = !trimmed
    ? "Enter a Bitcoin address."
    : !validate(trimmed)
      ? "Invalid Bitcoin address. Check the address and try again."
      : network && !validBitcoinAddress(trimmed, network)
        ? `Use a Bitcoin ${network} address.`
        : undefined;
  const showError = (touched || submitted) && !!error;
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Input
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={showError}
        aria-describedby={showError ? `${id}-error` : undefined}
        className={`font-mono text-sm ${showError ? "border-destructive focus-visible:ring-destructive" : ""}`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
      />
      {showError && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
