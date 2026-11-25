import { allocateBitcoinPayout, toChainName } from "@satora/swap";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { GetSwapResponse, StoredSwap } from "../api";
import { payUsd } from "../components/PayRecipients";
import { payUsdValuation } from "./payUsdValue";

interface Receipt {
  swap: GetSwapResponse;
  payout: NonNullable<StoredSwap["bitcoinPayout"]>;
  names?: string[];
  usdRate?: number;
  feeSats: string;
}

/** An explicit allowlist keeps wallet seeds and swap keys out of receipts. */
export function buildPayReceipt({
  swap,
  payout,
  names = [],
  usdRate,
  feeSats,
}: Receipt): TDocumentDefinitions {
  // Stored amounts are floors; the claim shared the surplus in proportion.
  try {
    payout = allocateBitcoinPayout(
      payout,
      BigInt(swap.target_amount),
      BigInt(feeSats),
    );
  } catch {
    // Funding below the floors: show the commitments as stored.
  }
  const valuation = payUsdValuation(swap, usdRate);
  const btc = (sats: string | bigint) =>
    `${(Number(sats) / 1e8).toFixed(8)} BTC`;
  const usd = (sats: string | bigint | number) =>
    valuation
      ? `~ ${payUsd((Number(sats) / 1e8) * valuation.rate)}`
      : "USD unavailable";
  const total = payout.recipients.reduce(
    (sum, r) => sum + BigInt(r.amountSats),
    0n,
  );
  const funding = Number(swap.source_amount) / 10 ** swap.source_token.decimals;
  const stablecoin = ["USDC", "USDT", "USDT0"].includes(
    swap.source_token.symbol.toUpperCase(),
  );
  const txid =
    swap.direction === "evm_to_bitcoin" ? swap.btc_claim_txid : undefined;
  const detail = (label: string, value: string): Content => ({
    columns: [
      { text: label, width: 110, color: "#6b706b" },
      { text: value, width: "*" },
    ],
    margin: [0, 0, 0, 12],
  });
  const content: Content[] = [
    { text: "SATORA PAY / RECEIPT", color: "#6b706b", margin: [0, 0, 0, 20] },
    {
      text: "Payment complete",
      fontSize: 28,
      bold: true,
      margin: [0, 0, 0, 12],
    },
    {
      text: `${payout.recipients.length} recipients / ${btc(total)} paid / ${usd(total)}`,
      color: "#6b706b",
      margin: [0, 0, 0, 28],
    },
    detail("Payment ID", swap.id),
    detail(
      "Created (UTC)",
      new Date(swap.created_at)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, " UTC"),
    ),
    detail(
      "Funding",
      `${funding} ${swap.source_token.symbol} on ${toChainName(swap.source_token.chain)}${stablecoin ? ` / ${payUsd(funding)}` : ""}`,
    ),
  ];
  if (!["bitcoin", "mainnet"].includes(swap.network.toLowerCase()))
    content.push(detail("Bitcoin network", swap.network));
  content.push({
    margin: [0, 16, 0, 24],
    table: {
      widths: [20, "*", 130],
      dontBreakRows: true,
      body: payout.recipients.map((r, i) => [
        { text: String(i + 1), color: "#6b706b" },
        {
          stack: [
            { text: names[i] || `Recipient ${i + 1}`, bold: true },
            {
              text: r.address,
              fontSize: 9,
              color: "#6b706b",
              margin: [0, 6, 0, 0],
            },
          ],
        },
        {
          stack: [
            { text: btc(r.amountSats) },
            { text: usd(r.amountSats), color: "#6b706b", margin: [0, 6, 0, 0] },
          ],
          alignment: "right",
        },
      ]),
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => "#e1e4df",
      paddingTop: () => 16,
      paddingBottom: () => 16,
    },
  });
  content.push(
    detail("Recipient payouts", `${btc(total)} / ${usd(total)}`),
    detail("Bitcoin fee", `${feeSats} sats / ${usd(feeSats)}`),
    detail("Swap fee", `${swap.fee_sats} sats / ${usd(swap.fee_sats)}`),
    detail("Bitcoin transaction", txid || "Awaiting synchronization"),
    {
      text:
        valuation?.basis === "review"
          ? `USD equivalents use the review rate of ${payUsd(valuation.rate)} per BTC.`
          : valuation
            ? `USD equivalents are estimates derived from this payment's recorded funding and Bitcoin amounts, including conversion costs (${payUsd(valuation.rate)} per BTC).`
            : "A USD valuation is unavailable for this payment.",
      fontSize: 9,
      color: "#6b706b",
      margin: [0, 12, 0, 6],
    },
    {
      text: "Stablecoin values assume 1 USDC = 1 USDT = 1 USDT0 = 1 USD.",
      fontSize: 9,
      color: "#6b706b",
    },
  );
  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    info: { title: `Satora Pay receipt ${swap.id}`, author: "Satora" },
    defaultStyle: { font: "Roboto", fontSize: 11, color: "#191d1f" },
    content,
    footer: (page, pages) => ({
      text: `${page} / ${pages}`,
      alignment: "right",
      margin: [0, 0, 40, 0],
      fontSize: 9,
      color: "#6b706b",
    }),
  };
}

export async function downloadPayReceipt(receipt: Receipt): Promise<void> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  await pdfMake
    .createPdf(buildPayReceipt(receipt))
    .download(`satora-pay-receipt-${receipt.swap.id}.pdf`);
}
