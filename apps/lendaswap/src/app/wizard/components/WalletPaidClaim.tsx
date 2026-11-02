import { useAppKit } from "@reown/appkit/react";
import type { GetSwapResponse } from "@satora/swap";
import { useState } from "react";
import type { Account, Chain, Transport, WalletClient } from "viem";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { Button } from "#/components/ui/button";
import { api } from "../../api";
import { buildEvmSigner } from "../../utils/evmSigner";
import { getViemChain } from "../../utils/tokenUtils";

export function WalletPaidClaim({
  swapData,
  swapId,
  onSubmitted,
}: {
  swapData: GetSwapResponse;
  swapId: string;
  onSubmitted: (hash: string) => void;
}) {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { open } = useAppKit();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const chain = getViemChain(
    String(
      (swapData as { evm_chain_id?: number }).evm_chain_id ??
        swapData.target_token.chain,
    ) as GetSwapResponse["target_token"]["chain"],
  );

  const claim = async () => {
    if (!address || !walletClient) {
      await open();
      return;
    }
    if (!chain) {
      setError("Unsupported claim chain");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      if (chainId !== chain.id) {
        await switchChainAsync({ chainId: chain.id });
        return; // Wait for wagmi to supply the wallet client on the selected chain.
      }
      const signer = buildEvmSigner(
        walletClient as WalletClient<Transport, Chain, Account>,
        chain,
      );
      const result = await api.claim(swapId, { signer });
      if (!result.success) throw new Error(result.message);
      if (result.txHash) onSubmitted(result.txHash);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Claim from your payout wallet. You pay the network gas fee.
      </p>
      <Button onClick={claim} disabled={pending || submitted}>
        {submitted
          ? "Claim submitted"
          : pending
            ? "Claiming…"
            : !address
              ? "Connect wallet to claim"
              : chainId !== chain?.id
                ? "Switch network"
                : "Claim with wallet"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
