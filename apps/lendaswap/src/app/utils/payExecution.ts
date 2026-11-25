import type { StoredSwap } from "@satora/swap";

type Payout = NonNullable<StoredSwap["bitcoinPayout"]>;
export interface PaymentTransaction {
  txid: string;
  fee: number;
  vin: {
    txid: string;
    prevout: { value: number; scriptpubkey_address?: string };
  }[];
  vout: { value: number; scriptpubkey_address?: string }[];
  /** Esplora's confirmation status; a mempool spend is not yet final. */
  status?: { confirmed?: boolean };
}

/**
 * Bech32 addresses are case-insensitive (all upper or all lower) and
 * explorers report them lowercase; Base58 addresses are case-sensitive.
 */
export function sameBitcoinAddress(a: string, b: string | undefined): boolean {
  if (b === undefined) return false;
  const bech32 = /^(bc|tb|bcrt)1/i;
  return bech32.test(a) && bech32.test(b)
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

/** Verify the spending transaction, preserving separate outputs to the same address. */
export function executedPayment(
  payout: Payout,
  tx: PaymentTransaction,
  txid: string,
  htlcAddress: string,
): Payout {
  if (
    tx.txid !== txid ||
    tx.vin.length !== 1 ||
    tx.vin[0].prevout.scriptpubkey_address !== htlcAddress ||
    tx.vout.length !== payout.recipients.length
  )
    throw new Error("Bitcoin transaction does not match this payment.");
  if (
    !Number.isSafeInteger(tx.fee) ||
    tx.fee < 0 ||
    tx.vout.some((o) => !Number.isSafeInteger(o.value) || o.value < 0) ||
    tx.vin[0].prevout.value !==
      tx.vout.reduce((s, o) => s + o.value, 0) + tx.fee
  )
    throw new Error("Bitcoin transaction amounts could not be verified.");
  const outputs = [...tx.vout];
  const recipients = payout.recipients.map((r) => {
    const index = outputs.findIndex((o) =>
      sameBitcoinAddress(r.address, o.scriptpubkey_address),
    );
    if (index < 0)
      throw new Error("Bitcoin transaction recipients do not match.");
    const [output] = outputs.splice(index, 1);
    // The claim never pays a recipient less than their committed floor.
    if (BigInt(output.value) < BigInt(r.amountSats))
      throw new Error("Bitcoin transaction recipients do not match.");
    return { ...r, amountSats: String(output.value) };
  });
  return { recipients, feeSats: String(tx.fee) };
}

export function paymentExplorer(network: string): string {
  const configured = import.meta.env.VITE_ESPLORA_URL as string | undefined;
  if (configured) return configured.replace(/\/api\/?$/, "").replace(/\/$/, "");
  return network === "signet"
    ? "https://mempool.space/signet"
    : network === "testnet"
      ? "https://mempool.space/testnet"
      : "https://mempool.space";
}
