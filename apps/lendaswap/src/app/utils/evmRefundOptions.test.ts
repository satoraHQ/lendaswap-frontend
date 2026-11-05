import type { SwapStatus } from "@satora/swap";
import { describe, expect, it } from "vitest";
import {
  COLLAB_REFUND_STATUSES,
  collabRefundPath,
  type EvmRefundInput,
  evmRefundOptions,
  isContractWallet,
} from "./evmRefundOptions";

const base: EvmRefundInput = {
  status: "serverwontfund",
  htlcKind: "erc20",
  htlcVersion: 7,
  chainId: 42161,
  gasless: false,
  isLightning: true,
  locktimePassed: false,
  walletIsContract: false,
  sponsoredFailed: false,
};

describe("collabRefundPath", () => {
  it("matches the server per deployment", () => {
    expect(collabRefundPath("erc20", 7)).toBe("direct");
    expect(collabRefundPath("erc20", 6)).toBe("unavailable");
    expect(collabRefundPath("erc20", 5)).toBe("coordinator");
    expect(collabRefundPath("native", 2)).toBe("direct");
    expect(collabRefundPath("native", 1)).toBe("unavailable");
    expect(collabRefundPath(undefined, undefined)).toBe("unavailable");
  });
});

describe("isContractWallet", () => {
  it("treats EOAs and EIP-7702 delegations as signers", () => {
    expect(isContractWallet(undefined)).toBe(false);
    expect(isContractWallet("0x")).toBe(false);
    expect(isContractWallet(`0xef0100${"ab".repeat(20)}`)).toBe(false);
    expect(isContractWallet("0x6080604052")).toBe(true);
  });
});

describe("collab refund statuses", () => {
  // `SwapStatus::can_sign_client_collab_refund` in store/src/model.rs.
  const server: SwapStatus[] = [
    "clientfundedserverrefunded",
    "expired",
    "clientinvalidfunded",
    "clientfundedtoolate",
    "serverwontfund",
  ];

  it("is exactly the server's set", () => {
    expect([...COLLAB_REFUND_STATUSES].sort()).toEqual([...server].sort());
  });

  it.each(server)("%s offers the collab refund", (status) => {
    expect(evmRefundOptions({ ...base, status })).toMatchObject({
      collab: true,
      primary: "collab",
    });
  });

  it.each([
    "pending",
    "clientfundingseen",
    "clientfunded",
  ] as SwapStatus[])("%s offers nothing before the timelock", (status) => {
    expect(evmRefundOptions({ ...base, status })).toMatchObject({
      collab: false,
      primary: "none",
    });
  });
});

describe("evmRefundOptions", () => {
  it("offers collab refund and retry on v7", () => {
    expect(evmRefundOptions(base)).toMatchObject({
      collab: true,
      retry: true,
      primary: "collab",
    });
  });

  it("offers neither on HTLCErc20 v6 or HTLCNative v1", () => {
    for (const [htlcKind, htlcVersion] of [
      ["erc20", 6],
      ["native", 1],
    ] as const) {
      expect(
        evmRefundOptions({ ...base, htlcKind, htlcVersion }),
      ).toMatchObject({ collab: false, retry: false, primary: "none" });
    }
  });

  it("makes the wallet timelock refund primary once it unlocks", () => {
    for (const htlcVersion of [7, 6]) {
      expect(
        evmRefundOptions({ ...base, htlcVersion, locktimePassed: true }),
      ).toMatchObject({ primary: "timelock", primaryNeedsWallet: true });
    }
  });

  it("only retries a stuck Lightning swap", () => {
    expect(evmRefundOptions({ ...base, isLightning: false }).retry).toBe(false);
    expect(evmRefundOptions({ ...base, status: "expired" }).retry).toBe(false);
  });

  it("keeps contract wallets off ECDSA-authorized paths", () => {
    const contract = { ...base, walletIsContract: true };
    expect(evmRefundOptions(contract)).toMatchObject({
      collab: true,
      retry: false,
    });
    expect(evmRefundOptions({ ...contract, htlcVersion: 5 }).collab).toBe(
      false,
    );
  });

  it("only sends a gasless direct refund or retry where it is sponsored", () => {
    const gasless = { ...base, gasless: true, walletIsContract: true };
    expect(evmRefundOptions(gasless)).toMatchObject({
      collab: true,
      retry: true,
      primaryNeedsWallet: false,
    });
    expect(evmRefundOptions({ ...gasless, chainId: 137 })).toMatchObject({
      collab: false,
      retry: false,
    });
    expect(
      evmRefundOptions({ ...gasless, chainId: 137, htlcVersion: 5 }).collab,
    ).toBe(true);
  });
});

describe("gasless swaps after the timelock", () => {
  const expired: EvmRefundInput = {
    ...base,
    status: "expired",
    gasless: true,
    locktimePassed: true,
  };

  it("refund sponsored on Arbitrum with no wallet", () => {
    expect(evmRefundOptions(expired)).toMatchObject({
      primary: "sponsored",
      primaryNeedsWallet: false,
      walletFallback: false,
      secondaryCollab: false,
    });
  });

  it("offer the wallet and gasless collab refunds once the sponsored one failed", () => {
    // v7: the collab refund is a sponsored `refundBySig`, still gasless.
    expect(
      evmRefundOptions({ ...expired, sponsoredFailed: true }),
    ).toMatchObject({
      primary: "sponsored",
      walletFallback: true,
      collabGasless: true,
      secondaryCollab: true,
    });
  });

  it("offer the server-submitted coordinator refund once the sponsored one failed", () => {
    expect(
      evmRefundOptions({ ...expired, htlcVersion: 5, sponsoredFailed: true }),
    ).toMatchObject({
      primary: "sponsored",
      walletFallback: true,
      collab: true,
      collabGasless: true,
      collabNeedsSignature: false,
      secondaryCollab: true,
    });
  });

  it("offer no collab refund after a failed sponsored one where none exists", () => {
    expect(
      evmRefundOptions({ ...expired, htlcVersion: 6, sponsoredFailed: true }),
    ).toMatchObject({ walletFallback: true, secondaryCollab: false });
    expect(
      evmRefundOptions({
        ...expired,
        status: "clientfunded",
        sponsoredFailed: true,
      }),
    ).toMatchObject({ walletFallback: true, secondaryCollab: false });
  });

  it("fall back to the wallet refund off Arbitrum", () => {
    expect(
      evmRefundOptions({ ...expired, chainId: 137, htlcVersion: 5 }),
    ).toMatchObject({
      primary: "timelock",
      primaryNeedsWallet: true,
      secondaryCollab: true,
    });
  });
});

describe("collab refund cost per path", () => {
  it("direct-path wallet swaps pay gas and sign nothing", () => {
    expect(evmRefundOptions(base)).toMatchObject({
      collabGasless: false,
      collabNeedsSignature: false,
      primaryNeedsWallet: true,
    });
  });

  it("hide the collab refund after the timelock on the direct wallet path", () => {
    expect(
      evmRefundOptions({ ...base, locktimePassed: true }).secondaryCollab,
    ).toBe(false);
  });

  it("coordinator-path wallet swaps are gasless but need a signature", () => {
    const coordinator = { ...base, htlcVersion: 5 };
    expect(evmRefundOptions(coordinator)).toMatchObject({
      collabGasless: true,
      collabNeedsSignature: true,
    });
    expect(
      evmRefundOptions({ ...coordinator, locktimePassed: true }),
    ).toMatchObject({ primary: "timelock", secondaryCollab: true });
  });

  it("gasless swaps need no wallet signature", () => {
    expect(evmRefundOptions({ ...base, gasless: true })).toMatchObject({
      collabGasless: true,
      collabNeedsSignature: false,
    });
  });
});
