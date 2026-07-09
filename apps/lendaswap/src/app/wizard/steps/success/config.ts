import {
  toChainName,
  USDC_ADDRESSES,
  USDT0_ADDRESSES,
} from "@satora/swap";
import type { GetSwapResponse } from "../../../api";
import { getTargetChainDisplayName } from "../../../utils/tokenUtils";

export interface DirectionConfig {
  sourceAmount: string;
  targetAmount: string;
  targetAddress?: string | null;
  isLightning: boolean;
  noAddressLink?: boolean;
  swapTxId?: string | null;
  tweetText: string;
}

export function formatAmount(
  amount: number | string,
  decimals: number,
): string {
  const value = Number(amount) / 10 ** decimals;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function getDirectionConfig(swapData: GetSwapResponse): DirectionConfig {
  const sourceSymbol = swapData.source_token.symbol;
  const targetSymbol = swapData.target_token.symbol;
  const swapDurationSeconds = swapData.created_at
    ? Math.floor((Date.now() - new Date(swapData.created_at).getTime()) / 1000)
    : null;

  const makeTweet = (sent: string, received: string) =>
    `Swapped ${sent} ${sourceSymbol} → ${received} ${targetSymbol} in ${swapDurationSeconds}s on @satoraswaps\n\nTrustless atomic swap via @arkade_os`;

  const sent = formatAmount(
    swapData.source_amount,
    swapData.source_token.decimals,
  );
  const received = formatAmount(
    swapData.target_amount,
    swapData.target_token.decimals,
  );

  switch (swapData.direction) {
    case "btc_to_arkade":
      return {
        sourceAmount: sent,
        targetAmount: received,
        targetAddress: swapData.target_arkade_address,
        isLightning: false,
        swapTxId: swapData.arkade_claim_txid,
        tweetText: makeTweet(sent, received),
      };
    case "bitcoin_to_evm":
      return {
        sourceAmount: sent,
        targetAmount: received,
        targetAddress:
          swapData.target_evm_address ?? swapData.client_evm_address,
        isLightning: false,
        swapTxId: swapData.evm_claim_txid,
        tweetText: makeTweet(sent, received),
      };
    case "arkade_to_evm": {
      const r = formatAmount(
        swapData.target_amount ?? 0,
        swapData.target_token.decimals,
      );
      return {
        sourceAmount: sent,
        targetAmount: r,
        targetAddress:
          swapData.target_evm_address ?? swapData.client_evm_address,
        isLightning: false,
        swapTxId: swapData.evm_claim_txid,
        tweetText: makeTweet(sent, r),
      };
    }
    case "evm_to_arkade":
      return {
        sourceAmount: sent,
        targetAmount: received,
        targetAddress: swapData.target_arkade_address,
        isLightning: false,
        swapTxId: swapData.btc_claim_txid,
        tweetText: makeTweet(sent, received),
      };
    case "evm_to_bitcoin":
      return {
        sourceAmount: sent,
        targetAmount: received,
        targetAddress: swapData.btc_htlc_address,
        isLightning: false,
        swapTxId: swapData.btc_claim_txid,
        tweetText: makeTweet(sent, received),
      };
    case "lightning_to_evm": {
      const s = formatAmount(
        swapData.source_amount,
        swapData.source_token.decimals,
      );
      const r = formatAmount(
        swapData.target_amount,
        swapData.target_token.decimals,
      );
      return {
        sourceAmount: s,
        targetAmount: r,
        targetAddress:
          swapData.target_evm_address ?? swapData.client_evm_address,
        isLightning: false,
        swapTxId: swapData.evm_claim_txid,
        tweetText: makeTweet(s, r),
      };
    }
    case "evm_to_lightning":
      return {
        sourceAmount: sent,
        targetAmount: received,
        targetAddress: swapData.client_lightning_invoice,
        isLightning: true,
        swapTxId: swapData.evm_claim_txid,
        tweetText: makeTweet(sent, received),
      };
    case "lightning_to_arkade":
      return {
        sourceAmount: sent,
        targetAmount: received,
        targetAddress: swapData.target_arkade_address,
        isLightning: false,
        swapTxId: swapData.arkade_claim_txid,
        tweetText: makeTweet(sent, received),
      };
    case "arkade_to_lightning":
      return {
        sourceAmount: sent,
        targetAmount: received,
        targetAddress: swapData.client_lightning_invoice,
        isLightning: true,
        noAddressLink: true,
        swapTxId: swapData.arkade_fund_txid,
        tweetText: makeTweet(sent, received),
      };
  }
}

export function getBridgeInfo(swapData: GetSwapResponse) {
  switch (swapData.direction) {
    case "arkade_to_evm":
    case "bitcoin_to_evm":
    case "lightning_to_evm":
      return {
        bridgeTargetChain: swapData.bridge_target_chain,
        claimTxHash: swapData.evm_claim_txid,
        sourceChainName: swapData.chain,
      };
    default:
      return {
        bridgeTargetChain: null,
        claimTxHash: null,
        sourceChainName: null,
      };
  }
}

export function getBridgeType(
  swapData: GetSwapResponse,
): "cctp" | "usdt0" | null {
  const info = getBridgeInfo(swapData);
  if (!info.bridgeTargetChain) return null;

  const tokenId = swapData.target_token.token_id.toLowerCase();
  if (
    Object.values(USDC_ADDRESSES).some((addr) => addr.toLowerCase() === tokenId)
  ) {
    return "cctp";
  }
  if (
    Object.values(USDT0_ADDRESSES).some(
      (addr) => addr.toLowerCase() === tokenId,
    )
  ) {
    return "usdt0";
  }
  return null;
}

export function getSwapDisplayInfo(swapData: GetSwapResponse) {
  return {
    sourceSymbol: swapData.source_token.symbol,
    targetSymbol: swapData.target_token.symbol,
    sourceNetwork: toChainName(swapData.source_token.chain),
    targetNetwork: getTargetChainDisplayName(swapData),
  };
}
