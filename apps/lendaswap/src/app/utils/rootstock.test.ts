import { describe, expect, it } from "vitest";
import { parseRpcOverrides } from "./evmTransport";
import {
  displayDecimals,
  formatTokenUrl,
  getBlockexplorerTxLink,
  getViemChainById,
  parseUrlToken,
} from "./tokenUtils";

/** RBTC as the server reports it on `/tokens`. */
const rbtc = {
  token_id: "0x0000000000000000000000000000000000000000",
  symbol: "RBTC",
  chain: "30" as const,
  name: "Rootstock Smart Bitcoin",
  decimals: 18,
};

describe("Rootstock in the frontend", () => {
  it("round-trips the token URL", () => {
    expect(formatTokenUrl(rbtc)).toBe("30:RBTC");
    expect(parseUrlToken("30:RBTC")).toEqual({ chain: "30", symbol: "RBTC" });
    expect(parseUrlToken("rootstock:RBTC")).toEqual({
      chain: "30",
      symbol: "RBTC",
    });
  });

  it("shows RBTC at bitcoin precision despite 18 on-chain decimals", () => {
    expect(displayDecimals(rbtc)).toBe(8);
    expect(displayDecimals({ chain: "30", symbol: "USDT", decimals: 6 })).toBe(
      6,
    );
  });

  it("links to the Rootstock explorer and knows the viem chain", () => {
    expect(getBlockexplorerTxLink("30", "0xabc")).toBe(
      "https://rootstock.blockscout.com/tx/0xabc",
    );
    expect(getViemChainById(30)?.id).toBe(30);
  });

  it("knows the testnet id a mutinynet daemon reports Rootstock as", () => {
    expect(parseUrlToken("31:RBTC")).toEqual({ chain: "31", symbol: "RBTC" });
    expect(displayDecimals({ ...rbtc, chain: "31" })).toBe(8);
    expect(getBlockexplorerTxLink("31", "0xabc")).toBe(
      "https://rootstock-testnet.blockscout.com/tx/0xabc",
    );
    expect(getViemChainById(31)?.id).toBe(31);
  });
});

describe("parseRpcOverrides", () => {
  it("reads the single pair and the list, the list winning", () => {
    expect(
      parseRpcOverrides({
        VITE_RPC_OVERRIDE_CHAIN_ID: " 137 ",
        VITE_RPC_OVERRIDE_URL: "http://localhost:8545",
        VITE_RPC_OVERRIDES:
          "30=http://localhost:8547, 137=http://localhost:9545,broken,=x,42=",
      }),
    ).toEqual({ 137: "http://localhost:9545", 30: "http://localhost:8547" });
  });

  it("is empty without any override", () => {
    expect(parseRpcOverrides({})).toEqual({});
  });
});
