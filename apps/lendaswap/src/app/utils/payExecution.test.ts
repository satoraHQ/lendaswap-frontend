import { describe, expect, it } from "vitest";
import { executedPayment, type PaymentTransaction } from "./payExecution";

const original = {
  recipients: [
    { address: "bob", amountSats: "10000" },
    { address: "bob", amountSats: "20000" },
  ],
  feeSats: "472",
  maxSlippageBps: 100,
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
});
