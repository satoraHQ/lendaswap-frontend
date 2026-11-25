type RecoveryKey = { privateKey: string; address: string };

export function cctpRecoveryDestination(message: string): string {
  if (
    !/^0x[0-9a-fA-F]+$/.test(message) ||
    message.length < 282 ||
    message.slice(2, 10) !== "00000001" ||
    message.slice(18, 26) !== "00000003" ||
    !/^0{24}$/.test(message.slice(218, 242))
  ) {
    throw new Error("Expected a CCTP V2 message settling on Arbitrum.");
  }
  const address = `0x${message.slice(242, 282)}`;
  if (/^0x0{40}$/.test(address))
    throw new Error("The burn does not identify a recovery account.");
  return address;
}

export async function findRecoveryKey(
  destination: string,
  legacy: RecoveryKey,
  derive: (index: number) => RecoveryKey,
  limit = 10_000,
): Promise<RecoveryKey> {
  const matches = (key: RecoveryKey) =>
    key.address.toLowerCase() === destination.toLowerCase();
  if (matches(legacy)) return legacy;
  for (let index = 0; index < limit; index++) {
    const key = derive(index);
    if (matches(key)) return key;
    // Keep the recovery page responsive during seed-only discovery.
    if (index % 50 === 49)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(
    `No matching recovery account found in the first ${limit} swap keys. Check that you restored the original wallet seed. If this wallet has more swaps, contact support; no transaction was submitted.`,
  );
}
