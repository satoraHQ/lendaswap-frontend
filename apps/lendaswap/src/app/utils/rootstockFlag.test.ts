import type { TokenInfos } from "@satora/swap";
import { describe, expect, it } from "vitest";
import { withRootstockGate } from "./rootstockFlag";

const token = (chain: string, symbol: string) =>
  ({
    token_id: "0x0000000000000000000000000000000000000000",
    symbol,
    chain,
    name: symbol,
    decimals: 18,
  }) as TokenInfos["evm_tokens"][number];

const tokens = {
  btc_tokens: [],
  evm_tokens: [
    token("1", "USDC"),
    token("30", "RBTC"),
    token("31", "tRBTC"),
    token("42161", "USDT0"),
  ],
} as unknown as TokenInfos;

describe("withRootstockGate", () => {
  it("drops mainnet and testnet Rootstock tokens when disabled", () => {
    const gated = withRootstockGate(tokens, false);
    expect(gated.evm_tokens.map((t) => t.symbol)).toEqual(["USDC", "USDT0"]);
  });

  it("passes the list through untouched when enabled", () => {
    expect(withRootstockGate(tokens, true)).toBe(tokens);
  });
});
