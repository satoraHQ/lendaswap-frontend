import { type BridgeTokenInfo, toChain } from "@satora/swap";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, type StoredSwap, type SwapAction, type SwapActions } from "./api";
import {
  getTargetChainDisplayName,
  getTokenIcon,
  getTokenNetworkIcon,
} from "./utils/tokenUtils";

/**
 * Swap action center: subscribes once to the SDK's chain-derived next actions
 * and keeps two live views — the full derived actions per non-terminal swap
 * ({@link useDerivedSwapActions}, e.g. the swaps page labels) and the subset
 * that needs the user ({@link useActionableSwaps}, the pulsing indicators).
 * A swap newly needing the user is surfaced as a sonner toast.
 */

/**
 * Action ids worth the user's attention. Deliberately excludes `fund` (an
 * unfunded swap is a choice, not an emergency — surfacing it would keep the
 * indicator lit for every created-then-abandoned swap) and the no-ops
 * wait/none.
 */
const ACTIONABLE = new Set<SwapAction["id"]>([
  "claim",
  "refund_collaborative",
  "refund_unilateral",
  "recover_cctp_claim",
]);

const ACTION_COPY: Partial<Record<SwapAction["id"], string>> = {
  claim: "Ready to claim",
  refund_collaborative: "Refund available",
  refund_unilateral: "Refund available",
  recover_cctp_claim: "Bridged swap needs recovery",
};

/** Status-line color per action — matches the swaps page's label colors. */
const ACTION_COLOR: Partial<Record<SwapAction["id"], string>> = {
  claim: "text-lime-600 dark:text-lime-400",
  refund_collaborative: "text-amber-600 dark:text-amber-400",
  refund_unilateral: "text-amber-600 dark:text-amber-400",
  recover_cctp_claim: "text-amber-600 dark:text-amber-400",
};

/**
 * The stored swap behind a toast, if this wallet knows it. Local-only read
 * (no server), memoized — the toast identifies WHICH swap needs the user, so
 * it must not depend on the server being up.
 */
const storedSwaps = new Map<string, Promise<StoredSwap | undefined>>();

function storedSwapFor(swapId: string): Promise<StoredSwap | undefined> {
  let stored = storedSwaps.get(swapId);
  if (!stored) {
    stored = api.getStoredSwapLocal(swapId).catch(() => undefined);
    storedSwaps.set(swapId, stored);
  }
  return stored;
}

/** One token circle with its network badge — the swaps-page treatment. */
function TokenCircle({ token }: { token: BridgeTokenInfo }) {
  return (
    <>
      <div className="w-7 h-7 rounded-full bg-background border-2 border-background flex items-center justify-center overflow-hidden shadow-sm">
        <div className="w-6 h-6 flex items-center justify-center">
          {getTokenIcon(token)}
        </div>
      </div>
      <div className="bg-background absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full p-[1px]">
        <div className="flex h-full w-full items-center justify-center rounded-full [&_svg]:h-full [&_svg]:w-full">
          {getTokenNetworkIcon(token)}
        </div>
      </div>
    </>
  );
}

/**
 * Rich toast body: overlapping source/target token icons, the bold amount +
 * pair, and a colored status line with the short swap id — the same visual
 * language as a swap-history row.
 */
function SwapActionToast({
  swap,
  action,
}: {
  swap: StoredSwap;
  action: SwapAction;
}) {
  const { response } = swap;
  const source = response.source_token;
  // For bridged swaps the network badge shows the real destination (e.g.
  // Solana), not the intermediate DEX chain — same override as the swaps page.
  const target: BridgeTokenInfo =
    "bridge_target_chain" in response && response.bridge_target_chain
      ? {
          ...response.target_token,
          chain: toChain(getTargetChainDisplayName(response)),
        }
      : response.target_token;
  const amount = (
    Number(response.source_amount) /
    10 ** source.decimals
  ).toLocaleString(undefined, { maximumFractionDigits: source.decimals });

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-11 h-7 flex-shrink-0">
        <div className="absolute left-0 top-0 z-10">
          <TokenCircle token={source} />
        </div>
        <div className="absolute left-4 top-0">
          <TokenCircle token={target} />
        </div>
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-foreground">
          {amount} {source.symbol} → {response.target_token.symbol}
        </div>
        <div className="text-xs mt-0.5">
          <span className={ACTION_COLOR[action.id]}>
            {ACTION_COPY[action.id] ?? "Needs your attention"}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {swap.response.id.slice(0, 8)}
          </span>
        </div>
      </div>
    </div>
  );
}

let actionable: ReadonlyMap<string, SwapAction> = new Map();
let derived: ReadonlyMap<string, SwapActions> = new Map();
const listeners = new Set<() => void>();
let started = false;

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Start the center (idempotent). `navigateToSwap` is called when the user
 * clicks a toast's View button.
 */
export function startSwapActionCenter(
  navigateToSwap: (swapId: string) => void,
): void {
  if (started) return;
  started = true;

  api
    .subscribeToActions((swapId, actions) => {
      const recommended = actions.actions.find((a) => a.recommended);

      // The full derived view. Terminal `none` entries are KEPT: the chain
      // knew the outcome the moment it happened, while the stored status can
      // lag behind (a just-refunded swap would otherwise fall back to a stale
      // "Action Required"). Only an empty derivation drops the entry.
      const nextDerived = new Map(derived);
      if (recommended === undefined) nextDerived.delete(swapId);
      else nextDerived.set(swapId, actions);
      derived = nextDerived;

      // (Stored-status refresh on terminal derivations is handled inside the
      // SDK now — it re-fetches with updateStorage so the next session's
      // settled filter sees the final status.)

      const needsUser =
        recommended !== undefined && ACTIONABLE.has(recommended.id);
      const previous = actionable.get(swapId);

      if (!needsUser) {
        if (previous) {
          const next = new Map(actionable);
          next.delete(swapId);
          actionable = next;
          toast.dismiss(`swap-action-${swapId}`);
        }
        notify();
        return;
      }
      if (previous?.id === recommended.id) {
        notify();
        return;
      }

      actionable = new Map(actionable).set(swapId, recommended);
      notify();

      // Don't toast about the swap the user is already looking at. One toast
      // id per swap, so a changed action replaces instead of stacking.
      if (window.location.pathname.includes(swapId)) return;
      void storedSwapFor(swapId).then((stored) => {
        // The action may have resolved (and its toast been dismissed) while
        // the lookup ran — don't resurrect it.
        if (actionable.get(swapId)?.id !== recommended.id) return;
        const options = {
          id: `swap-action-${swapId}`,
          // Stays until dismissed, acted on, or the action resolves on-chain
          // (then it's dismissed programmatically above).
          duration: Number.POSITIVE_INFINITY,
          closeButton: true,
          action: {
            label: "View",
            onClick: () => navigateToSwap(swapId),
          },
        };
        if (stored) {
          toast(
            <SwapActionToast swap={stored} action={recommended} />,
            options,
          );
        } else {
          // Unknown to this wallet — fall back to the generic text form.
          toast(ACTION_COPY[recommended.id] ?? "A swap needs your attention", {
            ...options,
            description: `${recommended.reason} (${swapId.slice(0, 8)})`,
          });
        }
      });
    })
    .catch((err) => {
      started = false; // let a later mount retry
      console.warn("swap action center: failed to start:", err);
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live map of swapId → recommended action for swaps that need the user. */
export function useActionableSwaps(): ReadonlyMap<string, SwapAction> {
  return useSyncExternalStore(subscribe, () => actionable);
}

/**
 * Live map of swapId → full derived actions for every tracked, non-terminal
 * swap — including waits and blocked (timelocked) refunds, so a list view can
 * show the real next step instead of a generic "in progress".
 */
export function useDerivedSwapActions(): ReadonlyMap<string, SwapActions> {
  return useSyncExternalStore(subscribe, () => derived);
}
