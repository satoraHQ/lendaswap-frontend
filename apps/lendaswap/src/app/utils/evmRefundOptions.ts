import { parseEip7702Delegation, type SwapStatus } from "@satora/swap";

/** How the server can consent to an early refund of a lock. */
export type CollabRefundPath = "direct" | "coordinator" | "unavailable";

/**
 * Mirrors the server's `collab_refund_path` (`swap/src/api/collab_refund_evm.rs`):
 * HTLCErc20 v7+ / HTLCNative v2+ lock under the depositor and support
 * `refundBySig` and `rehash`; HTLCErc20 v5 and earlier refund through the
 * coordinator; HTLCErc20 v6 and HTLCNative v1 have no early refund at all.
 */
export function collabRefundPath(
  kind: string | undefined,
  version: number | undefined,
): CollabRefundPath {
  if (version === undefined) return "unavailable";
  if (kind === "native") return version >= 2 ? "direct" : "unavailable";
  if (kind === "erc20") {
    if (version >= 7) return "direct";
    return version >= 6 ? "unavailable" : "coordinator";
  }
  return "unavailable";
}

/**
 * True if `code` (the connected wallet's bytecode) is a contract wallet,
 * which cannot produce the plain ECDSA signatures the server recovers. An
 * EOA, or an EOA with an EIP-7702 delegation, still signs with its own key.
 * Unknown code (still loading, or the lookup failed) counts as an EOA; the
 * server rejects a wrong signature with a clear reason.
 */
export function isContractWallet(code: string | null | undefined): boolean {
  const hex = (code ?? "").replace(/^0x/i, "");
  if (hex.length === 0) return false;
  return parseEip7702Delegation(code) === null;
}

// The only chain where a paymaster sponsors the SDK key's own calls.
const SPONSORED_CHAIN_ID = "42161";

/**
 * Statuses in which the server signs an early (collaborative) refund: exactly
 * `SwapStatus::can_sign_client_collab_refund` (`store/src/model.rs`).
 */
export const COLLAB_REFUND_STATUSES: ReadonlySet<SwapStatus> =
  new Set<SwapStatus>([
    "clientfundedserverrefunded",
    "expired",
    "clientinvalidfunded",
    "clientfundedtoolate",
    "serverwontfund",
  ]);

export interface EvmRefundInput {
  status: SwapStatus;
  htlcKind: string | undefined;
  htlcVersion: number | undefined;
  chainId: number | string;
  gasless: boolean;
  isLightning: boolean;
  locktimePassed: boolean;
  /** The connected wallet is a contract wallet (see {@link isContractWallet}). */
  walletIsContract: boolean;
  /** A sponsored timelock refund was tried and failed. */
  sponsoredFailed: boolean;
}

export interface EvmRefundOptions {
  /** The server would sign an early refund that this client can submit. */
  collab: boolean;
  /**
   * The collab refund costs the user no gas: the SDK key sends it sponsored,
   * or the server submits it (coordinator path). On the direct path a wallet
   * sends `refundBySig` itself and pays gas.
   */
  collabGasless: boolean;
  /** The collab refund asks the wallet for a signature (coordinator path). */
  collabNeedsSignature: boolean;
  /** The lock can move to a new Lightning invoice instead of refunding. */
  retry: boolean;
  /**
   * The main refund button. Once the timelock has unlocked it is the
   * timelock refund: sponsored for gasless swaps on Arbitrum, else a wallet
   * transaction.
   */
  primary: "collab" | "sponsored" | "timelock" | "none";
  /** The primary action needs a connected wallet. */
  primaryNeedsWallet: boolean;
  /** Offer the wallet timelock refund next to a failed sponsored one. */
  walletFallback: boolean;
  /**
   * Offer the collab refund next to the wallet timelock refund or a failed
   * sponsored one: only when it is gasless, since on the direct path a
   * wallet sends it and pays the same gas as the timelock refund.
   */
  secondaryCollab: boolean;
}

export function evmRefundOptions(input: EvmRefundInput): EvmRefundOptions {
  const path = collabRefundPath(input.htlcKind, input.htlcVersion);
  const sponsored = String(input.chainId) === SPONSORED_CHAIN_ID;

  // Gasless: the SDK key sends a direct refund as a sponsored UserOp, or
  // signs for the coordinator. Wallet: the wallet sends a direct refund
  // itself, but the coordinator recovers a plain ECDSA signature from it.
  const collabDeployment = input.gasless
    ? path === "coordinator" || (path === "direct" && sponsored)
    : path === "direct" || (path === "coordinator" && !input.walletIsContract);
  const collab = COLLAB_REFUND_STATUSES.has(input.status) && collabDeployment;
  const collabGasless = collab && (input.gasless || path === "coordinator");
  const collabNeedsSignature =
    collab && !input.gasless && path === "coordinator";

  // Rehash needs `rehash` on the HTLC and a depositor authorization the
  // server recovers with ECDSA; the SDK key only sends it sponsored.
  const retry =
    input.isLightning &&
    input.status === "serverwontfund" &&
    path === "direct" &&
    (input.gasless ? sponsored : !input.walletIsContract);

  // The timelock refund needs nothing from the server, so once it has
  // unlocked it is the main action and a failing server cannot block it.
  // A gasless swap's depositor is the SDK key, refunded sponsored on Arbitrum.
  const primary = input.locktimePassed
    ? input.gasless && sponsored
      ? "sponsored"
      : "timelock"
    : collab
      ? "collab"
      : "none";
  const primaryNeedsWallet =
    primary === "timelock" || (primary === "collab" && !input.gasless);
  const walletFallback = primary === "sponsored" && input.sponsoredFailed;
  // Next to a wallet refund, or a failed sponsored one: on the coordinator
  // path the server submits it, with no bundler or paymaster involved.
  const secondaryCollab =
    (primary === "timelock" || walletFallback) && collabGasless;

  return {
    collab,
    collabGasless,
    collabNeedsSignature,
    retry,
    primary,
    primaryNeedsWallet,
    walletFallback,
    secondaryCollab,
  };
}
