import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, type SwapAction, type SwapActions } from "./api";

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
  claim: "A swap is ready to claim",
  refund_collaborative: "A swap can be refunded",
  refund_unilateral: "A swap can be refunded",
  recover_cctp_claim: "A bridged swap needs recovery",
};

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
      const previousDerived = derived.get(swapId)?.recommended;

      // The full derived view. Terminal `none` entries are KEPT: the chain
      // knew the outcome the moment it happened, while the stored status can
      // lag behind (a just-refunded swap would otherwise fall back to a stale
      // "Action Required"). Only an empty derivation drops the entry.
      const nextDerived = new Map(derived);
      if (recommended === undefined) nextDerived.delete(swapId);
      else nextDerived.set(swapId, actions);
      derived = nextDerived;

      // On the transition into terminal, refresh the stored swap from the
      // server (fire-and-forget): the fallback label and the next session's
      // settled-status filter then see the final status too.
      if (
        recommended?.id === "none" &&
        previousDerived !== undefined &&
        previousDerived !== "none"
      )
        void api.getSwap(swapId).catch(() => {});

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
