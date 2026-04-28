import { describe, expect, it } from "vitest";
import {
  deriveSourceAmount,
  deriveTargetAmount,
  evmSmallestToSats,
  type QuoteFees,
  satsToEvmSmallest,
} from "./quoteUtils";

// Example: 1 BTC ≈ 70,000 USDC → exchangeRate = 70000
// USDC has 6 decimals
const USDC_RATE = 70_000;
const USDC_DECIMALS = 6;

// Zero-fee baseline for testing pure conversion
const ZERO_FEES: QuoteFees = { fixedFees: 0, protocolFeeRate: 0 };

// Realistic fees: 500 sats fixed (network + gasless), 0.25% protocol
const REAL_FEES: QuoteFees = { fixedFees: 500, protocolFeeRate: 0.0025 };

describe("satsToEvmSmallest", () => {
  it("converts 1 BTC to USDC smallest units", () => {
    // 100_000_000 sats * 70000 * 10^6 / 10^8 = 70_000_000_000 (70k USDC in 6-dec units)
    const result = satsToEvmSmallest(100_000_000, USDC_RATE, USDC_DECIMALS);
    expect(result).toBe(70_000_000_000);
  });

  it("converts 100k sats to USDC smallest units", () => {
    // 100_000 sats * 70000 * 10^6 / 10^8 = 70_000_000 (70 USDC)
    const result = satsToEvmSmallest(100_000, USDC_RATE, USDC_DECIMALS);
    expect(result).toBe(70_000_000);
  });

  it("returns 0 for 0 sats", () => {
    expect(satsToEvmSmallest(0, USDC_RATE, USDC_DECIMALS)).toBe(0);
  });
});

describe("evmSmallestToSats", () => {
  it("converts 70 USDC to sats", () => {
    // 70_000_000 * 10^8 / (70000 * 10^6) = 100_000 sats
    const result = evmSmallestToSats(70_000_000, USDC_RATE, USDC_DECIMALS);
    expect(result).toBe(100_000);
  });

  it("round-trips with satsToEvmSmallest", () => {
    const sats = 250_000;
    const evm = satsToEvmSmallest(sats, USDC_RATE, USDC_DECIMALS);
    const back = evmSmallestToSats(evm, USDC_RATE, USDC_DECIMALS);
    expect(back).toBeCloseTo(sats, 0);
  });
});

describe("deriveTargetAmount - BTC→EVM", () => {
  const base = {
    exchangeRate: USDC_RATE,
    evmDecimals: USDC_DECIMALS,
    isSourceBtc: true,
  };

  it("with zero fees, target = source converted at rate", () => {
    const target = deriveTargetAmount({
      ...base,
      amount: 100_000,
      fees: ZERO_FEES,
    });
    // 100k sats → 70 USDC = 70_000_000 smallest
    expect(target).toBe(70_000_000);
  });

  it("deducts fixed fees from BTC before conversion", () => {
    const feesOnlyFixed: QuoteFees = { fixedFees: 500, protocolFeeRate: 0 };
    const target = deriveTargetAmount({
      ...base,
      amount: 100_000,
      fees: feesOnlyFixed,
    });
    // (100_000 - 500) sats converted = 99_500 * 70000 * 1e6 / 1e8 = 69_650_000
    expect(target).toBe(69_650_000);
  });

  it("deducts protocol fee proportionally", () => {
    const feesOnlyProto: QuoteFees = { fixedFees: 0, protocolFeeRate: 0.0025 };
    const target = deriveTargetAmount({
      ...base,
      amount: 100_000,
      fees: feesOnlyProto,
    });
    // effective = 100_000 * 0.9975 = 99_750
    // 99_750 * 70000 * 1e6 / 1e8 = 69_825_000
    expect(target).toBe(69_825_000);
  });

  it("deducts both fixed and protocol fees", () => {
    const target = deriveTargetAmount({
      ...base,
      amount: 100_000,
      fees: REAL_FEES,
    });
    // effective = 100_000 * 0.9975 - 500 = 99_750 - 500 = 99_250
    // 99_250 * 70000 * 1e6 / 1e8 = 69_475_000
    expect(target).toBe(69_475_000);
  });

  it("returns 0 when fees exceed amount", () => {
    const bigFees: QuoteFees = { fixedFees: 200_000, protocolFeeRate: 0.0025 };
    const target = deriveTargetAmount({
      ...base,
      amount: 100_000,
      fees: bigFees,
    });
    expect(target).toBe(0);
  });
});

describe("deriveTargetAmount - EVM→BTC", () => {
  const base = {
    exchangeRate: USDC_RATE,
    evmDecimals: USDC_DECIMALS,
    isSourceBtc: false,
  };

  it("with zero fees, target = source converted to sats", () => {
    const target = deriveTargetAmount({
      ...base,
      amount: 70_000_000,
      fees: ZERO_FEES,
    });
    // 70_000_000 * 1e8 / (70000 * 1e6) = 100_000 sats
    expect(target).toBe(100_000);
  });

  it("deducts fees from BTC output", () => {
    const target = deriveTargetAmount({
      ...base,
      amount: 70_000_000,
      fees: REAL_FEES,
    });
    // rawBtc = 100_000
    // netBtc = 100_000 * 0.9975 - 500 = 99_750 - 500 = 99_250
    expect(target).toBe(99_250);
  });
});

describe("deriveSourceAmount - BTC→EVM (reverse)", () => {
  const base = {
    exchangeRate: USDC_RATE,
    evmDecimals: USDC_DECIMALS,
    isSourceBtc: true,
  };

  it("with zero fees, source = target converted back", () => {
    const source = deriveSourceAmount({
      ...base,
      amount: 70_000_000,
      fees: ZERO_FEES,
    });
    expect(source).toBe(100_000);
  });

  it("adds fees to BTC source", () => {
    const source = deriveSourceAmount({
      ...base,
      amount: 70_000_000,
      fees: REAL_FEES,
    });
    // btcForExchange = 100_000
    // source = (100_000 + 500) / 0.9975 = 100_500 / 0.9975 ≈ 100_752
    expect(source).toBe(100_752);
  });

  it("is inverse of deriveTargetAmount", () => {
    const sats = 100_000;
    const target = deriveTargetAmount({
      ...base,
      amount: sats,
      fees: REAL_FEES,
    });
    const backToSource = deriveSourceAmount({
      ...base,
      amount: target,
      fees: REAL_FEES,
    });
    // Should round-trip within 1 sat (rounding)
    expect(Math.abs(backToSource - sats)).toBeLessThanOrEqual(1);
  });
});

describe("deriveSourceAmount - EVM→BTC (reverse)", () => {
  const base = {
    exchangeRate: USDC_RATE,
    evmDecimals: USDC_DECIMALS,
    isSourceBtc: false,
  };

  it("with zero fees, source = target converted back", () => {
    const source = deriveSourceAmount({
      ...base,
      amount: 100_000,
      fees: ZERO_FEES,
    });
    // 100_000 sats → 70_000_000 evm smallest
    expect(source).toBe(70_000_000);
  });

  it("adds fees to EVM source", () => {
    const source = deriveSourceAmount({
      ...base,
      amount: 100_000,
      fees: REAL_FEES,
    });
    // grossBtc = (100_000 + 500) / 0.9975 = 100751.879...
    // evm = 100751.879 * 70000 * 1e6 / 1e8 = 70526315.8...  → rounds to 70_526_316
    expect(source).toBe(70_526_316);
  });

  it("is inverse of deriveTargetAmount", () => {
    const evmAmount = 70_000_000;
    const target = deriveTargetAmount({
      ...base,
      amount: evmAmount,
      fees: REAL_FEES,
    });
    const backToSource = deriveSourceAmount({
      ...base,
      amount: target,
      fees: REAL_FEES,
    });
    expect(Math.abs(backToSource - evmAmount)).toBeLessThanOrEqual(1);
  });
});
