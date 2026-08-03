// Re-export types from SDK - single source of truth
import {
  type Asset,
  type BtcToArkadeSwapResponse,
  type Chain,
  type ClaimResult,
  type ContinueRefundedEvmSwapInfo,
  type ContinueRefundedEvmSwapResult,
  type EvmSigner,
  type GetSwapResponse,
  IdbSwapStorage,
  IdbWalletStorage,
  type TokenInfo as PureTokenInfo,
  type QuoteResponse,
  type RecoverAllSwapsResult,
  type RefundResult,
  Client as SdkClient,
  type StoredSwap,
  type SwapAction,
  type SwapActions,
  type SwapStatus,
  type SwapStatusHandler,
  type TokenId,
  type TokenInfo,
  type TokenInfos,
  type UnsignedPermit2FundingData,
  type VhtlcAmounts,
} from "@satora/swap";
import { createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { buildEvmSigner } from "./utils/evmSigner";
import { getReferralCode } from "./utils/referralCode";

// Re-export SDK types for use throughout the frontend
export type {
  BtcToArkadeSwapResponse,
  ContinueRefundedEvmSwapInfo,
  ContinueRefundedEvmSwapResult,
  GetSwapResponse,
  PureTokenInfo,
  QuoteResponse,
  RecoverAllSwapsResult,
  RefundResult,
  StoredSwap,
  SwapAction,
  SwapActions,
  SwapStatus,
  TokenId,
  TokenInfo,
  TokenInfos,
  VhtlcAmounts,
};
export type Version = { tag: string; commit_hash: string };

export interface EvmTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo_uri?: string;
}

export interface EvmTokensResponse {
  chains: Record<string, EvmTokenInfo[]>;
}

export interface SwapRequest {
  // Source amount in sats
  source_amount?: bigint;
  target_address: string;
  // Target amount in the asset of choice, e.g. $1 = 1
  target_amount?: number;
  target_token: TokenId;
  referral_code?: string;
}

// Quote request type
export interface QuoteRequest {
  from: TokenId;
  to: TokenId;
  base_amount: number;
}

/**
 * Request to create an EVM to Arkade swap (Token → BTC).
 */
export interface EvmToArkadeSwapRequest {
  target_address: string;
  source_amount: number;
  source_token: TokenId;
  user_address: string;
  referral_code?: string;
}

/**
 * Request to create an EVM to Lightning swap.
 */
export interface EvmToLightningSwapRequest {
  bolt11_invoice: string;
  source_token: TokenId;
  user_address: string;
  referral_code?: string;
}

/**
 * Request to create an on-chain Bitcoin to Arkade swap.
 */
export interface BtcToArkadeSwapRequest {
  /** User's target Arkade address to receive VTXOs */
  target_arkade_address: string;
  /** Amount user wants to receive on Arkade in satoshis */
  sats_receive: number;
  /** Optional referral code */
  referral_code?: string;
}

/**
 * Request to create an on-chain Bitcoin to EVM swap.
 */
export interface OnchainToEvmSwapRequest {
  /** User's EVM address to receive tokens */
  target_address: string;
  /** Amount of BTC to send in satoshis */
  source_amount: bigint;
  /** Target token (e.g., "usdc_pol", "usdt_pol") */
  target_token: TokenId;
  /** Optional referral code */
  referral_code?: string;
}

// Token utility functions
export { getTokenDisplayName, getTokenIcon } from "./utils/tokenUtils";

// API client for Satora backend
const API_BASE_URL =
  import.meta.env.VITE_LENDASWAP_API_URL || "http://localhost:3333";

const ARK_SERVER_URL =
  import.meta.env.VITE_ARKADE_URL || "https://arkade.computer";

const ESPLORA_URL =
  import.meta.env.VITE_ESPLORA_URL || "https://mempool.space/api";

const REF_CODE = import.meta.env.VITE_REF_CODE || "";

const REQUEST_SOURCE = import.meta.env.VITE_REQUEST_SOURCE?.trim() || "";

// Account-abstraction config. Hosted providers may expose chain RPC, bundler,
// and paymaster on one URL; local E2E splits Anvil RPC from alto bundler.
const AA_BUNDLER_URL = import.meta.env.VITE_AA_BUNDLER_URL?.trim() || "";
const AA_RPC_URL =
  import.meta.env.VITE_AA_RPC_URL?.trim() ||
  (import.meta.env.VITE_RPC_OVERRIDE_CHAIN_ID === "42161"
    ? import.meta.env.VITE_RPC_OVERRIDE_URL?.trim()
    : "") ||
  AA_BUNDLER_URL;
const AA_POLICY_ID = import.meta.env.VITE_AA_POLICY_ID?.trim() || "";

// Lazy-initialized SDK client. Cache the in-flight PROMISE, not the built
// instance: concurrent first callers (app boot fires several api calls at
// once) must all get the same client, or state bound to one instance — like
// started tracking — is invisible through another.
let sdkClientPromise: Promise<SdkClient> | null = null;

function getClients(): Promise<SdkClient> {
  sdkClientPromise ??= buildClient().catch((err) => {
    sdkClientPromise = null; // let a later call retry
    throw err;
  });
  return sdkClientPromise;
}

async function buildClient(): Promise<SdkClient> {
  const walletStorage = new IdbWalletStorage();

  let builder = SdkClient.builder()
    .withBaseUrl(API_BASE_URL)
    .withEsploraUrl(ESPLORA_URL)
    .withSignerStorage(walletStorage)
    .withArkadeServerUrl(ARK_SERVER_URL)
    .withSwapStorage(new IdbSwapStorage())
    .withReferralCode(REF_CODE)
    // Background auto-claim: the SDK worker claims a swap the moment the chain
    // confirms it's claimable — even when the user isn't on the processing
    // page. The page's own claim effect stays for one swap class: BTC→USDC on
    // Solana via CCTP, where the (Arbitrum) claim must carry the user's Solana
    // USDC ATA as `bridgeRecipient` — resolved by the page from state pinned
    // at create time. The worker's bare claim can't supply it, and the SDK
    // throws on such a claim without a recipient, so the worker fails loudly
    // there instead of burning toward an unknown destination.
    .withAutoClaim();

  if (REQUEST_SOURCE) {
    builder = builder.withDefaultHeaders({
      "X-Request-Source": REQUEST_SOURCE,
    });
  }

  if (AA_BUNDLER_URL) {
    builder = builder.withAa({
      bundlerUrl: AA_BUNDLER_URL,
      rpcUrl: AA_RPC_URL,
      ...(AA_POLICY_ID ? { paymasterPolicyId: AA_POLICY_ID } : {}),
    });
  }

  const client = await builder.build();

  // If wallet was migrated from v2 (legacy WASM SDK), recover swaps from server.
  if (walletStorage.migratedFromLegacy) {
    console.log("Migrated wallet from v2 - recovering swaps from server");
    const recovery = await client.recoverAllSwaps();
    if (!recovery.complete) {
      console.warn(
        "Migrated wallet recovery stopped before completion:",
        recovery.errorMessage,
      );
    }
  }

  return client;
}

// Chain tracking (the SDK's derived next-action model). Started once, lazily,
// by the first action subscriber; a start failure resets so the next
// subscriber retries — the rest of the app works from server status without it.
let trackingReady: Promise<void> | null = null;

function ensureTracking(client: SdkClient): Promise<void> {
  trackingReady ??= client.startTracking().catch((err) => {
    trackingReady = null;
    throw err;
  });
  return trackingReady;
}

export const api = {
  async loadMnemonic(mnemonic: string): Promise<void> {
    const client = await getClients();
    await client.loadMnemonic(mnemonic);
  },

  async getTokens(): Promise<TokenInfos> {
    const client = await getClients();
    return await client.getTokens();
  },

  async getEvmTokens(): Promise<EvmTokensResponse> {
    const response = await fetch(`${API_BASE_URL}/evm-tokens`);
    if (!response.ok)
      throw new Error(`Failed to fetch EVM tokens: ${response.status}`);
    return response.json();
  },

  async getQuote(request: {
    sourceChain: Chain;
    sourceToken: string;
    targetChain: Chain;
    targetToken: string;
    sourceAmount?: number;
    targetAmount?: number;
    bridgeRecipientSetup?: boolean;
  }): Promise<QuoteResponse> {
    const referralCode = getReferralCode();
    const client = await getClients();
    return await client.getQuote({
      ...request,
      referralCode: referralCode || undefined,
    });
  },

  async createSwap(request: {
    source?: Asset;
    target?: Asset;
    sourceAsset?: TokenInfo;
    targetAsset?: TokenInfo;
    sourceAmount?: number;
    targetAmount?: number;
    targetAddress: string;
    userAddress?: string;
    gasless?: boolean;
    bridgeRecipientSetup?: boolean;
    bridgeRecipient?: string;
    bridgeRecipientWallet?: string;
  }): Promise<GetSwapResponse> {
    const referralCode = getReferralCode();
    const client = await getClients();
    const result = await client.createSwap({
      source: request.source,
      target: request.target,
      sourceAsset: request.sourceAsset,
      targetAsset: request.targetAsset,
      sourceAmount: request.sourceAmount,
      targetAmount: request.targetAmount,
      targetAddress: request.targetAddress,
      userAddress: request.userAddress,
      referralCode: referralCode || undefined,
      gasless: request.gasless,
      bridgeRecipientSetup: request.bridgeRecipientSetup,
      bridgeRecipient: request.bridgeRecipient,
      bridgeRecipientWallet: request.bridgeRecipientWallet,
    });
    return result.response as GetSwapResponse;
  },

  /**
   * Load a swap owned by this wallet.
   *
   * Refreshes the server copy into local IndexedDB (best effort — server
   * errors are logged and swallowed so the stale local copy is still
   * returned), then reads back the `StoredSwap`, which includes
   * wallet-only fields (preimage, derived keys, direction) not present in
   * the raw server response.
   *
   * Throws if the swap is not in local storage. Use this for swaps the
   * current wallet created or recovered — it is NOT suitable for looking
   * up arbitrary swap IDs, since those won't have local keys.
   */
  async getSwap(id: string): Promise<StoredSwap> {
    const client = await getClients();

    try {
      await client.getSwap(id, { updateStorage: true });
    } catch (error) {
      console.error(`Failed refreshing swap from server ${error}`);
    }
    const stored = await client.getStoredSwap(id);
    if (!stored) {
      throw new Error("Swap not found");
    }
    return stored;
  },

  /**
   * Local-only read of a stored swap — no server round-trip. Used where a
   * label/lookup must not block on (or fail with) the network, e.g. the
   * action-center toasts. `undefined` if this wallet doesn't know the swap.
   */
  async getStoredSwapLocal(id: string): Promise<StoredSwap | undefined> {
    const client = await getClients();
    return (await client.getStoredSwap(id)) ?? undefined;
  },

  /**
   * Fetch the server's view of any swap by ID.
   *
   * Hits `GET /swap/{id}` directly and returns the raw `GetSwapResponse`
   * without touching local storage. No preimage/keys are included, so
   * you cannot claim or refund with this result — it is read-only.
   *
   * Use this for public lookups (e.g. the /track page) where the swap
   * may belong to another wallet. Throws on network or 404 errors.
   */
  async fetchSwap(id: string): Promise<GetSwapResponse> {
    const client = await getClients();
    return await client.getSwap(id);
  },

  subscribeToSwaps(
    ids: string[],
    onUpdate: SwapStatusHandler,
  ): Promise<() => void> {
    return getClients().then((client) =>
      client.subscribeToSwaps(ids, onUpdate),
    );
  },

  async listAllSwaps(): Promise<StoredSwap[]> {
    const client = await getClients();
    return await client.listAllSwaps();
  },

  /**
   * Subscribe to the SDK's chain-derived next actions. Starts tracking on
   * first use, replays the current action per tracked swap, then fires on
   * every change. Resolves to an unsubscribe fn; rejects if tracking couldn't
   * start.
   */
  async subscribeToActions(
    onActions: (swapId: string, actions: SwapActions) => void,
  ): Promise<() => void> {
    const client = await getClients();
    await ensureTracking(client);
    return client.subscribeToActions(onActions);
  },

  async claim(
    id: string,
    options?: { bridgeRecipient?: string; bridgeRecipientWallet?: string },
  ): Promise<ClaimResult> {
    const client = await getClients();
    return await client.claim(id, options);
  },

  async amountsForSwap(id: string): Promise<VhtlcAmounts> {
    const client = await getClients();
    return await client.amountsForSwap(id);
  },

  /**
   * Current Bitcoin MTP (median time past) in ms — the clock BTC/Arkade HTLC
   * refund locktimes are enforced against. Lags wall clock by ~30–90 min, so
   * unlock countdowns must use this, not `Date.now()`.
   */
  async getMtpMs(): Promise<number> {
    const client = await getClients();
    return (await client.getMtp()).mtp * 1000;
  },

  async refundVhtlc(id: string, refundAddress: string): Promise<string> {
    const client = await getClients();
    const result = await client.refundSwap(id, {
      destinationAddress: refundAddress,
    });
    if (result.success && result.txId) {
      return result.txId;
    }
    throw Error(`Unable to refund: ${id}. Due to ${result.message}`);
  },

  async refundOnchainHtlc(
    swapId: string,
    refundAddress: string,
  ): Promise<string> {
    const client = await getClients();
    const result = await client.refundSwap(swapId, {
      destinationAddress: refundAddress,
    });
    if (result.success && result.txId && result.broadcast) {
      return result.txId;
    }
    throw new Error(
      `Unable to refund: ${swapId}. ${result.message}. Raw TX '${result.txHex}'`,
    );
  },

  async getPermit2FundingParamsUnsigned(
    swapId: string,
    chainId: number,
  ): Promise<UnsignedPermit2FundingData> {
    const client = await getClients();
    return await client.getPermit2FundingParamsUnsigned(swapId, chainId);
  },

  async fundSwap(
    swapId: string,
    signer: EvmSigner,
  ): Promise<{ txHash: string }> {
    const client = await getClients();
    return await client.fundSwap(swapId, signer);
  },

  async refundEvmSwap(
    swapId: string,
    mode: "swap-back" | "direct" = "swap-back",
  ): Promise<NonNullable<RefundResult["evmRefundData"]>> {
    const client = await getClients();
    const result = await client.refundSwap(swapId, { mode });
    if (result.evmRefundData) {
      return result.evmRefundData;
    }
    throw new Error(
      `Unable to get EVM refund data for: ${swapId}. ${result.message}`,
    );
  },

  async refundEvmWithSigner(
    swapId: string,
    signer: EvmSigner,
    mode: "swap-back" | "direct" = "swap-back",
  ): Promise<{ txHash: string }> {
    const client = await getClients();
    return await client.refundEvmWithSigner(swapId, signer, mode);
  },

  async collabRefundEvmSwap(
    swapId: string,
    settlement: "swap-back" | "direct" = "direct",
  ): Promise<{ id: string; txHash: string; message: string }> {
    const client = await getClients();
    return await client.collabRefundEvmSwap(swapId, settlement);
  },

  async collabRefundEvmWithSigner(
    swapId: string,
    signer: EvmSigner,
    settlement: "swap-back" | "direct" = "direct",
  ): Promise<{ txHash: string }> {
    const client = await getClients();
    return await client.collabRefundEvmWithSigner(swapId, signer, settlement);
  },

  // Return type derived through the SDK client so it names types via
  // `@satora/swap` (portable) rather than the old SDK's nested, non-portable
  // declaration paths — otherwise TS2742 on the inferred type.
  buildCollabRefundEvmTypedData(
    swapId: string,
    settlement: "swap-back" | "direct" = "direct",
  ): ReturnType<SdkClient["buildCollabRefundEvmTypedData"]> {
    return getClients().then((client) =>
      client.buildCollabRefundEvmTypedData(swapId, settlement),
    );
  },

  /** POST a pre-signed collab refund (for wallet-funded swaps where the wallet signs the EIP-712 digest). */
  async submitCollabRefundEvm(
    swapId: string,
    body: {
      v: number;
      r: string;
      s: string;
      depositor_address: string;
      mode: "direct" | "swap-back";
      sweep_token?: string;
      min_amount_out: string;
    },
  ): Promise<{ id: string; txHash: string; message: string }> {
    const client = await getClients();
    return await client.submitCollabRefundEvm(swapId, body);
  },

  async getVersion(): Promise<{ tag: string; commit_hash: string }> {
    const client = await getClients();
    return await client.getVersion();
  },

  async recoverAllSwaps(): Promise<RecoverAllSwapsResult> {
    const client = await getClients();
    return await client.recoverAllSwaps();
  },

  async getMnemonic(): Promise<string> {
    const client = await getClients();
    return client.getMnemonic();
  },

  async getUserIdXpub() {
    const client = await getClients();
    return client.getUserIdXpub();
  },

  async clearSwapStorage(): Promise<void> {
    const client = await getClients();
    await client.clearSwapStorage();
  },

  async deleteSwap(id: string): Promise<void> {
    const client = await getClients();
    await client.deleteSwap(id);
  },

  async fundSwapGasless(swapId: string): Promise<{ txHash: string }> {
    const client = await getClients();
    return await client.fundSwapGasless(swapId);
  },

  async getSwapAndLockUseropCalldata(swapId: string): Promise<{
    coordinator_address: string;
    permit2_address: string;
    source_token_address: string;
    source_amount: string;
    lock_token_address: string;
    preimage_hash: string;
    claim_address: string;
    timelock: number;
    calls: Array<{ target: string; value: string; call_data: string }>;
    calls_hash: string;
    relay_fee?: string;
    aa: {
      entry_point: string;
      delegation_target: string;
    };
  }> {
    const resp = await fetch(
      `${API_BASE_URL}/swap/${swapId}/swap-and-lock-calldata-userop`,
    );
    if (!resp.ok) {
      throw new Error(
        `Failed to get userop calldata: ${resp.status} ${await resp.text()}`,
      );
    }
    return resp.json();
  },

  async getSwapDepositorKey(
    swapId: string,
  ): Promise<{ privateKey: string; address: string }> {
    const client = await getClients();
    return await client.getSwapDepositorKey(swapId);
  },

  async getEvmDepositorKey(): Promise<{
    privateKey: string;
    address: string;
  }> {
    const client = await getClients();
    return client.getEvmDepositorKey();
  },

  async getRefundedEvmSwapContinuation(
    swapId: string,
  ): Promise<ContinueRefundedEvmSwapInfo> {
    const client = await getClients();
    const { privateKey } = client.getEvmDepositorKey();
    const account = privateKeyToAccount(
      (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex,
    );
    const walletClient = createWalletClient({
      account,
      chain: arbitrum,
      transport: http(AA_RPC_URL || undefined),
    });
    const signer = buildEvmSigner(walletClient, arbitrum);
    return await client.getRefundedEvmSwapContinuation(swapId, signer);
  },

  async continueRefundedEvmSwap(
    swapId: string,
    targetAddress: string,
  ): Promise<ContinueRefundedEvmSwapResult> {
    const client = await getClients();
    const { privateKey } = client.getEvmDepositorKey();
    const account = privateKeyToAccount(
      (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex,
    );
    const walletClient = createWalletClient({
      account,
      chain: arbitrum,
      transport: http(AA_RPC_URL || undefined),
    });
    const signer = buildEvmSigner(walletClient, arbitrum);
    return await client.continueRefundedEvmSwap(swapId, {
      targetAddress,
      signer,
    });
  },

  async hasReceivedVtxo(swapId: string): Promise<boolean> {
    const client = await getClients();
    return await client.hasReceivedVtxo(swapId);
  },

  async continueArkadeClaimSwap(swapId: string): Promise<{
    success: boolean;
    message: string;
    txId?: string;
    claimAmount?: bigint;
  }> {
    const client = await getClients();
    return await client.continueArkadeClaimSwap(swapId);
  },
};
