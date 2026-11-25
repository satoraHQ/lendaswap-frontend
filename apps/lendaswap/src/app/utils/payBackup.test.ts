import { bytesToHex, Signer, type StoredSwap } from "@satora/swap";
import { describe, expect, it } from "vitest";
import {
  mergePayBackup,
  type PayBackup,
  validatePayBackup,
  verifyBackupSwap,
  withPayRecoveryAddress,
} from "./payBackup";

// Public BIP39 test vector, never used for real funds.
const mnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
function fixture(): PayBackup {
  const p = Signer.fromMnemonic(mnemonic).deriveSwapParams(3);
  const address = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
  const response = {
    id: "00000000-0000-4000-8000-000000000001",
    direction: "evm_to_bitcoin",
    status: "pending",
    evm_hash_lock: bytesToHex(p.preimageHash),
    btc_user_claim_pk: bytesToHex(p.publicKey).slice(2),
    target_btc_address: address,
    target_amount: "1600",
    network: "signet",
    evm_chain_id: 1,
    evm_refund_locktime: 2000000000,
    evm_htlc_address: "0x1234",
    evm_coordinator_address: "0x5678",
    server_evm_address: "0x9012",
  } as StoredSwap["response"];
  return {
    format: "satora-pay-recovery",
    version: 1,
    exportedAt: new Date().toISOString(),
    network: "signet",
    apiUrl: "http://localhost:3333",
    wallet: { mnemonic, keyIndex: 4 },
    recipientNames: ["Alice", "Bob"],
    swap: {
      version: 2,
      swapId: response.id,
      keyIndex: 3,
      response,
      publicKey: bytesToHex(p.publicKey),
      secretKey: bytesToHex(p.secretKey),
      preimage: bytesToHex(p.preimage),
      preimageHash: bytesToHex(p.preimageHash),
      storedAt: 0,
      updatedAt: 0,
      targetAddress: address,
      bitcoinPayout: {
        feeSats: "100",
        recipients: [
          { address, amountSats: "700" },
          { address, amountSats: "800" },
        ],
      },
      evmFundingTerms: {
        chainId: 1,
        timelock: 2000000000,
        htlcAddress: "0x1234",
        coordinator: "0x5678",
        claimAddress: "0x9012",
        sourceToken: "0xaaaa",
        sourceAmount: "20",
      },
    },
  };
}
describe("payment recovery backups", () => {
  it("exports older EVM records with the recovery address stored only in their response", () => {
    const b = fixture();
    delete b.swap.targetAddress;
    b.swap = withPayRecoveryAddress(b.swap);
    expect(() =>
      validatePayBackup(JSON.parse(JSON.stringify(b))),
    ).not.toThrow();
    expect(b.swap.targetAddress).toBe(
      b.swap.response.direction === "evm_to_bitcoin" &&
        b.swap.response.target_btc_address,
    );
  });
  it("preserves names and USD rate through backup serialization", () => {
    const b = fixture();
    b.swap.payRecipientNames = b.recipientNames;
    b.swap.payUsdRate = 75000;
    expect(
      validatePayBackup(JSON.parse(JSON.stringify(b))).swap.payUsdRate,
    ).toBe(75000);
  });
  it("round-trips keys, funding commitments and exact payout outputs", () => {
    const b = fixture();
    expect(validatePayBackup(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(() =>
      verifyBackupSwap(b, { ...b.swap.response, status: "clientfunded" }),
    ).not.toThrow();
  });
  it("permits recovery however the swap was funded", () => {
    for (const target_amount of ["100", "999999"]) {
      const b = fixture();
      b.swap.response.target_amount = target_amount;
      const restored = validatePayBackup(JSON.parse(JSON.stringify(b)));
      expect(() =>
        verifyBackupSwap(restored, { ...b.swap.response, target_amount }),
      ).not.toThrow();
    }
  });
  it("keeps requested amounts only when each covers its recipient's floor", () => {
    const b = fixture();
    const floors = b.swap.bitcoinPayout!.recipients.map((r) => r.amountSats);
    b.swap.payRequestedAmounts = floors.map((a) => String(BigInt(a) + 10n));
    expect(
      validatePayBackup(JSON.parse(JSON.stringify(b))).swap.payRequestedAmounts,
    ).toEqual(b.swap.payRequestedAmounts);
    const below = fixture();
    below.swap.payRequestedAmounts = floors.map((a) => String(BigInt(a) - 1n));
    expect(() => validatePayBackup(below)).toThrow();
    const short = fixture();
    short.swap.payRequestedAmounts = floors.slice(1);
    expect(() => validatePayBackup(short)).toThrow();
  });
  it("rejects recipient-only files", () => {
    expect(() =>
      validatePayBackup({ swapId: "old", bitcoinPayout: {} }),
    ).toThrow("Older recipient-only");
  });
  it("rejects mismatched seed, private key or claim hash", () => {
    const b = fixture();
    b.swap.secretKey = "00".repeat(32);
    expect(() => validatePayBackup(b)).toThrow();
    const c = fixture();
    c.wallet.mnemonic = "invalid";
    expect(() => validatePayBackup(c)).toThrow();
  });
  it("rejects dust payouts, addresses and networks that do not match", () => {
    const b = fixture();
    b.swap.bitcoinPayout!.recipients[0].amountSats = "545";
    expect(() => validatePayBackup(b)).toThrow();
    const c = fixture();
    c.network = "bitcoin";
    expect(() => validatePayBackup(c)).toThrow();
    const d = fixture();
    d.swap.bitcoinPayout!.recipients[0].address = "bad";
    expect(() => validatePayBackup(d)).toThrow();
  });
  it("rejects changed server contracts before import", () => {
    const b = fixture();
    expect(() =>
      verifyBackupSwap(b, {
        ...b.swap.response,
        evm_htlc_address: "0xffff",
      } as StoredSwap["response"]),
    ).toThrow("does not match");
  });
  it("rejects key counter rollback and altered funding commitments", () => {
    const b = fixture();
    b.wallet.keyIndex = 1;
    expect(() => validatePayBackup(b)).toThrow();
    const c = fixture();
    c.swap.evmFundingTerms!.coordinator = "0xffff";
    expect(() => validatePayBackup(c)).toThrow();
  });
});

it("enriches seed recovery and refuses a different payout", () => {
  const backup = fixture();
  const seeded = {
    ...backup.swap,
    bitcoinPayout: undefined,
    evmFundingTerms: undefined,
    payRecipientNames: undefined,
  };
  const merged = mergePayBackup(seeded, backup);
  expect(merged.bitcoinPayout).toEqual(backup.swap.bitcoinPayout);
  expect(merged.evmFundingTerms).toEqual(backup.swap.evmFundingTerms);
  expect(mergePayBackup(merged, backup).bitcoinPayout).toEqual(
    backup.swap.bitcoinPayout,
  );
  const altered = {
    ...merged,
    bitcoinPayout: { ...merged.bitcoinPayout!, feeSats: "150" },
  };
  expect(() => mergePayBackup(altered, backup)).toThrow(
    "different recovery data",
  );
  expect(() =>
    mergePayBackup({ ...merged, targetAddress: "other" }, backup),
  ).toThrow("different recovery data");
});

it("rejects names incompatible with the backup before export", () => {
  const backup = fixture();
  backup.recipientNames[0] = "a".repeat(201);
  expect(() => validatePayBackup(backup)).toThrow();
});
