/**
 * Recover USDC stranded by an incomplete CCTP-inbound flow.
 *
 * Shown on the expired-swap screen whenever a `CctpInboundSession` with a
 * `burn_tx_hash` exists. The user enters an Arbitrum address; we drive
 * the SDK's `recoverCctpInbound` to:
 *   1. fetch the IRIS attestation (if unconsumed),
 *   2. submit a paymaster-sponsored `receiveMessage` UserOp (if needed),
 *   3. submit a paymaster-sponsored `USDC.transfer(recipient, balance)`.
 *
 * No ETH required from the user — the same Kernel + Gas Manager wiring
 * the bridging step already uses.
 */

import {
  type CctpChainName,
  type RecoveryProgress,
  recoverCctpInbound,
} from "@lendasat/lendaswap-sdk-pure";
import { useAppKit } from "@reown/appkit/react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle, Check, ExternalLink, Loader } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type Address,
  createWalletClient,
  type Hex,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { useAccount } from "wagmi";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { api } from "../../api";
import { db } from "../../db";
import { buildEvmSigner } from "../../utils/evmSigner";
import { getBlockexplorerTxLink } from "../../utils/tokenUtils";

type Phase =
  | "idle"
  | "attestation"
  | "receiving"
  | "sweeping"
  | "done"
  | "error";

interface CctpInboundRecoveryStepProps {
  swapId: string;
}

function formatUsdc(amount: bigint): string {
  return (Number(amount) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function CctpInboundRecoveryStep({
  swapId,
}: CctpInboundRecoveryStepProps) {
  const { address: connectedAddress } = useAccount();
  const { open: openConnectModal } = useAppKit();

  const session = useLiveQuery(
    () => db.cctpInboundSessions.get(swapId),
    [swapId],
  );

  const [recipient, setRecipient] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [receiveOpHash, setReceiveOpHash] = useState<Hex | null>(null);
  const [sweepOpHash, setSweepOpHash] = useState<Hex | null>(null);
  const [sweepTxHash, setSweepTxHash] = useState<Hex | null>(null);
  const [recoveredAmount, setRecoveredAmount] = useState<bigint | null>(null);

  // Default the recipient field to the user's connected wallet — most
  // common destination for a recovery sweep. They can overwrite freely.
  useEffect(() => {
    if (!recipient && connectedAddress) setRecipient(connectedAddress);
  }, [connectedAddress, recipient]);

  const recipientValid = useMemo(
    () => isAddress(recipient.trim()),
    [recipient],
  );

  // Recovery only makes sense once the burn has actually been signed
  // on the source chain — otherwise there's nothing to claim.
  const hasBurnTx = !!session?.burn_tx_hash;

  const sourceAmountUsdc = useMemo<bigint | undefined>(() => {
    if (!session) return undefined;
    try {
      return BigInt(session.source_amount);
    } catch {
      return undefined;
    }
  }, [session]);

  async function handleRecover() {
    if (!session?.burn_tx_hash) {
      setError("Session is missing the burn tx hash.");
      setPhase("error");
      return;
    }
    if (!recipientValid) {
      setError("Enter a valid Arbitrum address.");
      setPhase("error");
      return;
    }

    setError(null);
    setReceiveOpHash(null);
    setSweepOpHash(null);
    setSweepTxHash(null);
    setRecoveredAmount(null);
    setPhase("attestation");

    try {
      const { privateKey } = await api.getSwapDepositorKey(swapId);
      const ownerHex = (
        privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
      ) as Hex;

      const account = privateKeyToAccount(ownerHex);
      const walletClient = createWalletClient({
        account,
        chain: arbitrum,
        transport: http(),
      });
      const signer = buildEvmSigner(walletClient, arbitrum);

      const bundlerUrl = import.meta.env.VITE_AA_BUNDLER_URL as
        | string
        | undefined;
      const paymasterPolicyId = import.meta.env.VITE_AA_POLICY_ID as
        | string
        | undefined;
      if (!bundlerUrl || !paymasterPolicyId) {
        throw new Error(
          "Missing VITE_AA_BUNDLER_URL or VITE_AA_POLICY_ID. Configure your frontend env.",
        );
      }

      const result = await recoverCctpInbound(
        { aa: { bundlerUrl, paymasterPolicyId } },
        {
          signer,
          burnTxHash: session.burn_tx_hash as Hex,
          sourceChain: session.source_chain as CctpChainName,
          recipient: recipient.trim() as Address,
          onProgress: (step: RecoveryProgress) => {
            switch (step.phase) {
              case "attestation":
                setPhase("attestation");
                break;
              case "receiving":
                setReceiveOpHash(step.userOpHash);
                setPhase("receiving");
                break;
              case "sweeping":
                setSweepOpHash(step.userOpHash);
                setRecoveredAmount(step.amount);
                setPhase("sweeping");
                break;
              case "done":
                if (step.sweepTxHash) setSweepTxHash(step.sweepTxHash);
                setRecoveredAmount(step.recoveredAmount);
                setPhase("done");
                break;
            }
          },
        },
      );
      setReceiveOpHash(result.receiveUserOpHash ?? null);
      setSweepOpHash(result.sweepUserOpHash);
      setSweepTxHash(result.sweepTxHash ?? null);
      setRecoveredAmount(result.recoveredAmount);
      setPhase("done");
    } catch (e) {
      console.error("CCTP recovery failed:", e);
      setError(String(e instanceof Error ? e.message : e));
      setPhase("error");
    }
  }

  if (session === undefined) {
    return null;
  }

  if (!hasBurnTx) {
    return null;
  }

  const busy =
    phase === "attestation" || phase === "receiving" || phase === "sweeping";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
      <div className="border-b border-border/50 bg-muted/30 px-6 py-4">
        <h3 className="text-base font-semibold">Recover bridged USDC</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          You burned{" "}
          {sourceAmountUsdc ? `${formatUsdc(sourceAmountUsdc)} USDC ` : "USDC "}
          on {session?.source_chain} but the swap never completed. Sweep the
          minted USDC on Arbitrum to any address you control.
        </p>
      </div>

      <div className="space-y-4 p-6">
        <div className="space-y-2">
          <label htmlFor="recovery-recipient" className="text-sm font-medium">
            Recipient address (Arbitrum)
          </label>
          <input
            id="recovery-recipient"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="0x…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={busy || phase === "done"}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          {recipient && !recipientValid && (
            <p className="text-xs text-destructive">Not a valid EVM address.</p>
          )}
          {!connectedAddress && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={() => openConnectModal().catch(console.error)}
            >
              Connect wallet to pre-fill your address
            </button>
          )}
        </div>

        <ol className="space-y-2">
          <StepRow
            status={phaseToStatus(phase, "attestation", [
              "receiving",
              "sweeping",
              "done",
            ])}
            label="Fetch Circle attestation"
          />
          <StepRow
            status={phaseToStatus(phase, "receiving", ["sweeping", "done"])}
            label="Claim USDC on Arbitrum"
            txHash={receiveOpHash}
            chainId={arbitrum.id}
          />
          <StepRow
            status={phaseToStatus(phase, "sweeping", ["done"])}
            label={
              recoveredAmount
                ? `Transfer ${formatUsdc(recoveredAmount)} USDC to recipient`
                : "Transfer USDC to recipient"
            }
            txHash={sweepTxHash ?? sweepOpHash}
            chainId={arbitrum.id}
          />
        </ol>

        {phase === "done" && (
          <Alert>
            <Check className="h-4 w-4 text-green-500" />
            <AlertDescription>
              Recovered{" "}
              {recoveredAmount ? `${formatUsdc(recoveredAmount)} USDC` : "USDC"}{" "}
              to {recipient}.
            </AlertDescription>
          </Alert>
        )}

        {phase === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {phase !== "done" && (
          <Button
            className="w-full"
            disabled={!recipientValid || busy}
            onClick={handleRecover}
          >
            {busy ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Recovering…
              </>
            ) : phase === "error" ? (
              "Try again"
            ) : (
              "Recover funds"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function phaseToStatus(
  current: Phase,
  active: Phase,
  laterPhases: Phase[],
): "pending" | "active" | "completed" | "error" {
  if (current === "error") return active === "idle" ? "pending" : "pending";
  if (current === active) return "active";
  if (laterPhases.includes(current)) return "completed";
  return "pending";
}

function StepRow({
  status,
  label,
  txHash,
  chainId,
}: {
  status: "pending" | "active" | "completed" | "error";
  label: string;
  txHash?: string | null;
  chainId?: number;
}) {
  const Icon = () => {
    switch (status) {
      case "completed":
        return <Check className="h-4 w-4 text-green-500" />;
      case "active":
        return <Loader className="text-primary h-4 w-4 animate-spin" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return (
          <span className="inline-block h-4 w-4 rounded-full border border-muted-foreground/40" />
        );
    }
  };
  const explorerHref =
    txHash && chainId !== undefined
      ? getBlockexplorerTxLink(String(chainId), txHash)
      : null;
  const truncated =
    txHash && txHash.length > 20
      ? `${txHash.slice(0, 10)}…${txHash.slice(-6)}`
      : txHash;
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      <div className="flex items-center gap-2">
        <Icon />
        <span
          className={status === "pending" ? "text-muted-foreground" : undefined}
        >
          {label}
        </span>
      </div>
      {txHash && (
        <div className="ml-6 flex items-center gap-1 text-xs text-muted-foreground">
          {explorerHref ? (
            <a
              href={explorerHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1 font-mono hover:underline"
              title={txHash}
            >
              {truncated}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-mono" title={txHash}>
              {truncated}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
