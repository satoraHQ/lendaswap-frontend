import {
  bitcoinNetworkOf,
  bytesToHex,
  type GetSwapResponse,
  Signer,
  type StoredSwap,
  validateBitcoinPayout,
} from "@satora/swap";
import { parseBitcoinNetwork, validBitcoinAddress } from "./bitcoinNetwork";

export interface PayBackup {
  format: "satora-pay-recovery";
  version: 1;
  exportedAt: string;
  network: string;
  apiUrl: string;
  wallet: { mnemonic: string; keyIndex: number };
  swap: StoredSwap;
  recipientNames: string[];
}
const hex = (s: string) => s.replace(/^0x/, "").toLowerCase();
function fail(): never {
  throw new Error("Invalid or inconsistent payment recovery backup.");
}

/** Older EVM-to-Bitcoin records kept the recovery address only in the response. */
export function withPayRecoveryAddress(swap: StoredSwap): StoredSwap {
  return {
    ...swap,
    targetAddress:
      swap.targetAddress ||
      (swap.response.direction === "evm_to_bitcoin"
        ? (swap.response.target_btc_address ?? undefined)
        : undefined),
  };
}

export function validatePayBackup(input: unknown): PayBackup {
  const b = input as PayBackup;
  if (!b || b.format !== "satora-pay-recovery" || b.version !== 1)
    throw new Error(
      "This is not a full recovery backup. Older recipient-only files need the original wallet seed and cannot restore a swap on their own.",
    );
  if (!b.wallet || !b.swap || !Array.isArray(b.recipientNames)) fail();
  const s = b.swap;
  const r = s.response;
  if (
    !r ||
    r.direction !== "evm_to_bitcoin" ||
    s.version !== 2 ||
    s.swapId !== r.id ||
    !/^[0-9a-f-]{36}$/i.test(s.swapId)
  )
    fail();
  if (
    !Number.isInteger(s.keyIndex) ||
    s.keyIndex < 0 ||
    s.keyIndex >= 0x80000000 ||
    !Number.isInteger(b.wallet.keyIndex) ||
    b.wallet.keyIndex < s.keyIndex ||
    b.wallet.keyIndex >= 0x80000000
  )
    fail();
  let signer: Signer;
  try {
    signer = Signer.fromMnemonic(b.wallet.mnemonic);
  } catch {
    return fail();
  }
  const params = signer.deriveSwapParams(s.keyIndex);
  for (const k of [
    "secretKey",
    "publicKey",
    "preimage",
    "preimageHash",
  ] as const)
    if (typeof s[k] !== "string" || hex(s[k]) !== bytesToHex(params[k])) fail();
  if (hex(r.evm_hash_lock) !== hex(s.preimageHash)) fail();
  if (hex(r.btc_user_claim_pk) !== hex(s.publicKey).slice(2)) fail();
  const network = parseBitcoinNetwork(b.network);
  if (parseBitcoinNetwork(r.network) !== network) fail();
  if (
    !s.targetAddress ||
    s.targetAddress !== r.target_btc_address ||
    !validBitcoinAddress(s.targetAddress, network)
  )
    fail();
  const p = s.bitcoinPayout;
  if (
    !p ||
    !Array.isArray(p.recipients) ||
    !p.recipients.length ||
    p.recipients.length > 100 ||
    !/^\d+$/.test(p.feeSats)
  )
    fail();
  const fee = BigInt(p.feeSats);
  if (fee < 1n || fee > 100000n) fail();
  for (const recipient of p.recipients) {
    if (
      !recipient ||
      !validBitcoinAddress(recipient.address, network) ||
      !/^\d+$/.test(recipient.amountSats) ||
      BigInt(recipient.amountSats) < 546n
    )
      fail();
  }
  // The same rules the claim applies (integer satoshi strings, supply and
  // dust bounds, the claim's network), so an import never stores a payout
  // the claim would then refuse. Recovery must remain possible however the
  // swap was funded: the claim itself refuses funding below floors plus fee.
  try {
    validateBitcoinPayout(p, bitcoinNetworkOf(s.targetAddress));
  } catch {
    fail();
  }
  if (
    b.recipientNames.length !== p.recipients.length ||
    b.recipientNames.some((n) => typeof n !== "string" || n.length > 200)
  )
    fail();
  // Display metadata only, but a retry re-quotes these: never below a floor.
  if (
    s.payRequestedAmounts !== undefined &&
    (!Array.isArray(s.payRequestedAmounts) ||
      s.payRequestedAmounts.length !== p.recipients.length ||
      s.payRequestedAmounts.some(
        (amount, i) =>
          typeof amount !== "string" ||
          !/^\d+$/.test(amount) ||
          BigInt(amount) < BigInt(p.recipients[i].amountSats),
      ))
  )
    fail();
  if (
    s.payUsdRate !== undefined &&
    (typeof s.payUsdRate !== "number" ||
      !Number.isFinite(s.payUsdRate) ||
      s.payUsdRate <= 0)
  )
    fail();
  const terms = s.evmFundingTerms;
  if (
    !terms ||
    terms.chainId !== r.evm_chain_id ||
    terms.timelock !== r.evm_refund_locktime ||
    terms.htlcAddress.toLowerCase() !== r.evm_htlc_address.toLowerCase() ||
    terms.coordinator.toLowerCase() !==
      r.evm_coordinator_address.toLowerCase() ||
    terms.claimAddress.toLowerCase() !== r.server_evm_address.toLowerCase()
  )
    fail();
  return b;
}

/** Never let an imported snapshot replace the server's identity or lock terms. */
export function verifyBackupSwap(
  backup: PayBackup,
  live: GetSwapResponse,
): void {
  const saved = backup.swap.response;
  if (
    live.direction !== "evm_to_bitcoin" ||
    saved.direction !== "evm_to_bitcoin"
  )
    fail();
  for (const key of [
    "id",
    "evm_hash_lock",
    "btc_hash_lock",
    "evm_chain_id",
    "evm_htlc_address",
    "evm_htlc_version",
    "evm_coordinator_address",
    "client_evm_address",
    "server_evm_address",
    "target_btc_address",
    "evm_refund_locktime",
    "btc_refund_locktime",
    "btc_user_claim_pk",
    "btc_server_refund_pk",
    "btc_htlc_address",
    "btc_htlc_script_version",
  ] as const) {
    if (String(saved[key]).toLowerCase() !== String(live[key]).toLowerCase())
      throw new Error(`Backup does not match this server’s swap (${key}).`);
  }
}

export function downloadPayBackup(backup: PayBackup): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `satora-pay-${backup.swap.swapId}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Enrich seed-only recovery without replacing newer local authorizations. */
export function mergePayBackup(
  existing: StoredSwap | undefined,
  backup: PayBackup,
): StoredSwap {
  const restored = backup.swap;
  if (existing) {
    if (
      hex(existing.secretKey) !== hex(restored.secretKey) ||
      (existing.bitcoinPayout &&
        JSON.stringify(existing.bitcoinPayout) !==
          JSON.stringify(restored.bitcoinPayout)) ||
      (existing.targetAddress &&
        existing.targetAddress !== restored.targetAddress) ||
      (existing.evmFundingTerms &&
        JSON.stringify(existing.evmFundingTerms) !==
          JSON.stringify(restored.evmFundingTerms))
    )
      throw new Error(
        "This payment already exists with different recovery data. Nothing was overwritten.",
      );
  }
  // The local record wins only where it actually holds a value: records
  // rebuilt from the seed carry explicit undefined keys, which must not erase
  // the backup's (requested amounts, submitted claim, funding txids, ...).
  const merged: StoredSwap = { ...restored };
  const target = merged as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(existing ?? {}))
    if (value !== undefined) target[key] = value;
  merged.payRecipientNames = backup.recipientNames;
  return merged;
}
