/**
 * Solana-specific helpers for the CCTP outbound flow.
 *
 * Two pieces of work the frontend has to do before calling `claim()` for a
 * Solana destination:
 *   1. Derive the recipient's USDC associated token account (ATA) from
 *      their wallet pubkey + USDC mint. CCTP's `mintRecipient` field
 *      addresses the ATA, not the wallet.
 *   2. Probe Solana RPC to see if the ATA already exists. If not, the
 *      CCTP burn must include the extended forwarding hookData so Circle
 *      creates the ATA at mint time. We surface that through the
 *      `bridgeRecipientWallet` claim option.
 *
 * Heavy `@solana/web3.js` import is dynamic so it doesn't bloat the main
 * bundle for the EVM-only path.
 */

import {
  isValidSolanaAddress,
  USDC_ADDRESSES,
} from "@satora/swap";

/** SPL Token Program ID (canonical mainnet/devnet constant). */
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** SPL Associated Token Program ID. */
const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/**
 * Ordered list of Solana RPC endpoints to try for the ATA probe. The
 * canonical `api.mainnet-beta.solana.com` blocks browser CORS / returns
 * 403 under any real volume, so we keep a couple of CORS-friendly public
 * fallbacks.
 */
function getSolanaRpcUrls(): string[] {
  return [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
  ];
}

/**
 * Derive the recipient's USDC associated token account from their
 * wallet pubkey. Pure PDA derivation — no RPC call.
 */
export async function deriveSolanaUsdcAta(
  walletBase58: string,
): Promise<string> {
  const { PublicKey } = await import("@solana/web3.js");
  const wallet = new PublicKey(walletBase58);
  const usdcMint = new PublicKey(USDC_ADDRESSES.Solana);
  const tokenProgram = new PublicKey(TOKEN_PROGRAM_ID);
  const ataProgram = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
  // `true` allows off-curve owners (e.g. PDAs as wallets) — matches
  // Boltz's flag and the SPL token library's default for safety.
  const [ata] = PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), tokenProgram.toBuffer(), usdcMint.toBuffer()],
    ataProgram,
  );
  return ata.toBase58();
}

/**
 * Probe Solana RPC for an account at `ata`. Returns true when the
 * account already exists (any owner, any size). A `null` response from
 * `getAccountInfo` means the account hasn't been created yet, in which
 * case the CCTP burn must opt into Circle's ATA-creation flag.
 *
 * Tries each configured RPC in order — public Solana endpoints
 * routinely 403/rate-limit browser traffic, so we fall through to the
 * next one before giving up. Throws only when every endpoint failed,
 * letting callers fall back to the pessimistic "create ATA" path.
 */
export async function solanaAtaExists(ata: string): Promise<boolean> {
  const urls = getSolanaRpcUrls();
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [ata, { encoding: "base64", commitment: "confirmed" }],
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Solana RPC ${response.status}: ${await response.text()}`,
        );
      }
      const json = (await response.json()) as {
        result?: { value: unknown };
        error?: { message: string };
      };
      if (json.error) {
        throw new Error(`Solana RPC error: ${json.error.message}`);
      }
      return json.result?.value !== null;
    } catch (err) {
      lastError = err;
      // Try the next RPC in the list.
    }
  }
  throw new Error(
    `All Solana RPCs failed for getAccountInfo: ${String(lastError)}`,
  );
}

/**
 * Returns true when the given address is a valid Solana pubkey AND lies
 * on the Ed25519 curve — i.e. could be the public half of a normal
 * keypair. PDAs (including SPL associated token accounts) are deliberately
 * off-curve, so a `false` here is the structural signal that the user has
 * pasted a token account, a program account, or a smart-wallet PDA
 * instead of a regular wallet pubkey.
 *
 * Smart-wallet edge case: Squads / Token-2022 owner PDAs are also
 * off-curve. They're rare on the manual-paste path (such users typically
 * connect via the wallet adapter and the auto-fill bypasses this check),
 * so a soft warning is the right UX rather than a hard reject.
 */
export async function isSolanaWalletPubkey(address: string): Promise<boolean> {
  if (!isValidSolanaAddress(address)) return false;
  const { PublicKey } = await import("@solana/web3.js");
  return PublicKey.isOnCurve(new PublicKey(address).toBuffer());
}

/**
 * Authoritative on-chain check: returns true iff the account at
 * `address` exists AND is owned by the SPL Token Program — i.e. it's a
 * token account, not a wallet. Used as a last-line-of-defense tripwire
 * at claim time so funds can't be CCTP'd to an ATA-of-token-account.
 *
 * `false` either means the address isn't a token account or the
 * account doesn't exist at all (which is fine — fresh wallets are the
 * common case for first-time recipients).
 *
 * Throws when every configured RPC fails so callers can decide
 * whether to fail-closed or fall through. Tries the same RPC fallback
 * chain as `solanaAtaExists`.
 */
export async function isSolanaTokenAccount(address: string): Promise<boolean> {
  const urls = getSolanaRpcUrls();
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [address, { encoding: "base64", commitment: "confirmed" }],
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Solana RPC ${response.status}: ${await response.text()}`,
        );
      }
      const json = (await response.json()) as {
        result?: { value: { owner: string } | null };
        error?: { message: string };
      };
      if (json.error) {
        throw new Error(`Solana RPC error: ${json.error.message}`);
      }
      // No account → not a token account (might be an unfunded wallet).
      if (!json.result?.value) return false;
      return json.result.value.owner === TOKEN_PROGRAM_ID;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `All Solana RPCs failed for getAccountInfo(owner check): ${String(lastError)}`,
  );
}

/**
 * Convenience: derive the ATA and probe the RPC in one call. Returns
 * the values needed to call `client.claim({ bridgeRecipient,
 * bridgeRecipientWallet })`. When `walletExists` is `false`, the
 * caller should pass `bridgeRecipientWallet` to trigger the extended
 * hookData; when `true`, omit it.
 *
 * Defaults to the pessimistic path on RPC failure: returns `wallet`
 * for `bridgeRecipientWallet` so the burn assumes the ATA needs
 * creating. Better to pay the extra ~$0.05 setup fee than to lose the
 * funds to a missing account.
 */
export async function resolveSolanaBridgeRecipient(
  walletBase58: string,
): Promise<{
  ata: string;
  bridgeRecipientWallet: string | undefined;
}> {
  const ata = await deriveSolanaUsdcAta(walletBase58);
  let exists = false;
  try {
    exists = await solanaAtaExists(ata);
  } catch (err) {
    console.warn(
      "Solana ATA existence check failed — assuming creation required",
      err,
    );
    exists = false;
  }
  return {
    ata,
    bridgeRecipientWallet: exists ? undefined : walletBase58,
  };
}
