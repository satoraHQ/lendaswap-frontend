import pdfMake from "pdfmake/build/pdfmake";
import fonts from "pdfmake/build/vfs_fonts";
import { describe, expect, it } from "vitest";
import type { GetSwapResponse } from "../api";
import { buildPayReceipt } from "./payReceipt";
import { payUsdValuation } from "./payUsdValue";

const swap = {
  id: "receipt-test",
  direction: "evm_to_bitcoin",
  created_at: "2026-11-12T02:29:48Z",
  source_amount: "9491057",
  target_amount: "12643",
  fee_sats: 190,
  source_token: { decimals: 6, symbol: "USDT0", chain: "42161" },
  network: "signet",
  btc_claim_txid: "replaced-transaction",
  secretKey: "must-not-export",
} as unknown as GetSwapResponse;
const receipt = {
  swap,
  payout: {
    recipients: [
      { address: "tb1-address", amountSats: "6765" },
      { address: "tb1-address-2", amountSats: "5412" },
    ],
    feeSats: "472",
  },
  names: ["Bob", "Alice"],
  feeSats: "466",
  txid: "public-transaction",
};

describe("payment PDF receipts", () => {
  it("includes names, USD amounts, actual fees and transaction without recovery secrets", () => {
    const content = JSON.stringify(
      buildPayReceipt({ ...receipt, usdRate: 73907.628 }).content,
    );
    for (const value of [
      "0.00006765 BTC",
      "$5.00",
      "$4.00",
      "$9.00",
      "466 sats / ~ $0.34",
      "9.491057 USDT0 on Arbitrum / $9.49",
      "public-transaction",
      "Bob",
      "Alice",
      "signet",
    ])
      expect(content).toContain(value);
    expect(content).not.toContain("must-not-export");
    // A speed-up leaves the server on the replaced claim; the receipt names
    // the transaction the payout was verified against.
    expect(content).not.toContain("replaced-transaction");
  });
  it("reports the verified amounts as given, whatever the recorded funding", () => {
    const content = JSON.stringify(
      buildPayReceipt({
        ...receipt,
        // A funding figure above outputs plus fee must not inflate the payouts.
        swap: { ...swap, target_amount: "12743" },
        usdRate: 100000,
      }).content,
    );
    expect(content).toContain("0.00006765 BTC");
    expect(content).toContain("0.00005412 BTC");
    expect(content).toContain("$6.77");
    expect(content).toContain("466 sats");
    expect(content).not.toContain("0.00006821 BTC");
  });
  it("shows estimated USD costs for older payments and prefers a saved review rate", () => {
    const content = JSON.stringify(buildPayReceipt(receipt).content);
    expect(content).toContain("$5.00");
    expect(content).toContain("$4.00");
    expect(content).toContain("derived from this payment's recorded funding");
    expect(payUsdValuation(swap, 74000)).toEqual({
      rate: 74000,
      basis: "review",
    });
    expect(
      payUsdValuation({ ...swap, source_amount: "invalid" }),
    ).toBeUndefined();
  });
  it.each(["bitcoin", "mainnet"])("omits the network row for %s", (network) => {
    expect(
      JSON.stringify(
        buildPayReceipt({ ...receipt, swap: { ...swap, network } }).content,
      ),
    ).not.toContain("Bitcoin network");
  });
  it("generates a real multipage PDF with embedded fonts", async () => {
    pdfMake.addVirtualFileSystem(fonts);
    const doc = buildPayReceipt({
      ...receipt,
      names: Array.from({ length: 100 }, (_, i) => `Recipient ${i + 1} – José`),
      payout: {
        ...receipt.payout,
        recipients: Array.from({ length: 100 }, () => ({
          address: "tb1qmt3ue2senlg6ddgmr76hwsk0rdvdk4rgeaen7l",
          amountSats: "6765",
        })),
      },
    });
    const buffer = await pdfMake.createPdf(doc).getBuffer();
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(10000);
  });
});
