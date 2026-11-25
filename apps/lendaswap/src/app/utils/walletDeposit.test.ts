import { describe, expect, it } from "vitest";
import { remainingDepositAmount } from "./walletDeposit";

describe("wallet deposit amount", () => {
  it("preserves the exact quote in base units", () => {
    expect(remainingDepositAmount(15501205n, 0n, 200, 100000)).toBe(15501205n);
    expect(remainingDepositAmount(9007199254740993123n, 1n, 200, 100000)).toBe(
      9007199254740993122n,
    );
  });
  it("only transfers the shortfall after a partial deposit", () => {
    expect(remainingDepositAmount(15501205n, 10000000n, 200, 100000)).toBe(
      5501205n,
    );
  });
  it("does not transfer again after sufficient funding", () => {
    expect(remainingDepositAmount(15501205n, 15501205n, 200, 100000)).toBe(0n);
    expect(remainingDepositAmount(15501205n, 16000000n, 200, 100000)).toBe(0n);
  });
  it("rejects an expired funding window and invalid amounts", () => {
    expect(() => remainingDepositAmount(15501205n, 0n, 200, 200000)).toThrow(
      "expired",
    );
    expect(() => remainingDepositAmount(0n, 0n, 200, 100000)).toThrow(
      "Invalid",
    );
  });
});
