import {
  type CctpChainName,
  type CctpMessageStatus,
  type Chain,
  type GetSwapResponse,
  type LayerZeroMessageStatus,
  type SwapStatus,
  toChain,
  toChainName,
  trackCctpMessage,
  trackLzMessage,
} from "@satora/swap";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { api, getTokenIcon } from "../api";
import {
  getBlockexplorerTxLink,
  getTargetChainDisplayName,
  getTokenNetworkIcon,
} from "../utils/tokenUtils";
import { getBridgeInfo, getBridgeType } from "../wizard/steps/success/config";

type Actor = "user" | "server";
type Action = "locked" | "claimed";

interface TxItem {
  stepNumber: number;
  actor: Actor;
  action: Action;
  chain: string;
  txid: string;
}

function stepLabel(item: TxItem): string {
  const who = item.actor === "user" ? "User" : "Server";
  const act = item.action === "locked" ? "locked on" : "claimed";
  return `${item.stepNumber}. ${who} ${act} ${toChainName(item.chain as Chain)}`;
}

function getStatusLabel(status: SwapStatus): {
  label: string;
  color: string;
  spin: boolean;
} {
  switch (status) {
    case "serverredeemed":
      return {
        label: "Completed",
        color: "text-green-600 dark:text-green-400",
        spin: false,
      };
    case "expired":
      return {
        label: "Expired",
        color: "text-muted-foreground",
        spin: false,
      };
    case "clientrefunded":
    case "clientrefundedserverrefunded":
      return {
        label: "Refunded",
        color: "text-muted-foreground",
        spin: false,
      };
    case "clientfundedserverrefunded":
    case "clientinvalidfunded":
    case "clientfundedtoolate":
    case "clientrefundedserverfunded":
      return {
        label: "Action Required",
        color: "text-red-600 dark:text-red-400",
        spin: false,
      };
    default:
      return {
        label: "In Progress",
        color: "text-orange-600 dark:text-orange-400",
        spin: true,
      };
  }
}

interface TxSlot {
  stepNumber: 1 | 2 | 3 | 4;
  actor: Actor;
  action: Action;
  chain: string;
  txid: string | null | undefined;
}

/**
 * Produce the tx list for a swap in protocol order:
 *   1) user locks on source chain   2) server locks on target chain
 *   3) user claims on target chain  4) server claims on source chain
 * Mirrors the step mapping in SwapProcessingStep.getConfig().
 */
function extractTxs(swap: GetSwapResponse): TxItem[] {
  const evmChainId =
    "evm_chain_id" in swap && swap.evm_chain_id
      ? String(swap.evm_chain_id)
      : "";
  const sourceChain = String(swap.source_token.chain);
  const targetChain = String(swap.target_token.chain);

  const slots: TxSlot[] = (() => {
    switch (swap.direction) {
      case "btc_to_arkade":
        return [
          {
            stepNumber: 1,
            actor: "user",
            action: "locked",
            chain: sourceChain,
            txid: swap.btc_fund_txid,
          },
          {
            stepNumber: 2,
            actor: "server",
            action: "locked",
            chain: targetChain,
            txid: swap.arkade_fund_txid,
          },
          {
            stepNumber: 3,
            actor: "user",
            action: "claimed",
            chain: targetChain,
            txid: swap.arkade_claim_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: sourceChain,
            txid: swap.btc_claim_txid,
          },
        ];
      case "bitcoin_to_evm":
        return [
          {
            stepNumber: 1,
            actor: "user",
            action: "locked",
            chain: sourceChain,
            txid: swap.btc_fund_txid,
          },
          {
            stepNumber: 2,
            actor: "server",
            action: "locked",
            chain: evmChainId,
            txid: swap.evm_fund_txid,
          },
          {
            stepNumber: 3,
            actor: "user",
            action: "claimed",
            chain: evmChainId,
            txid: swap.evm_claim_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: sourceChain,
            txid: swap.btc_claim_txid,
          },
        ];
      case "arkade_to_evm":
        // Arkade-side VHTLC settles on Bitcoin; label it as the user-facing
        // source chain ("Arkade") but link the tx via its actual chain.
        return [
          {
            stepNumber: 1,
            actor: "user",
            action: "locked",
            chain: sourceChain,
            txid: swap.btc_fund_txid,
          },
          {
            stepNumber: 2,
            actor: "server",
            action: "locked",
            chain: evmChainId,
            txid: swap.evm_fund_txid,
          },
          {
            stepNumber: 3,
            actor: "user",
            action: "claimed",
            chain: evmChainId,
            txid: swap.evm_claim_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: sourceChain,
            txid: swap.btc_claim_txid,
          },
        ];
      case "evm_to_arkade":
        return [
          {
            stepNumber: 1,
            actor: "user",
            action: "locked",
            chain: evmChainId,
            txid: swap.evm_fund_txid,
          },
          {
            stepNumber: 2,
            actor: "server",
            action: "locked",
            chain: targetChain,
            txid: swap.btc_fund_txid,
          },
          {
            stepNumber: 3,
            actor: "user",
            action: "claimed",
            chain: targetChain,
            txid: swap.btc_claim_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: evmChainId,
            txid: swap.evm_claim_txid,
          },
        ];
      case "evm_to_bitcoin":
        return [
          {
            stepNumber: 1,
            actor: "user",
            action: "locked",
            chain: evmChainId,
            txid: swap.evm_fund_txid,
          },
          {
            stepNumber: 2,
            actor: "server",
            action: "locked",
            chain: targetChain,
            txid: swap.btc_fund_txid,
          },
          {
            stepNumber: 3,
            actor: "user",
            action: "claimed",
            chain: targetChain,
            txid: swap.btc_claim_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: evmChainId,
            txid: swap.evm_claim_txid,
          },
        ];
      case "lightning_to_evm":
        // Lightning-side "lock" is off-chain (invoice payment).
        return [
          {
            stepNumber: 2,
            actor: "server",
            action: "locked",
            chain: evmChainId,
            txid: swap.evm_fund_txid,
          },
          {
            stepNumber: 3,
            actor: "user",
            action: "claimed",
            chain: evmChainId,
            txid: swap.evm_claim_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: "Bitcoin",
            txid: swap.btc_claim_txid,
          },
        ];
      case "lightning_to_arkade":
        return [
          {
            stepNumber: 2,
            actor: "server",
            action: "locked",
            chain: targetChain,
            txid: swap.arkade_fund_txid,
          },
          {
            stepNumber: 3,
            actor: "user",
            action: "claimed",
            chain: targetChain,
            txid: swap.arkade_claim_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: "Bitcoin",
            txid: swap.btc_claim_txid,
          },
        ];
      case "evm_to_lightning":
        // Target is a Lightning invoice — no on-chain tx for steps 2/3.
        return [
          {
            stepNumber: 1,
            actor: "user",
            action: "locked",
            chain: evmChainId,
            txid: swap.evm_fund_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: evmChainId,
            txid: swap.evm_claim_txid,
          },
        ];
      case "arkade_to_lightning":
        return [
          {
            stepNumber: 1,
            actor: "user",
            action: "locked",
            chain: sourceChain,
            txid: swap.arkade_fund_txid,
          },
          {
            stepNumber: 4,
            actor: "server",
            action: "claimed",
            chain: sourceChain,
            txid: swap.arkade_claim_txid,
          },
        ];
    }
  })();

  return slots
    .filter((s): s is TxSlot & { txid: string } => Boolean(s.txid))
    .map((s) => ({
      stepNumber: s.stepNumber,
      actor: s.actor,
      action: s.action,
      chain: s.chain,
      txid: s.txid,
    }));
}

function truncate(s: string, head = 8, tail = 6): string {
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FetchErrorKind = "invalid-id" | "not-found" | "network" | "unknown";

interface FetchError {
  kind: FetchErrorKind;
  detail?: string;
}

function classifyError(err: unknown): FetchError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    err instanceof TypeError ||
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("load failed")
  ) {
    return { kind: "network", detail: msg };
  }
  if (
    lower.includes("not found") ||
    lower.includes("404") ||
    lower.includes("no swap data")
  ) {
    return { kind: "not-found", detail: msg };
  }
  return { kind: "unknown", detail: msg };
}

function LookupForm({
  onSubmit,
  defaultValue,
}: {
  onSubmit: (id: string) => void;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) onSubmit(trimmed);
      }}
      className="space-y-3 p-4 sm:p-6"
    >
      <p className="text-muted-foreground text-sm">
        Enter a swap ID to view its status and transactions.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="e.g. 5f3a9c1e-..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={!value.trim()}>
          Track
        </Button>
      </div>
    </form>
  );
}

function TrackDetails({
  swapId,
  onRetry,
}: {
  swapId: string;
  onRetry: () => void;
}) {
  const [swap, setSwap] = useState<GetSwapResponse | null>(null);
  const [error, setError] = useState<FetchError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [copied, setCopied] = useState(false);
  const reloadSeqRef = useRef(0);

  const idIsValid = UUID_RE.test(swapId);

  useEffect(() => {
    if (!idIsValid) {
      setError({ kind: "invalid-id" });
      setIsLoading(false);
      setSwap(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSwap(null);

    api
      .fetchSwap(swapId)
      .then((resp) => {
        if (cancelled) return;
        setSwap(resp as GetSwapResponse);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(classifyError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [swapId, idIsValid]);

  useEffect(() => {
    if (!idIsValid) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    api
      .subscribeToSwaps([swapId], (id, status) => {
        if (id !== swapId) return;
        setSwap((prev) => (prev ? { ...prev, status } : prev));
        // Refetch to pick up newly populated tx IDs alongside the status change.
        const seq = ++reloadSeqRef.current;
        api
          .fetchSwap(swapId)
          .then((resp) => {
            if (seq !== reloadSeqRef.current) return;
            setSwap(resp as GetSwapResponse);
          })
          .catch(() => {
            // Keep prior data; live status already applied above.
          });
      })
      .then((u) => {
        if (cancelled) {
          u();
          return;
        }
        unsub = u;
        setIsLive(true);
      })
      .catch((err) => {
        console.error("Failed to subscribe to swap status:", err);
      });

    return () => {
      cancelled = true;
      setIsLive(false);
      unsub?.();
    };
  }, [swapId, idIsValid]);

  const txItems = useMemo(() => (swap ? extractTxs(swap) : []), [swap]);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(swapId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy swap ID:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading swap…</span>
      </div>
    );
  }

  if (error || !swap) {
    const kind = error?.kind ?? "unknown";
    const isNetwork = kind === "network";
    const title =
      kind === "invalid-id"
        ? "Invalid swap ID"
        : kind === "not-found"
          ? "Swap not found"
          : isNetwork
            ? "Can't reach the server"
            : "Failed to load swap";
    const description =
      kind === "invalid-id"
        ? "Swap IDs are UUIDs like 5f3a9c1e-7b2d-4e8a-91c4-2a6f8d3e0b71."
        : kind === "not-found"
          ? `No swap with id ${swapId}. Double-check the ID and try again.`
          : isNetwork
            ? "The backend didn't respond. Check your connection or try again in a moment."
            : (error?.detail ?? "Something went wrong fetching this swap.");
    const Icon = isNetwork ? WifiOff : AlertCircle;

    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <Icon className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-muted-foreground mt-1 break-words text-xs">
              {description}
            </p>
            {kind !== "invalid-id" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRetry}
                className="mt-3 h-7 gap-1.5 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const status = getStatusLabel(swap.status);
  const targetChainName = getTargetChainDisplayName(swap);
  const targetToken =
    "bridge_target_chain" in swap && swap.bridge_target_chain
      ? { ...swap.target_token, chain: toChain(targetChainName) }
      : swap.target_token;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${status.color}`}
          >
            {status.spin ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : swap.status === "serverredeemed" ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
            {status.label}
          </span>
          {isLive && (
            <span className="text-muted-foreground/70 ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wide">
              <Radio className="h-3 w-3" />
              Live
            </span>
          )}
        </div>

        {/* Source → Target */}
        <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-3">
          <TokenBadge
            icon={getTokenIcon(swap.source_token)}
            network={getTokenNetworkIcon(swap.source_token)}
            symbol={swap.source_token.symbol}
            chain={String(swap.source_token.chain)}
          />
          <ArrowRight className="text-muted-foreground/50 h-4 w-4 shrink-0" />
          <TokenBadge
            icon={getTokenIcon(targetToken)}
            network={getTokenNetworkIcon(targetToken)}
            symbol={targetToken.symbol}
            chain={targetChainName}
          />
        </div>

        {/* Swap ID */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Swap ID</span>
          <code className="text-muted-foreground/80 truncate font-mono text-xs">
            {swapId}
          </code>
          <button
            type="button"
            onClick={handleCopyId}
            className="text-muted-foreground hover:bg-muted rounded p-1 transition-colors"
            aria-label="Copy swap ID"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Transactions */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Transactions
        </h3>
        {txItems.length === 0 && !getBridgeType(swap) ? (
          <p className="text-muted-foreground py-3 text-sm italic">
            No transactions yet — waiting for on-chain activity.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {txItems.map((tx) => (
              <TxRow key={`${tx.stepNumber}-${tx.txid}`} item={tx} />
            ))}
            {getBridgeType(swap) && (
              <BridgeStep
                swap={swap}
                stepNumber={(txItems[txItems.length - 1]?.stepNumber ?? 4) + 1}
              />
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function TokenBadge({
  icon,
  network,
  symbol,
  chain,
}: {
  icon: React.ReactNode;
  network: React.ReactNode;
  symbol: string;
  chain: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative shrink-0">
        <div className="bg-background flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-background shadow-sm">
          <div className="flex h-6 w-6 items-center justify-center">{icon}</div>
        </div>
        <div className="bg-background absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full p-[1px]">
          <div className="flex h-full w-full items-center justify-center rounded-full [&_svg]:h-full [&_svg]:w-full">
            {network}
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{symbol}</div>
        <div className="text-muted-foreground truncate text-[10px] uppercase tracking-wide">
          {chain}
        </div>
      </div>
    </div>
  );
}

function TxRow({ item }: { item: TxItem }) {
  return (
    <StepRow
      label={stepLabel(item)}
      chain={item.chain}
      txid={item.txid}
      statusIcon={<Check className="h-3.5 w-3.5 text-green-600" />}
    />
  );
}

interface StepRowProps {
  label: string;
  chain: string;
  txid: string;
  statusIcon?: React.ReactNode;
  rightHint?: React.ReactNode;
}

function StepRow({ label, chain, txid, statusIcon, rightHint }: StepRowProps) {
  const url = getBlockexplorerTxLink(chain, txid);
  const clickable = Boolean(url) && url !== txid;

  const content = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card px-3 py-2 transition-colors hover:bg-accent/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {statusIcon}
          <span className="truncate">{label}</span>
        </div>
        <code className="text-muted-foreground block truncate font-mono text-[11px]">
          {truncate(txid)}
        </code>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {rightHint}
        {clickable && (
          <ExternalLink className="text-muted-foreground/60 h-4 w-4" />
        )}
      </div>
    </div>
  );

  if (clickable) {
    return (
      <li>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          {content}
        </a>
      </li>
    );
  }
  return <li>{content}</li>;
}

interface BridgeStepProps {
  swap: GetSwapResponse;
  stepNumber: number;
}

type BridgePhase = "pending" | "complete" | "error";

function BridgeStep({ swap, stepNumber }: BridgeStepProps) {
  const info = useMemo(() => getBridgeInfo(swap), [swap]);
  const bridgeType = useMemo(() => getBridgeType(swap), [swap]);
  const srcTxHash = info.claimTxHash;
  const srcChainName = info.sourceChainName;
  const targetChainName = info.bridgeTargetChain;

  const [phase, setPhase] = useState<BridgePhase>("pending");
  const [stageLabel, setStageLabel] = useState<string>("Waiting…");
  const [dstTxHash, setDstTxHash] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!srcTxHash || !bridgeType) return;
    let cancelled = false;

    if (bridgeType === "cctp" && srcChainName) {
      const onStatusChange = (s: CctpMessageStatus) => {
        if (cancelled) return;
        setStageLabel(
          s === "PENDING"
            ? "Awaiting attestation…"
            : s === "CONFIRMING"
              ? "Confirming…"
              : s === "FORWARDING"
                ? `Forwarding to ${targetChainName ?? "destination"}…`
                : s === "COMPLETE"
                  ? "Delivered"
                  : s,
        );
      };
      trackCctpMessage({
        sourceChain: srcChainName as CctpChainName,
        txHash: srcTxHash,
        onStatusChange,
      })
        .then((result) => {
          if (cancelled) return;
          setPhase("complete");
          setStageLabel("Delivered");
          setDstTxHash(result.forwardTxHash ?? null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPhase("error");
          setErrMsg(err instanceof Error ? err.message : String(err));
        });
    } else if (bridgeType === "usdt0") {
      const onStatusChange = (s: LayerZeroMessageStatus) => {
        if (cancelled) return;
        setStageLabel(
          s === "CONFIRMING"
            ? "Confirming…"
            : s === "DELIVERED"
              ? "Delivered"
              : s === "FAILED" || s === "BLOCKED"
                ? s
                : `Bridging to ${targetChainName ?? "destination"}…`,
        );
      };
      trackLzMessage({ txHash: srcTxHash, onStatusChange })
        .then((result) => {
          if (cancelled) return;
          setPhase("complete");
          setStageLabel("Delivered");
          setDstTxHash(result.dstTxHash ?? null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPhase("error");
          setErrMsg(err instanceof Error ? err.message : String(err));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [bridgeType, srcChainName, srcTxHash, targetChainName]);

  if (!bridgeType || !targetChainName) return null;

  const baseLabel = `${stepNumber}. Bridged to ${targetChainName}`;
  const via = bridgeType === "cctp" ? "CCTP" : "LayerZero";

  // Prefer the destination tx once available; fall back to the source tx.
  const displayTxid = dstTxHash ?? srcTxHash ?? "";
  const displayChain = dstTxHash
    ? String(toChain(targetChainName))
    : (srcChainName ?? "");

  const icon =
    phase === "complete" ? (
      <Check className="h-3.5 w-3.5 text-green-600" />
    ) : phase === "error" ? (
      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
    );

  const hint = (
    <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
      {phase === "error" ? (errMsg ?? "error") : `${via} · ${stageLabel}`}
    </span>
  );

  if (!displayTxid) {
    return (
      <li>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card px-3 py-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {icon}
            <span>{baseLabel}</span>
          </div>
          {hint}
        </div>
      </li>
    );
  }

  return (
    <StepRow
      label={baseLabel}
      chain={displayChain}
      txid={displayTxid}
      statusIcon={icon}
      rightHint={hint}
    />
  );
}

export function TrackPage() {
  const { swapId } = useParams<{ swapId?: string }>();
  const navigate = useNavigate();
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    document.title = swapId
      ? `Track ${swapId.slice(0, 8)}… | Satora`
      : "Track Swap | Satora";
  }, [swapId]);

  if (!swapId) {
    return <LookupForm onSubmit={(id) => navigate(`/track/${id}`)} />;
  }

  return (
    <TrackDetails
      key={`${swapId}-${retryKey}`}
      swapId={swapId}
      onRetry={() => setRetryKey((n) => n + 1)}
    />
  );
}
