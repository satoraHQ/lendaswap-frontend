/** Range USDC explorer URL for a CCTP source-chain burn tx. */
export function getRangeUsdcUrl(txHash: string): string {
  return `https://usdc.range.org/transactions?s=${txHash}`;
}
