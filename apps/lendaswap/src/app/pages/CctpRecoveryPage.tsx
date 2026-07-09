/**
 * Standalone CCTP-inbound recovery page.
 *
 * Manual escape hatch for users whose local swap session is gone — e.g.
 * fresh device, cleared site data, or wallet recovered from mnemonic.
 * The user supplies the source chain + burn tx hash + recipient address;
 * we drive the SDK's `recoverCctpInbound` end-to-end:
 *
 *   1. fetch the IRIS attestation,
 *   2. submit a paymaster-sponsored `receiveMessage` UserOp (if needed),
 *   3. submit a paymaster-sponsored `USDC.transfer(recipient, balance)`.
 *
 * Owner key is the wallet-level BIP-44 EVM key (same one used as the
 * gasless-swap depositor / Kernel-account owner), exposed via the SDK's
 * `getEvmDepositorKey`. No swap id needed.
 */

import {
  type CctpChainName,
  CHAIN_ID_TO_CCTP_NAME,
  type RecoveryProgress,
  recoverCctpInbound,
} from "@satora/swap";
import { useAppKit } from "@reown/appkit/react";
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
import { api } from "../api";
import { buildEvmSigner } from "../utils/evmSigner";
import { getBlockexplorerTxLink } from "../utils/tokenUtils";

type Phase =
  | "idle"
  | "attestation"
  | "receiving"
  | "sweeping"
  | "done"
  | "error";

/**
 * Source chains we offer in the dropdown — every CCTP-supported chain
 * except Arbitrum (the settlement chain itself). The user could in
 * principle have burned from Arbitrum if we ever route Arbitrum→Arbitrum
 * via CCTP, but that's not a real flow today.
 */
const SOURCE_CHAIN_OPTIONS: CctpChainName[] = Object.values(
  CHAIN_ID_TO_CCTP_NAME,
).filter((name): name is CctpChainName => name !== "Arbitrum");

function formatUsdc(amount: bigint): string {
  return (Number(amount) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function isHex32(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function CctpRecoveryPage() {
  const { address: connectedAddress } = useAccount();
  const { open: openConnectModal } = useAppKit();

  useEffect(() => {
    document.title = "CCTP Recovery | Satora";
  }, []);

  const [sourceChain, setSourceChain] = useState<CctpChainName>("HyperEVM");
  const [burnTxHash, setBurnTxHash] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [receiveOpHash, setReceiveOpHash] = useState<Hex | null>(null);
  const [sweepOpHash, setSweepOpHash] = useState<Hex | null>(null);
  const [sweepTxHash, setSweepTxHash] = useState<Hex | null>(null);
  const [recoveredAmount, setRecoveredAmount] = useState<bigint | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(
    null,
  );

  // Show the wallet-level smart account address up-front so the user can
  // sanity-check that the burn's destinationCaller matches before clicking
  // recover. Cheap call, no signature.
  useEffect(() => {
    let cancelled = false;
    api
      .getEvmDepositorKey()
      .then(({ address }) => {
        if (!cancelled) setSmartAccountAddress(address);
      })
      .catch((e) => {
        console.warn("Failed to derive smart account address:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const burnTxValid = useMemo(() => isHex32(burnTxHash.trim()), [burnTxHash]);
  const recipientValid = useMemo(
    () => isAddress(recipient.trim()),
    [recipient],
  );
  const canSubmit = burnTxValid && recipientValid;

  async function handleRecover() {
    if (!burnTxValid || !recipientValid) return;

    setError(null);
    setReceiveOpHash(null);
    setSweepOpHash(null);
    setSweepTxHash(null);
    setRecoveredAmount(null);
    setPhase("attestation");

    try {
      const { privateKey } = await api.getEvmDepositorKey();
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
          burnTxHash: burnTxHash.trim() as Hex,
          sourceChain,
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

  const busy =
    phase === "attestation" || phase === "receiving" || phase === "sweeping";

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4">
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
        <div className="border-b border-border/50 bg-muted/30 px-6 py-4">
          <h2 className="text-lg font-semibold">CCTP recovery</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Manually claim USDC from a CCTP burn whose swap never completed, and
            forward it to any Arbitrum address.
          </p>
        </div>

        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <label
              htmlFor="recovery-source-chain"
              className="text-sm font-medium"
            >
              Source chain
            </label>
            <select
              id="recovery-source-chain"
              value={sourceChain}
              onChange={(e) => setSourceChain(e.target.value as CctpChainName)}
              disabled={busy || phase === "done"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {SOURCE_CHAIN_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="recovery-burn-tx" className="text-sm font-medium">
              Burn transaction hash
            </label>
            <input
              id="recovery-burn-tx"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="0x… (66 chars)"
              value={burnTxHash}
              onChange={(e) => setBurnTxHash(e.target.value)}
              disabled={busy || phase === "done"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            {burnTxHash && !burnTxValid && (
              <p className="text-xs text-destructive">
                Expected a 32-byte hex hash (0x-prefixed, 66 chars total).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="recovery-recipient"
                className="text-sm font-medium"
              >
                Recipient address (Arbitrum)
              </label>
              {connectedAddress ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy || phase === "done"}
                  onClick={() => setRecipient(connectedAddress)}
                >
                  Use connected wallet
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => openConnectModal().catch(console.error)}
                >
                  Connect wallet
                </button>
              )}
            </div>
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
              <p className="text-xs text-destructive">
                Not a valid EVM address.
              </p>
            )}
          </div>

          {smartAccountAddress && (
            <Alert>
              <AlertDescription className="space-y-1">
                <p className="text-xs">
                  Your CCTP destination address (must match the burn&apos;s
                  <code className="ml-1 rounded bg-muted px-1 font-mono text-[10px]">
                    destinationCaller
                  </code>
                  ):
                </p>
                <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                  {smartAccountAddress}
                </code>
              </AlertDescription>
            </Alert>
          )}

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
                {recoveredAmount
                  ? `${formatUsdc(recoveredAmount)} USDC`
                  : "USDC"}{" "}
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
              disabled={!canSubmit || busy}
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
    </div>
  );
}

function phaseToStatus(
  current: Phase,
  active: Phase,
  laterPhases: Phase[],
): "pending" | "active" | "completed" | "error" {
  if (current === "error") return "pending";
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
