import { ArkAddress } from "@arkade-os/sdk";
import { describe, expect, it } from "vitest";
import {
  arkadeAddressMatchesServer,
  buildPwaConnectUrl,
  buildPwaSendUrl,
  INSCRIB3_PWA_ORIGIN,
  isValidSatsAmount,
  parsePwaReply,
  pwaAccountsFromReply,
} from "./arkadeWalletProvider";

const SERVER_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const OTHER_SERVER_KEY = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
const TAPROOT_KEY = Uint8Array.from({ length: 32 }, (_, i) => 100 + i);

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const address = new ArkAddress(SERVER_KEY, TAPROOT_KEY, "ark").encode();

describe("arkadeAddressMatchesServer", () => {
  it("accepts an address issued by the configured server (x-only key)", () => {
    expect(arkadeAddressMatchesServer(address, hex(SERVER_KEY))).toBe(true);
  });

  it("accepts a compressed 33-byte signer key", () => {
    expect(arkadeAddressMatchesServer(address, `02${hex(SERVER_KEY)}`)).toBe(
      true,
    );
    expect(
      arkadeAddressMatchesServer(address, `03${hex(SERVER_KEY)}`.toUpperCase()),
    ).toBe(true);
  });

  it("rejects an address from another server", () => {
    expect(arkadeAddressMatchesServer(address, hex(OTHER_SERVER_KEY))).toBe(
      false,
    );
  });

  it("rejects garbage", () => {
    expect(
      arkadeAddressMatchesServer("ark1notanaddress", hex(SERVER_KEY)),
    ).toBe(false);
    expect(arkadeAddressMatchesServer(address, "deadbeef")).toBe(false);
  });
});

describe("isValidSatsAmount", () => {
  it("accepts positive safe integers only", () => {
    expect(isValidSatsAmount(1)).toBe(true);
    expect(isValidSatsAmount(21_000)).toBe(true);
    expect(isValidSatsAmount(0)).toBe(false);
    expect(isValidSatsAmount(-5)).toBe(false);
    expect(isValidSatsAmount(1.5)).toBe(false);
    expect(isValidSatsAmount(Number.NaN)).toBe(false);
    expect(isValidSatsAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});

describe("PWA protocol helpers", () => {
  it("builds the connect URL on the wallet origin", () => {
    const url = new URL(buildPwaConnectUrl());
    expect(url.origin).toBe(INSCRIB3_PWA_ORIGIN);
    expect(url.searchParams.get("arkade_connect_origin")).toBe("1");
  });

  it("builds the send URL with address and integer sats", () => {
    const url = new URL(buildPwaSendUrl(address, 21_000));
    expect(url.origin).toBe(INSCRIB3_PWA_ORIGIN);
    expect(url.searchParams.get("arkade_send_origin")).toBe("1");
    expect(url.searchParams.get("arkade_send_address")).toBe(address);
    expect(url.searchParams.get("arkade_send_amount")).toBe("21000");
  });

  it("only recognises inscrib3 replies", () => {
    expect(parsePwaReply({ type: "inscrib3:send", txid: "ab" })).toEqual({
      type: "inscrib3:send",
      txid: "ab",
    });
    expect(parsePwaReply({ type: "metamask:whatever" })).toBeUndefined();
    expect(parsePwaReply("inscrib3:send")).toBeUndefined();
    expect(parsePwaReply(null)).toBeUndefined();
    expect(parsePwaReply({})).toBeUndefined();
  });

  it("drops non-string accounts", () => {
    expect(pwaAccountsFromReply([address, 42, null])).toEqual([address]);
    expect(pwaAccountsFromReply("nope")).toEqual([]);
  });
});
