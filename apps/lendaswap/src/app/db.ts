import Dexie, { type EntityTable } from "dexie";
import type { GetSwapResponse } from "./api";

/**
 * Additional sensitive fields stored locally alongside swap data
 * These fields are needed for claiming/refunding but aren't returned by the API
 */
export interface StoredSwapExtras {
  // Secret preimage for HTLC (only for swaps where we create the secret)
  secret?: string;
  // User's private key
  own_sk?: string;
  // Public key for refunds (BTC → EVM swaps)
  refund_pk?: string;
  // Public key for receiving (EVM → BTC swaps)
  receiver_pk?: string;
}

/**
 * Swap type stored in the database, combining API response with local sensitive fields
 */
export type StoredSwap = GetSwapResponse & StoredSwapExtras;

/**
 * CCTP-inbound bridging session stored locally so a tab close / reload
 * between the source-chain burn and the Arbitrum multicall submission
 * doesn't strand the user. Keyed by `swap_id` so the wizard can look it
 * up to decide whether to redirect into the bridging page.
 */
export interface CctpInboundSession {
  swap_id: string;
  /** SDK chain name (e.g. "Base", "Optimism"). */
  source_chain: string;
  /** CCTPv2 domain ID of the source chain. */
  source_domain: number;
  /** Amount user chose to burn, in USDC smallest units (6 decimals). */
  source_amount: string;
  /** URL-format source token (e.g. "base:USDC"). Used to resume the page URL. */
  source_token: string;
  /** URL-format target token (e.g. "lightning:BTC"). */
  target_token: string;
  /** BTC destination (Lightning invoice / onchain address / Arkade address). */
  target_address: string;
  /** Set once the user signs the burn on source. */
  burn_tx_hash?: string;
  /**
   * Stage reached. `done` rows are deletable - the standard wizard
   * continues from `clientfundingseen` once the multicall mines.
   */
  phase:
    | "ready"
    | "swap_created"
    | "burn_signed"
    | "attestation_pending"
    | "submitted"
    | "done";
  created_at: number;
  updated_at: number;
}

// Define the database schema
export class LendaswapDatabase extends Dexie {
  swaps!: EntityTable<StoredSwap, "id">;
  cctpInboundSessions!: EntityTable<CctpInboundSession, "swap_id">;

  constructor() {
    super("lendaswap-v1-do-not-use");

    // Define the database schema
    // Version 1: Initial schema with swaps table
    this.version(1).stores({
      // Index by id (primary key), and also by status and created_at for queries
      swaps: "id, status, created_at, direction",
    });

    // Version 2: Migrate polygon_ fields to evm_ and direction enum
    this.version(2)
      .stores({
        swaps: "id, status, created_at, direction",
      })
      .upgrade(async (tx) => {
        // Migrate all swap records from polygon_ to evm_
        await tx
          .table("swaps")
          .toCollection()
          // biome-ignore lint/suspicious/noExplicitAny: good enough
          .modify((swap: any) => {
            // Migrate direction enum
            if (swap.direction === "btc_to_polygon") {
              swap.direction = "btc_to_evm";
            } else if (swap.direction === "polygon_to_btc") {
              swap.direction = "evm_to_btc";
            }

            // Migrate polygon_ prefixed fields to evm_
            if (swap.htlc_address_polygon !== undefined) {
              swap.htlc_address_evm = swap.htlc_address_polygon;
              delete swap.htlc_address_polygon;
            }

            if (swap.user_address_polygon !== undefined) {
              swap.user_address_evm = swap.user_address_polygon;
              delete swap.user_address_polygon;
            }

            if (swap.polygon_htlc_claim_txid !== undefined) {
              swap.evm_htlc_claim_txid = swap.polygon_htlc_claim_txid;
              delete swap.polygon_htlc_claim_txid;
            }

            if (swap.polygon_htlc_fund_txid !== undefined) {
              swap.evm_htlc_fund_txid = swap.polygon_htlc_fund_txid;
              delete swap.polygon_htlc_fund_txid;
            }
          });
      });

    // Version 3: add cctp_inbound_sessions table for CCTP source-side flow.
    this.version(3).stores({
      swaps: "id, status, created_at, direction",
      cctpInboundSessions: "swap_id, phase, updated_at",
    });
  }
}

// Create a singleton instance
export const db = new LendaswapDatabase();

// Database operations

/**
 * Add a new swap to the database or update if it already exists
 * @param swap The swap data to add/update
 * @returns The swap ID
 */
export async function addSwap(swap: StoredSwap): Promise<string> {
  await db.swaps.put(swap);
  return swap.id;
}

/**
 * Update an existing swap with partial data
 * @param id The swap ID to update
 * @param updates Partial swap data to update
 * @returns The number of updated records (0 or 1)
 */
export async function updateSwap(
  id: string,
  updates: Partial<StoredSwap>,
): Promise<number> {
  return db.swaps.update(id, updates);
}

/**
 * Get a swap by its ID
 * @param id The swap ID
 * @returns The swap data or undefined if not found
 */
export async function getSwapById(id: string): Promise<StoredSwap | undefined> {
  return db.swaps.get(id);
}

/**
 * Get all swaps from the database, ordered by creation date (newest first)
 * @returns Array of all swaps
 */
export async function getAllSwaps(): Promise<StoredSwap[]> {
  return db.swaps.orderBy("created_at").reverse().toArray();
}

/**
 * Get swaps filtered by status
 * @param status The swap status to filter by
 * @returns Array of swaps with the specified status
 */
export async function getSwapsByStatus(
  status: StoredSwap["status"],
): Promise<StoredSwap[]> {
  return db.swaps.where("status").equals(status).toArray();
}

/**
 * Get swaps filtered by direction
 * @param direction The swap direction ("btc_to_evm" or "evm_to_btc")
 * @returns Array of swaps with the specified direction
 */
export async function getSwapsByDirection(
  direction: "btc_to_evm" | "evm_to_btc",
): Promise<StoredSwap[]> {
  return db.swaps.where("direction").equals(direction).toArray();
}

/**
 * Delete a swap by its ID
 * @param id The swap ID to delete
 */
export async function deleteSwap(id: string): Promise<void> {
  await db.swaps.delete(id);
}

/**
 * Delete all swaps from the database
 */
export async function clearAllSwaps(): Promise<void> {
  await db.swaps.clear();
}

/**
 * Get the count of all swaps in the database
 * @returns The total number of swaps
 */
export async function getSwapCount(): Promise<number> {
  return db.swaps.count();
}

// ── CCTP-inbound session persistence ────────────────────────────────────────

/**
 * Insert or update a CCTP-inbound bridging session. Refreshes `updated_at`
 * automatically; preserves `created_at` on update.
 */
export async function upsertCctpInboundSession(
  session: Omit<CctpInboundSession, "created_at" | "updated_at"> &
    Partial<Pick<CctpInboundSession, "created_at" | "updated_at">>,
): Promise<string> {
  const now = Date.now();
  const existing = await db.cctpInboundSessions.get(session.swap_id);
  const record: CctpInboundSession = {
    ...session,
    created_at: existing?.created_at ?? session.created_at ?? now,
    updated_at: now,
  };
  await db.cctpInboundSessions.put(record);
  return session.swap_id;
}

export async function getCctpInboundSession(
  swapId: string,
): Promise<CctpInboundSession | undefined> {
  return db.cctpInboundSessions.get(swapId);
}

export async function deleteCctpInboundSession(swapId: string): Promise<void> {
  await db.cctpInboundSessions.delete(swapId);
}
