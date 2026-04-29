// Re-export types from SDK - single source of truth
import {
  type Asset,
  type BtcToArkadeSwapResponse,
  type Chain,
  type ClaimResult,
  type EvmSigner,
  type GetSwapResponse,
  IdbSwapStorage,
  IdbWalletStorage,
  type TokenInfo as PureTokenInfo,
  type QuoteResponse,
  type RefundResult,
  Client as SdkClient,
  type StoredSwap,
  type SwapStatus,
  type SwapStatusHandler,
  type TokenId,
  type TokenInfo,
  type TokenInfos,
  type UnsignedPermit2FundingData,
  type VhtlcAmounts,
} from "@lendasat/lendaswap-sdk-pure";
import { getReferralCode } from "./utils/referralCode";

// Re-export SDK types for use throughout the frontend
export type {
  BtcToArkadeSwapResponse,
  GetSwapResponse,
  PureTokenInfo,
  QuoteResponse,
  RefundResult,
  StoredSwap,
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

const ORG_CODE = import.meta.env.VITE_ORG_CODE || "";

const REQUEST_SOURCE = import.meta.env.VITE_REQUEST_SOURCE?.trim() || "";

// Lazy-initialized SDK clients
let sdkClient: SdkClient | null = null;

async function getClients(): Promise<SdkClient> {
  if (!sdkClient) {
    const walletStorage = new IdbWalletStorage();

    let builder = SdkClient.builder()
      .withBaseUrl(API_BASE_URL)
      .withEsploraUrl(ESPLORA_URL)
      .withSignerStorage(walletStorage)
      .withArkadeServerUrl(ARK_SERVER_URL)
      .withSwapStorage(new IdbSwapStorage())
      .withOrgCode(ORG_CODE);

    if (REQUEST_SOURCE) {
      builder = builder.withDefaultHeaders({
        "X-Request-Source": REQUEST_SOURCE,
      });
    }

    sdkClient = await builder.build();

    // If wallet was migrated from v2 (legacy WASM SDK), recover swaps from server
    if (walletStorage.migratedFromLegacy) {
      console.log("Migrated wallet from v2 - recovering swaps from server");
      await sdkClient.recoverSwaps();
    }
  }

  return sdkClient;
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

  async buildCollabRefundEvmTypedData(
    swapId: string,
    settlement: "swap-back" | "direct" = "direct",
  ) {
    const client = await getClients();
    return await client.buildCollabRefundEvmTypedData(swapId, settlement);
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

  async recoverSwaps(): Promise<StoredSwap[]> {
    const client = await getClients();
    return await client.recoverSwaps();
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
      account_factory: string;
      account_impl: string;
      salt: string;
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
