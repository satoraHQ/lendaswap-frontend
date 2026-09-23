import { rootstock } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

// `buildEvmSigner` builds its own public client for reads; stub it so the
// test never opens a transport.
const publicClient = {
  call: vi.fn(async () => ({ data: "0x01" })),
  getBalance: vi.fn(async () => 7n),
};
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return { ...actual, createPublicClient: () => publicClient };
});
vi.mock("./evmTransport", () => ({ buildTransport: () => undefined }));

const { buildEvmSigner } = await import("./evmSigner");

const walletClient = {
  account: { address: "0x1111111111111111111111111111111111111111" },
  sendTransaction: vi.fn(async () => "0xhash"),
};

describe("buildEvmSigner", () => {
  const signer = buildEvmSigner(
    // biome-ignore lint/suspicious/noExplicitAny: partial wallet client
    walletClient as any,
    rootstock,
  );

  it("forwards the native value and legacy type of a Rootstock lock", async () => {
    await signer.sendTransaction({
      to: "0x2222222222222222222222222222222222222222",
      data: "0xabcd",
      value: 5n,
      type: "legacy",
      gas: 250_000n,
    });
    expect(walletClient.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ value: 5n, type: "legacy", gas: 250_000n }),
    );
  });

  it("simulates with the value the lock will carry", async () => {
    await signer.call({
      to: "0x2222222222222222222222222222222222222222",
      data: "0xabcd",
      value: 5n,
      from: "0x1111111111111111111111111111111111111111",
    });
    expect(publicClient.call).toHaveBeenCalledWith(
      expect.objectContaining({ value: 5n }),
    );
  });

  it("reads the native balance so the SDK can refuse an underfunded lock", async () => {
    expect(
      await signer.getBalance?.("0x1111111111111111111111111111111111111111"),
    ).toBe(7n);
  });
});
