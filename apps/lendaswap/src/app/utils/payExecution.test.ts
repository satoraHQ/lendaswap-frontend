import { describe, expect, it } from "vitest";
import { executedPayment, type PaymentTransaction } from "./payExecution";

const original = {
  recipients: [
    { address: "bob", amountSats: "9900" },
    { address: "bob", amountSats: "19800" },
  ],
  feeSats: "472",
};
const tx: PaymentTransaction = {
  txid: "claim",
  fee: 600,
  vin: [
    {
      txid: "funding",
      prevout: { value: 30472, scriptpubkey_address: "htlc" },
    },
  ],
  vout: [
    { value: 9957, scriptpubkey_address: "bob" },
    { value: 19915, scriptpubkey_address: "bob" },
  ],
};
describe("executed payment recovery", () => {
  it("uses mined outputs and fee when restoring a backup made before a fee increase", () => {
    expect(executedPayment(original, tx, "claim", "htlc")).toEqual({
      recipients: [
        { address: "bob", amountSats: "9957" },
        { address: "bob", amountSats: "19915" },
      ],
      feeSats: "600",
    });
  });
  it("rejects unrelated transactions and unmatched outputs", () => {
    expect(() => executedPayment(original, tx, "other", "htlc")).toThrow();
    expect(() => executedPayment(original, tx, "claim", "other")).toThrow();
    expect(() =>
      executedPayment(
        original,
        {
          ...tx,
          vout: [
            { ...tx.vout[0], scriptpubkey_address: "mallory" },
            tx.vout[1],
          ],
        },
        "claim",
        "htlc",
      ),
    ).toThrow();
  });
  it("matches an uppercase bech32 recipient to the explorer's lowercase output", () => {
    const upper = "TB1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KXPJZSX";
    const result = executedPayment(
      {
        recipients: [{ address: upper, amountSats: "29000" }],
        feeSats: "472",
      },
      {
        ...tx,
        vout: [{ value: 29872, scriptpubkey_address: upper.toLowerCase() }],
      },
      "claim",
      "htlc",
    );
    expect(result.recipients[0]).toEqual({
      address: upper,
      amountSats: "29872",
    });
  });
  it("rejects an output below its recipient's committed floor", () => {
    expect(() =>
      executedPayment(
        {
          ...original,
          recipients: [
            { address: "bob", amountSats: "9958" },
            { address: "bob", amountSats: "19916" },
          ],
        },
        tx,
        "claim",
        "htlc",
      ),
    ).toThrow("do not match");
  });
});
