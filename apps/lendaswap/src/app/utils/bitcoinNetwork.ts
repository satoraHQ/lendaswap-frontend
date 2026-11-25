import { Network, validate } from "bitcoin-address-validation";

export function parseBitcoinNetwork(value: string): Network {
  if (value === "bitcoin") return Network.mainnet;
  if (Object.values(Network).includes(value as Network))
    return value as Network;
  throw new Error(`Unsupported Bitcoin network: ${value}`);
}
export function validBitcoinAddress(
  address: string,
  network: Network,
): boolean {
  // Signet and testnet share addresses. The validator labels tb1/legacy
  // test addresses as testnet unless explicitly cast to signet.
  return validate(
    address,
    network,
    network === Network.signet ? { castTestnetTo: Network.signet } : undefined,
  );
}
