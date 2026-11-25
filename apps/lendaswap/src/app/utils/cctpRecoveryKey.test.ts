import { describe, expect, it } from "vitest";
import { cctpRecoveryDestination, findRecoveryKey } from "./cctpRecoveryKey";

const legacy = { address: `0x${"11".repeat(20)}`, privateKey: "legacy" };
const perSwap = { address: `0x${"ab".repeat(20)}`, privateKey: "per-swap" };
describe("CCTP seed-only recovery", () => {
  it("finds a per-swap owner without local swap records", async () => {
    expect(
      await findRecoveryKey(
        perSwap.address.toUpperCase(),
        legacy,
        (i) => (i === 7 ? perSwap : legacy),
        10,
      ),
    ).toEqual(perSwap);
  });
  it("retains legacy recovery", async () => {
    expect(
      await findRecoveryKey(legacy.address, legacy, () => {
        throw new Error("unneeded");
      }),
    ).toEqual(legacy);
  });
  it("rejects an unrelated seed", async () => {
    await expect(
      findRecoveryKey(perSwap.address, legacy, () => legacy, 2),
    ).rejects.toThrow("No matching recovery account");
  });
  it("reads the attested Arbitrum destination and rejects other chains", () => {
    const header = `0x000000010000000000000003${"00".repeat(96)}${"00".repeat(12)}${perSwap.address.slice(2)}`;
    expect(cctpRecoveryDestination(header)).toBe(perSwap.address);
    expect(() =>
      cctpRecoveryDestination(header.replace("00000003", "00000006")),
    ).toThrow("Arbitrum");
  });
});
