import { describe, expect, it } from "vitest";
import { paymentFeeSats } from "./payFees";

describe("payment fee entry", () => {
  it("reserves the SDK estimate for all recipients and rounds only the final fee", () => {
    expect(paymentFeeSats("2", "rate", 2)).toBe(472);
    expect(paymentFeeSats("2.1", "rate", 2)).toBe(496);
    expect(paymentFeeSats("2", "rate", 3)).toBe(558);
  });
  it("accepts sub-one rates and rounds the total up to whole sats", () => {
    expect(paymentFeeSats("0.5", "rate", 2)).toBe(118);
    expect(paymentFeeSats(".1", "rate", 2)).toBe(24);
    expect(paymentFeeSats("0.01", "rate", 2)).toBe(3);
    expect(paymentFeeSats("0.00000001", "rate", 2)).toBe(1);
  });
  it("keeps absolute fees unchanged", () =>
    expect(paymentFeeSats("2000", "absolute", 2)).toBe(2000));
  it("rejects invalid, fractional absolute, and excessive fees", () => {
    for (const input of ["", "-1", "NaN", "0", "2.5", "100001"])
      expect(() => paymentFeeSats(input, "absolute", 2)).toThrow();
    expect(() => paymentFeeSats("10000", "rate", 100)).toThrow();
  });
});
