import { Network } from "bitcoin-address-validation";
import { describe, expect, it } from "vitest";
import { parseBitcoinNetwork, validBitcoinAddress } from "./bitcoinNetwork";

const testAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const mainAddress = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
describe("backend Bitcoin network", () => {
  it("accepts Mutinynet addresses as signet", () => {
    expect(validBitcoinAddress(testAddress, Network.signet)).toBe(true);
    expect(validBitcoinAddress(mainAddress, Network.signet)).toBe(false);
  });
  it("rejects test addresses on mainnet and invalid checksums", () => {
    expect(validBitcoinAddress(testAddress, Network.mainnet)).toBe(false);
    expect(validBitcoinAddress(mainAddress, Network.mainnet)).toBe(true);
    expect(
      validBitcoinAddress(testAddress.slice(0, -1) + "a", Network.signet),
    ).toBe(false);
  });
  it("normalizes backend mainnet naming and fails closed on unknown networks", () => {
    expect(parseBitcoinNetwork("bitcoin")).toBe(Network.mainnet);
    expect(parseBitcoinNetwork("signet")).toBe(Network.signet);
    expect(() => parseBitcoinNetwork("unknown")).toThrow();
  });
});
