import { describe, expect, it } from "vitest";
import { normalizeScannedText } from "./qrScan";

describe("normalizeScannedText", () => {
  it("lowercases all-caps BOLT11 invoices", () => {
    expect(normalizeScannedText("LNBC10U1P3ABC")).toBe("lnbc10u1p3abc");
  });

  it("lowercases all-caps lightning: URIs", () => {
    expect(normalizeScannedText("LIGHTNING:LNBC10U1P3ABC")).toBe(
      "lightning:lnbc10u1p3abc",
    );
  });

  it("lowercases all-caps bech32 bitcoin: URIs including params", () => {
    expect(
      normalizeScannedText("BITCOIN:BC1QXYZ?AMOUNT=0.001&LIGHTNING=LNBC1ABC"),
    ).toBe("bitcoin:bc1qxyz?amount=0.001&lightning=lnbc1abc");
  });

  it("lowercases all-caps LNURL and ark addresses", () => {
    expect(normalizeScannedText("LNURL1DP68GURN")).toBe("lnurl1dp68gurn");
    expect(normalizeScannedText("ARK:TARK1QABC")).toBe("ark:tark1qabc");
  });

  it("leaves mixed-case input untouched", () => {
    const evm = "0xAbC123def4567890aBcDeF1234567890abCdEf12";
    expect(normalizeScannedText(evm)).toBe(evm);
    const sol = "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK";
    expect(normalizeScannedText(sol)).toBe(sol);
    const lnaddr = "Bono@satora.io";
    expect(normalizeScannedText(lnaddr)).toBe(lnaddr);
  });

  it("only lowercases the scheme for non-bech32 payloads", () => {
    expect(normalizeScannedText("BITCOIN:1A1Z")).toBe("bitcoin:1A1Z");
  });

  it("trims whitespace", () => {
    expect(normalizeScannedText("  lnbc1abc \n")).toBe("lnbc1abc");
  });
});
