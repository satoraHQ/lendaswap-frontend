/**
 * CCTP source-side bridging - rendered inside the wizard when the swap has
 * a local CCTP-inbound session (see `db.ts::CctpInboundSession`).
 *
 * Swap creation happens on HomePage before we navigate here. This component
 * picks up from the stored session and drives:
 *
 *   1. switch_chain  - wagmi switches the user's wallet to the source chain.
 *   2. approving     - USDC.approve(TokenMessenger, max) if needed.
 *   3. burn          - wallet signs depositForBurn on the source chain.
 *                       mintRecipient + destinationCaller = smart account
 *                       (so only the user's Kernel account can claim).
 *   4. burn_pending  - wait for source-chain receipt.
 *   5. attestation   - poll Circle's IRIS until the message is complete.
 *   6. submitting    - smart account sends a UserOperation via the bundler
 *                       containing receiveMessage + USDC.approve(Permit2) +
 *                       executeAndCreateWithPermit2. Paymaster sponsors gas.
 *   7. done          - mark session done; wizard re-renders and the
 *                       standard flow takes over (HTLCCreated event has
 *                       fired so status ≥ clientfundingseen).
 */

import {
  CCTP_DOMAINS,
  computeCctpFastFee,
  type EvmToArkadeSwapResponse,
  type EvmToBitcoinSwapResponse,
  type EvmToLightningSwapResponse,
  encodeDepositForBurn,
  fetchAttestation,
  fetchCctpFee,
  finalityForChainId,
  getCctpViemChainByName,
  MESSAGE_TRANSMITTER_V2,
  simulateBatchCalls,
  TOKEN_MESSENGER_V2,
  type TokenInfo,
  USDC_ADDRESSES,
} from "@lendasat/lendaswap-sdk-pure";
import { useAppKit } from "@reown/appkit/react";
import {
  AlertCircle,
  Check,
  Circle,
  Copy,
  ExternalLink,
  Info,
  Loader,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  erc20Abi,
  http,
  maxUint256,
  type Chain as ViemChain,
} from "viem";
import { arbitrum } from "viem/chains";
import {
  useAccount,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWalletClient,
} from "wagmi";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import {
  addressToBytes32Hex,
  buildCctpInboundBatch,
  type UseropCalldataResponse,
} from "../../aa/buildCctpInboundUserOp";
import { createSwapSmartAccountClient } from "../../aa/useSmartAccount";
import { api } from "../../api";
import {
  type CctpInboundSession,
  getCctpInboundSession,
  upsertCctpInboundSession,
} from "../../db";
import { getBlockexplorerTxLink } from "../../utils/tokenUtils";
import { useWalletBridge } from "../../WalletBridgeContext";
import { DepositCard } from "../components";

/** `MessageTransmitterV2.usedNonces(bytes32)` — returns 0 iff unused. */
const USED_NONCES_ABI = [
  {
    type: "function",
    name: "usedNonces",
    stateMutability: "view",
    inputs: [{ name: "nonce", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Extract the 32-byte CCTP nonce from a raw IRIS message. Per CCTPv2's
 * MessageV2 layout the nonce sits at byte offset 12; hex offsets include the
 * "0x" prefix and 2 chars/byte, so it lives at chars [26, 90).
 */
function extractCctpNonce(message: string): `0x${string}` {
  return `0x${message.slice(26, 26 + 64)}` as `0x${string}`;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Format a USDC amount in smallest units (6 decimals) for display. */
function formatUsdc(amount: bigint): string {
  return (Number(amount) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

type Phase =
  | "loading_session"
  | "switch_chain"
  | "approving"
  | "burn"
  | "burn_pending"
  | "attestation"
  | "submitting"
  | "done"
  | "error";

interface StepState {
  status: "pending" | "active" | "completed" | "error";
}

interface BridgingCctpStepProps {
  swapId: string;
  swapData:
    | EvmToArkadeSwapResponse
    | EvmToBitcoinSwapResponse
    | EvmToLightningSwapResponse;
}

export function BridgingCctpStep({ swapId, swapData }: BridgingCctpStepProps) {
  const { address: walletAddress, chainId: currentChainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { open: openConnectModal } = useAppKit();
  const { isEmbedded } = useWalletBridge();

  const [session, setSession] = useState<CctpInboundSession | null>(null);
  const [phase, setPhase] = useState<Phase>("loading_session");
  const [error, setError] = useState<string | null>(null);
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | null>(
    null,
  );
  const [burnTxHash, setBurnTxHash] = useState<`0x${string}` | null>(null);
  const [userOpTxHash, setUserOpTxHash] = useState<string | null>(null);
  const [attestationProgress, setAttestationProgress] = useState<string>("");
  /**
   * The Kernel smart-account address - derived once on session load
   * and rendered in the UI before the wallet prompt, so the user sees
   * the address *before* Rabby/MetaMask flag it as "not your address."
   */
  const [smartAccountAddress, setSmartAccountAddress] = useState<
    `0x${string}` | null
  >(null);
  const [smartAccountCopied, setSmartAccountCopied] = useState(false);

  const sourceChainName = session?.source_chain ?? "";
  // Cast: SDK's bundled viem and the frontend's viem are different instances
  // (separate node_modules), so their `Chain` types are nominally distinct
  // even though structurally identical. Safe - same chain definitions.
  const sourceChainViem = getCctpViemChainByName(sourceChainName) as
    | ViemChain
    | undefined;
  const sourceDomain = session?.source_domain;

  const sourceAmountUsdc = useMemo<bigint | undefined>(() => {
    if (!session) return undefined;
    try {
      return BigInt(session.source_amount);
    } catch {
      return undefined;
    }
  }, [session]);

  const sourceAmountHuman = useMemo(() => {
    if (!sourceAmountUsdc) return "";
    return formatUsdc(sourceAmountUsdc);
  }, [sourceAmountUsdc]);

  // Synthesize a source TokenInfo so the `DepositCard` header renders
  // the user's actual source chain + USDC. `swapData.source_token` points
  // at the post-CCTP-remap Arbitrum USDC, which would render as Arbitrum
  // → BTC and hide the fact that the burn happens on the user's chain.
  const sourceToken: TokenInfo | null = useMemo(() => {
    if (!sourceChainViem || !sourceChainName) return null;
    const usdc = USDC_ADDRESSES[sourceChainName];
    if (!usdc) return null;
    return {
      chain: sourceChainViem.id.toString(),
      token_id: usdc,
      symbol: "USDC",
      name: "USDC",
      decimals: 6,
    } as unknown as TokenInfo;
  }, [sourceChainViem, sourceChainName]);

  // Watch the burn tx receipt (burn_pending → attestation transition).
  const { data: burnReceipt } = useWaitForTransactionReceipt({
    hash: burnTxHash ?? undefined,
    chainId: sourceChainViem?.id,
  });

  // ── Load session on mount / resume from persisted phase ──────────────
  useEffect(() => {
    let unmounted = false;
    getCctpInboundSession(swapId)
      .then((s) => {
        if (unmounted) return;
        if (!s) {
          setError("No CCTP session found for this swap.");
          setPhase("error");
          return;
        }
        setSession(s);
        if (s.burn_tx_hash) {
          setBurnTxHash(s.burn_tx_hash as `0x${string}`);
          setPhase("attestation");
        } else {
          setPhase("switch_chain");
        }
      })
      .catch((e) => {
        if (unmounted) return;
        setError(`Failed to load session: ${String(e)}`);
        setPhase("error");
      });
    return () => {
      unmounted = true;
    };
  }, [swapId]);

  // ── Open wallet connect on mount if needed ──────────────────────────
  useEffect(() => {
    if (!walletAddress && !isEmbedded) {
      openConnectModal().catch(console.error);
    }
  }, [walletAddress, openConnectModal, isEmbedded]);

  // ── Derive smart-account address early so we can show it in the UI ──
  //
  // Wallets (Rabby/MetaMask) warn "recipient is not your current address"
  // when we burn USDC with mintRecipient pinned to the Kernel smart
  // account - which IS deterministic from the user's key but isn't their
  // EOA. Displaying the address up-front with an explanation lets the
  // user recognise it when the wallet popup lands, rather than being
  // surprised by the risk alert.
  useEffect(() => {
    if (!session || smartAccountAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const { privateKey } = await api.getSwapDepositorKey(swapId);
        const ownerHex = (
          privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
        ) as `0x${string}`;
        const { accountAddress } = await createSwapSmartAccountClient({
          ownerPrivateKey: ownerHex,
        });
        if (!cancelled) setSmartAccountAddress(accountAddress);
      } catch (e) {
        console.warn("Failed to derive smart-account address for UI:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, smartAccountAddress, swapId]);

  // ── Phase transition: burn_pending → attestation when receipt mined ──
  const lastTxHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (!burnReceipt) return;
    if (lastTxHashRef.current === burnReceipt.transactionHash) return;
    lastTxHashRef.current = burnReceipt.transactionHash;
    if (phase === "burn_pending") setPhase("attestation");
  }, [burnReceipt, phase]);

  // Cancellation tied to component lifetime so the async chain can survive
  // `setPhase(...)` calls mid-flow without re-entering and self-cancelling.
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // ── Phase transition: attestation → submitting → done ────────────────
  //
  // Fetches the IRIS attestation, builds the smart-account batch
  // (receiveMessage + USDC.approve(Permit2) + executeAndCreateWithPermit2),
  // and sends the UserOperation via the configured bundler. Paymaster
  // covers the Arbitrum gas.
  const attestationFiredRef = useRef(false);
  useEffect(() => {
    if (phase !== "attestation" || !burnTxHash || !sourceChainName) return;
    if (sourceDomain === undefined) return;
    if (attestationFiredRef.current) return;
    attestationFiredRef.current = true;

    (async () => {
      try {
        setAttestationProgress("Waiting for Circle attestation…");
        const { message, attestation } = await fetchAttestation({
          sourceChain: sourceChainName as keyof typeof CCTP_DOMAINS,
          txHash: burnTxHash,
          pollIntervalMs: 5_000,
          timeoutMs: 30 * 60 * 1000,
        });
        if (unmountedRef.current) return;

        setAttestationProgress("Attestation ready, preparing UserOp…");
        setPhase("submitting");

        // Fetch AA-flavoured calldata + derive the smart-account client once;
        // both are deterministic across retries.
        const server = (await api.getSwapAndLockUseropCalldata(
          swapId,
        )) as UseropCalldataResponse;
        const { privateKey: ownerKey } = await api.getSwapDepositorKey(swapId);
        const ownerHex = (
          ownerKey.startsWith("0x") ? ownerKey : `0x${ownerKey}`
        ) as `0x${string}`;
        const {
          client: aaClient,
          account: smartAccount,
          accountAddress,
        } = await createSwapSmartAccountClient({
          ownerPrivateKey: ownerHex,
        });

        // Alchemy RPC (same URL as the bundler) — the public Arbitrum node
        // strips the revert data the per-call pre-flight needs.
        const alchemyUrl = import.meta.env.VITE_AA_BUNDLER_URL as
          | string
          | undefined;
        const arbPublicClient = createPublicClient({
          chain: arbitrum,
          transport: http(alchemyUrl),
        });

        // `MessageTransmitter.usedNonces(nonce)` is the authoritative "did this
        // burn already mint?" signal: receiveMessage is restricted to our smart
        // account (destinationCaller) and only ever runs inside the atomic
        // settlement batch, so a consumed nonce means the whole batch (mint +
        // HTLC create) already committed — even if we failed to observe its
        // receipt.
        const nonce = extractCctpNonce(message as string);
        const isNonceUsed = async (): Promise<boolean> =>
          ((await arbPublicClient.readContract({
            address: MESSAGE_TRANSMITTER_V2 as `0x${string}`,
            abi: USED_NONCES_ABI,
            functionName: "usedNonces",
            args: [nonce],
          })) as bigint) !== 0n;

        // Bounded auto-retry. Transient bundler / paymaster / RPC failures used
        // to drop straight to the error screen with no retry, leaving the
        // bridged USDC stranded mid-flow until the user manually retried. Each
        // attempt is idempotent — the batch is atomic and receiveMessage is
        // nonce-gated — so re-submitting is safe; the nonce check converges to
        // "done" once any attempt actually lands.
        //
        // NOTE on pre-flight: viem's `estimateUserOperationGas` calls
        // `prepareUserOperation` without `'gas'`, so it skips bundler gas
        // estimation and calls `pm_getPaymasterData` with all-zero gas fields,
        // which Alchemy's paymaster rejects. `sendUserOperation` includes
        // `'gas'` and estimates before the paymaster call, so it works — we
        // rely on it (not the informational per-call pre-flight) as the
        // authoritative submission check.
        const MAX_ATTEMPTS = 4;
        for (let attempt = 1; ; attempt++) {
          // A prior attempt may have landed even though we never saw the
          // receipt (bundler/RPC timeout). If so, we're already done.
          if (await isNonceUsed()) break;
          if (unmountedRef.current) return;

          try {
            // The nonce guard above guarantees the mint hasn't landed yet, so
            // always include receiveMessage. (The previous heuristic — skip when
            // smart-account USDC balance ≥ amount — was unsafe, mirroring a bug
            // the SDK already fixed: residual/dust USDC at the account, or a
            // stale RPC read, could wrongly skip the mint and strand this burn
            // while the HTLC was funded from the residual. usedNonces is the
            // authoritative signal.)
            //
            // Permit2 signature is produced via the Kernel account's
            // signTypedData so Permit2's ERC-1271 check passes once the account
            // is deployed by the UserOp's factoryData.
            const { calls } = await buildCctpInboundBatch({
              server,
              smartAccountAddress: accountAddress,
              signTypedData: (args) => smartAccount.signTypedData(args),
              cctpMessage: message as `0x${string}`,
              cctpAttestation: attestation as `0x${string}`,
              chainId: arbitrum.id,
              skipReceiveMessage: false,
            });

            // Informational per-call pre-flight; call 3 typically reverts here
            // (Permit2 sees no code at the not-yet-deployed account). The
            // bundler's full simulation at sendUserOperation is authoritative.
            await simulateBatchCalls({
              calls,
              smartAccount: accountAddress,
              publicClient: arbPublicClient,
            });

            const userOpHash = await aaClient.sendUserOperation({ calls });
            if (unmountedRef.current) return;
            setUserOpTxHash(userOpHash);

            const receipt = await aaClient.waitForUserOperationReceipt({
              hash: userOpHash,
            });
            if (unmountedRef.current) return;
            if (receipt.receipt?.transactionHash) {
              setUserOpTxHash(receipt.receipt.transactionHash);
            }

            // A UserOp can be included on-chain yet revert during execution —
            // waitForUserOperationReceipt resolves with success=false rather
            // than throwing. The batch is atomic, so a reverted attempt applied
            // nothing; route it through the retry path below.
            if (!receipt.success) {
              throw new Error(
                `Settlement UserOp reverted on-chain${
                  receipt.reason ? `: ${receipt.reason}` : ""
                }`,
              );
            }

            break; // settled
          } catch (submitErr) {
            if (unmountedRef.current) return;
            // The UserOp may have landed despite the error we observed. If the
            // nonce is now consumed, the settlement committed — we're done.
            if (await isNonceUsed()) break;
            if (attempt >= MAX_ATTEMPTS) throw submitErr;

            const backoffMs = 3_000 * 2 ** (attempt - 1);
            console.warn(
              `CCTP settlement attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${
                backoffMs / 1000
              }s`,
              submitErr,
            );
            setAttestationProgress(
              `Settlement attempt ${attempt} failed — retrying in ${
                backoffMs / 1000
              }s…`,
            );
            await sleep(backoffMs);
            if (unmountedRef.current) return;
          }
        }

        setPhase("done");
        if (session) {
          await upsertCctpInboundSession({
            ...session,
            phase: "done",
          }).catch(console.warn);
        }
      } catch (e) {
        if (unmountedRef.current) return;
        console.error("CCTP attestation/submit error:", e);
        setError(`Attestation / submit failed: ${String(e)}`);
        setPhase("error");
        attestationFiredRef.current = false;
      }
    })();
  }, [phase, burnTxHash, sourceChainName, swapId, sourceDomain, session]);

  // ── Action: submit approve + burn on source chain ────────────────────
  const runningRef = useRef(false);
  const runSourceFlow = useCallback(async () => {
    if (runningRef.current) return;
    if (!session) return;
    if (!walletClient || !walletAddress) {
      openConnectModal().catch(console.error);
      return;
    }
    if (!sourceChainViem || sourceDomain === undefined || !sourceAmountUsdc) {
      setError("CCTP session is missing required fields.");
      setPhase("error");
      return;
    }
    runningRef.current = true;

    try {
      // 1. Switch chain if not already there.
      if (currentChainId !== sourceChainViem.id) {
        setPhase("switch_chain");
        await switchChainAsync({ chainId: sourceChainViem.id });
      }

      // 2. Derive the user's Kernel smart-account address on Arbitrum.
      //    That address is both the CCTP mintRecipient AND the
      //    destinationCaller - ensuring only the smart account can
      //    call receiveMessage later inside the UserOp batch.
      const { privateKey: ownerKey } = await api.getSwapDepositorKey(swapId);
      const ownerHex = (
        ownerKey.startsWith("0x") ? ownerKey : `0x${ownerKey}`
      ) as `0x${string}`;
      const { accountAddress } = await createSwapSmartAccountClient({
        ownerPrivateKey: ownerHex,
      });

      // 3. Fetch the CCTP fee for maxFee on burn. Sources without Fast
      //    Transfer (e.g. XDC) burn at Standard finality, so query and
      //    burn at the matching threshold — fast finality there charges
      //    the wrong tier and never attests at 1000.
      const minFinalityThreshold = finalityForChainId(sourceChainViem.id);
      const feeEntry = await fetchCctpFee({
        sourceDomain,
        destinationDomain: CCTP_DOMAINS.Arbitrum,
        finalityThreshold: minFinalityThreshold,
      });
      const cctpFee = computeCctpFastFee(feeEntry, sourceAmountUsdc);

      // 4. Source USDC address from the SDK's table.
      const sourceUsdc = USDC_ADDRESSES[sourceChainName];
      if (!sourceUsdc) {
        throw new Error(`No USDC address for ${sourceChainName}`);
      }

      // 5. Approve USDC for TokenMessenger if needed.
      const publicClient = createPublicClient({
        chain: sourceChainViem,
        transport: http(),
      });
      const allowance = (await publicClient.readContract({
        address: sourceUsdc as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [walletAddress, TOKEN_MESSENGER_V2 as `0x${string}`],
      })) as bigint;

      if (allowance < sourceAmountUsdc) {
        setPhase("approving");
        const approveHash = await walletClient.writeContract({
          address: sourceUsdc as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [TOKEN_MESSENGER_V2 as `0x${string}`, maxUint256],
          chain: sourceChainViem,
        });
        setApproveTxHash(approveHash);
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // 6. Build + sign the burn with destinationCaller pinned to the
      //    smart account so only it can redeem the attestation.
      setPhase("burn");
      const burnCalldata = encodeDepositForBurn({
        amount: sourceAmountUsdc,
        destinationDomain: CCTP_DOMAINS.Arbitrum,
        mintRecipient: accountAddress,
        burnToken: sourceUsdc,
        destinationCaller: addressToBytes32Hex(accountAddress),
        maxFee: cctpFee,
        minFinalityThreshold,
      });
      const txHash = await walletClient.sendTransaction({
        to: TOKEN_MESSENGER_V2 as `0x${string}`,
        data: burnCalldata as `0x${string}`,
        chain: sourceChainViem,
      });

      setBurnTxHash(txHash);
      setPhase("burn_pending");
      await upsertCctpInboundSession({
        ...session,
        burn_tx_hash: txHash,
        phase: "burn_signed",
      });
    } catch (e) {
      console.error("CCTP source-side flow error:", e);
      setError(String(e));
      setPhase("error");
    } finally {
      runningRef.current = false;
    }
  }, [
    session,
    walletClient,
    walletAddress,
    openConnectModal,
    sourceChainViem,
    sourceDomain,
    sourceAmountUsdc,
    sourceChainName,
    currentChainId,
    switchChainAsync,
    swapId,
  ]);

  // Auto-kick the flow whenever we reach switch_chain with everything ready.
  useEffect(() => {
    if (phase !== "switch_chain") return;
    if (!session || !walletAddress || !walletClient) return;
    runSourceFlow();
  }, [phase, session, walletAddress, walletClient, runSourceFlow]);

  const stepStatuses: Record<string, StepState> = useMemo(() => {
    const isError = phase === "error";
    const view = (active: Phase, completed: Phase[]): StepState => {
      if (isError && phase === active) return { status: "error" };
      if (completed.includes(phase)) return { status: "completed" };
      if (phase === active) return { status: "active" };
      return { status: "pending" };
    };
    return {
      switchChain: view("switch_chain", [
        "approving",
        "burn",
        "burn_pending",
        "attestation",
        "submitting",
        "done",
      ]),
      approve: view("approving", [
        "burn",
        "burn_pending",
        "attestation",
        "submitting",
        "done",
      ]),
      burn: {
        ...view("burn", ["attestation", "submitting", "done"]),
        ...(phase === "burn_pending" ? { status: "active" as const } : {}),
      },
      attestation: view("attestation", ["submitting", "done"]),
      submit: view("submitting", ["done"]),
    };
  }, [phase]);

  if (phase === "loading_session") {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <DepositCard
      sourceToken={sourceToken ?? swapData.source_token}
      targetToken={swapData.target_token}
      swapId={swapId}
      title={`${sourceAmountHuman} USDC on ${sourceChainName} → ${swapData.target_token.symbol}`}
    >
      <ol className="space-y-2">
        <StepRow
          status={stepStatuses.switchChain.status}
          label={`Switch wallet to ${sourceChainName}`}
        />
        <StepRow
          status={stepStatuses.approve.status}
          label={`Approve USDC on ${sourceChainName}`}
          txHash={approveTxHash}
          chainId={sourceChainViem?.id}
        />
        <StepRow
          status={stepStatuses.burn.status}
          label={`Sign burn on ${sourceChainName}`}
          txHash={burnTxHash}
          chainId={sourceChainViem?.id}
        />
        {smartAccountAddress && phase === "burn" && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>
                USDC will first land in your{" "}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        dedicated smart account
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        A contract wallet deterministically derived from your
                        signing key. Controlled by the same wallet you&apos;re
                        using now - any signature you give, Satora can&apos;t
                        move funds without it. Your wallet may flag this as
                        &quot;not your address&quot;; that&apos;s expected.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                , then locked in the HTLC.
              </p>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-muted-foreground">Recipient:</span>
                <code className="bg-muted truncate rounded px-1.5 py-0.5">
                  {smartAccountAddress}
                </code>
                <button
                  type="button"
                  aria-label="Copy smart account address"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(smartAccountAddress)
                      .then(() => {
                        setSmartAccountCopied(true);
                        setTimeout(() => setSmartAccountCopied(false), 1500);
                      })
                      .catch(console.warn);
                  }}
                >
                  {smartAccountCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <StepRow
          status={stepStatuses.attestation.status}
          label={attestationProgress || "Wait for Circle attestation"}
        />
        <StepRow
          status={stepStatuses.submit.status}
          label="Submit on Arbitrum (UserOp: mint + permit + HTLC create)"
          txHash={userOpTxHash}
          chainId={arbitrum.id}
        />
      </ol>

      {phase === "error" && (
        <div className="space-y-2">
          <p className="text-destructive text-sm">{error}</p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setError(null);
              setPhase(burnTxHash ? "attestation" : "switch_chain");
              attestationFiredRef.current = false;
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {phase === "done" && (
        <p className="text-sm">
          Bridging complete - waiting for on-chain HTLC…
        </p>
      )}

      {!walletAddress && !isEmbedded && (
        <Button
          variant="secondary"
          onClick={() => openConnectModal()}
          className="w-full"
        >
          Connect wallet
        </Button>
      )}
    </DepositCard>
  );
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
        return <Circle className="text-muted-foreground/40 h-4 w-4" />;
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
