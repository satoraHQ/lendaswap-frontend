import { useAppKit } from "@reown/appkit/react";
import { isUserRejection } from "@satora/swap";
import { Loader2, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Address, BaseError, erc20Abi, type PublicClient } from "viem";
import {
  useAccount,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Button } from "#/components/ui/button";
import { getBlockexplorerTxLink } from "../../utils/tokenUtils";
import { remainingDepositAmount } from "../../utils/walletDeposit";

export function WalletDepositButton({
  swapId,
  chainId,
  chainName,
  token,
  recipient,
  amount,
  deadline,
  disabled,
  client,
}: {
  swapId: string;
  chainId: number;
  chainName: string;
  token: Address;
  recipient: Address;
  amount: bigint;
  deadline: number;
  disabled: boolean;
  client: PublicClient;
}) {
  const { open } = useAppKit();
  const { address, chainId: connectedChainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const storageKey = `satora-pay-deposit:${chainId}:${swapId}`;
  const [hash, setHash] = useState<`0x${string}` | undefined>(() => {
    const saved = sessionStorage.getItem(storageKey);
    return saved && /^0x[0-9a-f]{64}$/i.test(saved)
      ? (saved as `0x${string}`)
      : undefined;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const active = useRef(true);
  const latestDisabled = useRef(disabled);
  latestDisabled.current = disabled;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const { data: receipt } = useWaitForTransactionReceipt({
    hash,
    chainId,
    onReplaced: ({ reason, transaction }) => {
      if (reason === "repriced") {
        setHash(transaction.hash);
        sessionStorage.setItem(storageKey, transaction.hash);
      } else {
        sessionStorage.removeItem(storageKey);
        setHash(undefined);
        setError(
          "The wallet cancelled or replaced this transfer. Check its status before trying again; any received deposit is deducted automatically.",
        );
      }
    },
  });
  useEffect(() => {
    if (receipt?.status === "reverted") {
      sessionStorage.removeItem(storageKey);
      setHash(undefined);
      setError(
        "The token transfer reverted. No tokens were sent. You can try again.",
      );
    }
  }, [receipt, storageKey]);

  async function pay() {
    if (inFlight.current || hash || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!isConnected || !address) {
        await open({ view: "Connect" });
        return;
      }
      if (connectedChainId !== chainId) {
        await switchChainAsync({ chainId });
        return;
      }
      // Recheck the deposit immediately before sending: manual funding may have arrived.
      const balance = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [recipient],
      });
      const remaining = remainingDepositAmount(amount, balance, deadline);
      if (remaining === 0n) return;
      if (
        !active.current ||
        latestDisabled.current ||
        (deadline > 0 && Date.now() >= deadline * 1000)
      )
        throw new Error("This payment is no longer awaiting a deposit.");
      const sent = await writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipient, remaining],
        chainId,
        account: address,
      });
      // Keep submitted transfers disabled across refreshes to prevent duplicate deposits.
      setHash(sent);
      sessionStorage.setItem(storageKey, sent);
    } catch (err) {
      setError(
        isUserRejection(err)
          ? "Wallet request cancelled. You can try again."
          : err instanceof BaseError
            ? err.shortMessage
            : err instanceof Error
              ? err.message
              : "Could not send the token transfer.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="rounded-full"
        disabled={disabled || busy || !!hash}
        onClick={pay}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Wallet className="mr-2 h-4 w-4" />
        )}
        {hash
          ? "Transfer submitted"
          : busy
            ? "Check your wallet…"
            : isConnected && connectedChainId !== chainId
              ? `Switch to ${chainName}`
              : "Pay with wallet"}
      </Button>
      {hash && (
        <p role="status" className="text-xs text-muted-foreground">
          {receipt?.status === "success"
            ? "Transfer confirmed. Your payment continues automatically."
            : "Transfer submitted. Waiting for confirmation—do not send again."}{" "}
          <a
            href={getBlockexplorerTxLink(String(chainId), hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        </p>
      )}
      {error && (
        <p role="alert" className="break-words text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
