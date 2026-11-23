import { describe, expect, it } from "vitest";
import { fillForLimit, limitCheckedSats, limitSide } from "./swapLimitSide";

const quote = { protocol_fee_rate: 0.0025, network_fee: 500 };

describe("limitSide", () => {
  it("matches the side each server route checks", () => {
    // BTC → Arkade / Lightning / on-chain: what the user receives.
    expect(limitSide(true, true, false)).toBe("target");
    expect(limitSide(true, true, true)).toBe("target");
    // BTC → EVM: what the user sends.
    expect(limitSide(true, false, false)).toBe("source");
    // EVM → Lightning: the invoice amount.
    expect(limitSide(false, true, true)).toBe("target");
    // EVM → on-chain / Arkade: the gross BTC-equivalent lock.
    expect(limitSide(false, true, false)).toBe("grossTarget");
  });
});

describe("limitCheckedSats", () => {
  it("reads the checked side", () => {
    expect(limitCheckedSats("source", 1000, 990, quote)).toBe(1000);
    expect(limitCheckedSats("target", 1000, 990, quote)).toBe(990);
  });

  it("grosses up the payout on EVM-source routes", () => {
    expect(limitCheckedSats("grossTarget", undefined, 99_250, quote)).toBe(
      Math.ceil(99_750 / 0.9975),
    );
  });
});

describe("fillForLimit", () => {
  it("fills the checked side directly", () => {
    expect(fillForLimit("source", 10_000, "min", quote)).toEqual({
      field: "source",
      amount: 10_000,
    });
    expect(fillForLimit("target", 10_000, "min", quote)).toEqual({
      field: "target",
      amount: 10_000,
    });
  });

  it("keeps a filled Max inside the limit on EVM-source routes", () => {
    const max = 100_000_000;
    const { field, amount } = fillForLimit("grossTarget", max, "max", quote);
    expect(field).toBe("target");
    expect(
      limitCheckedSats("grossTarget", undefined, amount, quote),
    ).toBeLessThanOrEqual(max);
  });

  it("fills Min as-is on EVM-source routes: the gross amount is above it", () => {
    const { amount } = fillForLimit("grossTarget", 10_000, "min", quote);
    expect(amount).toBe(10_000);
    expect(
      limitCheckedSats("grossTarget", undefined, amount, quote),
    ).toBeGreaterThanOrEqual(10_000);
  });
});
