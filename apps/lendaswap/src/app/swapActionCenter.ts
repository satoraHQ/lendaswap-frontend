import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, type SwapAction } from "./api";

/**
 * Swap action center: subscribes once to the SDK's chain-derived next actions
 * and keeps the set of swaps that need the user (anything beyond wait/none).
 * Surfaces new ones as a sonner toast; components read the live set via
 * {@link useActionableSwaps} to highlight affected swaps.
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
  claim: "A swap is ready to claim",
  refund_collaborative: "A swap can be refunded",
  refund_unilateral: "A swap can be refunded",
  recover_cctp_claim: "A bridged swap needs recovery",
};

let actionable: ReadonlyMap<string, SwapAction> = new Map();
const listeners = new Set<() => void>();
let started = false;

function emit(next: Map<string, SwapAction>): void {
  actionable = next;
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
      const needsUser =
        recommended !== undefined && ACTIONABLE.has(recommended.id);
      const previous = actionable.get(swapId);

      if (!needsUser) {
        if (!previous) return;
        const next = new Map(actionable);
        next.delete(swapId);
        emit(next);
        toast.dismiss(`swap-action-${swapId}`);
        return;
      }
      if (previous?.id === recommended.id) return;

      emit(new Map(actionable).set(swapId, recommended));

      // Don't toast about the swap the user is already looking at. One toast
      // id per swap, so a changed action replaces instead of stacking.
      if (window.location.pathname.includes(swapId)) return;
      toast(ACTION_COPY[recommended.id] ?? "A swap needs your attention", {
        id: `swap-action-${swapId}`,
        description: recommended.reason,
        // Stays until dismissed, acted on, or the action resolves on-chain
        // (then it's dismissed programmatically above).
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
        action: {
          label: "View",
          onClick: () => navigateToSwap(swapId),
        },
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

function getSnapshot(): ReadonlyMap<string, SwapAction> {
  return actionable;
}

/** Live map of swapId → recommended action for swaps that need the user. */
export function useActionableSwaps(): ReadonlyMap<string, SwapAction> {
  return useSyncExternalStore(subscribe, getSnapshot);
}
