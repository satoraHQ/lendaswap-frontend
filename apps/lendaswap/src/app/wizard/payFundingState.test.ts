import { describe, expect, it } from "vitest";
import {
  payFundingExpired,
  payProgress,
  showReportedFunding,
} from "./payFundingState";

describe("pay funding state", () => {
  it("expires the deposit screen at its deadline even if server status is stale", () => {
    expect(payFundingExpired("user-deposit", 100, 99)).toBe(false);
    expect(payFundingExpired("user-deposit", 100, 100)).toBe(true);
    expect(payFundingExpired("user-deposit", 0, 100)).toBe(false);
  });
  it("does not override a funded payment's claim/refund or completion action", () => {
    for (const step of [
      "server-depositing",
      "user-deposit-seen",
      "refundable",
      "success",
      "refunded",
    ]) {
      expect(payFundingExpired(step, 100, 200)).toBe(false);
    }
  });
  it("keeps the progress list consistent with the effective screen despite contradictory DB status", () => {
    expect(payProgress("user-deposit", "clientfundingseen")).toBe(0);
    expect(payProgress("user-deposit-seen", "pending")).toBe(1);
    expect(payProgress("server-depositing", "serverfunded")).toBe(3);
    expect(payProgress("success", "clientredeemed")).toBe(4);
  });
});

it("shows server-observed funding without overriding verified claim or refund actions", () => {
  expect(showReportedFunding("clientfundingseen", "user-deposit")).toBe(true);
  expect(showReportedFunding("clientfundingseen", "expired")).toBe(true);
  expect(showReportedFunding("pending", "user-deposit")).toBe(false);
  for (const step of [
    "server-depositing",
    "refundable",
    "success",
    "refunded",
  ]) {
    expect(showReportedFunding("clientfundingseen", step)).toBe(false);
  }
  expect(payProgress("user-deposit-seen", "clientfundingseen")).toBe(1);
  expect(payFundingExpired("user-deposit-seen", 100, 200)).toBe(false);
});
