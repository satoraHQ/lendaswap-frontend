import type { EvmSigner } from "@satora/swap";
import {
  type Account,
  type Chain,
  createPublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { buildTransport } from "./evmTransport";

/**
 * Build an {@link EvmSigner} from a wagmi/viem `WalletClient`.
 *
 * Creates a dedicated `publicClient` for reads so we bypass the wallet
 * transport (which can return raw JSON-RPC envelopes instead of parsed values).
 */
export function buildEvmSigner(
  walletClient: WalletClient<Transport, Chain, Account>,
  chain: Chain,
): EvmSigner {
  const publicClient = createPublicClient({
    chain,
    transport: buildTransport(chain),
  });

  return {
    address: walletClient.account.address,
    chainId: chain.id,
    signTypedData: (td) =>
      walletClient.signTypedData({
        ...td,
        domain: {
          ...td.domain,
          verifyingContract: td.domain.verifyingContract as `0x${string}`,
        },
        account: walletClient.account,
      }),
    // Required for the CCTP-inbound flow - Kernel signs the UserOp
    // hash via personal_sign on the owner. Direct Permit2 swaps don't
    // reach this code path.
    signMessage: ({ raw }) =>
      walletClient.signMessage({
        account: walletClient.account,
        message: { raw: raw as `0x${string}` },
      }),
    // Required for the CCTP-inbound flow under EIP-7702 - signs the
    // authorization tuple that delegates this EOA to the Kernel
    // implementation on the first UserOp. viem's `signAuthorization`
    // handles the raw-digest (no EIP-191 prefix) signing internally.
    signAuthorization: async (auth) => {
      const signed = await walletClient.signAuthorization({
        account: walletClient.account,
        address: auth.contractAddress as `0x${string}`,
        chainId: auth.chainId,
        nonce: auth.nonce,
      });
      // viem types `yParity` as optional (its `Signature` is a OneOf
      // with a legacy `v`-only branch), but a freshly-signed 7702
      // authorization always carries it. Guard rather than coerce so
      // a genuinely-missing value surfaces loudly.
      if (signed.yParity === undefined) {
        throw new Error(
          "walletClient.signAuthorization returned no yParity — cannot build a 7702 authorization tuple",
        );
      }
      return {
        r: signed.r,
        s: signed.s,
        v: signed.v !== undefined ? Number(signed.v) : undefined,
        yParity: signed.yParity,
        chainId: signed.chainId,
        address: signed.address,
        nonce: signed.nonce,
      };
    },
    sendTransaction: (tx: { to: string; data: string; gas?: bigint }) =>
      walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        chain,
        gas: tx.gas,
      }),
    waitForReceipt: async (hash) => {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
      });
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        transactionHash: receipt.transactionHash,
      };
    },
    getTransaction: async (hash) => {
      const tx = await publicClient.getTransaction({
        hash: hash as `0x${string}`,
      });
      return { to: tx.to ?? null, input: tx.input, from: tx.from };
    },
    call: async (tx) => {
      const result = await publicClient.call({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        account: tx.from as `0x${string}` | undefined,
        blockNumber: tx.blockNumber,
      });
      return result.data ?? "0x";
    },
  };
}
