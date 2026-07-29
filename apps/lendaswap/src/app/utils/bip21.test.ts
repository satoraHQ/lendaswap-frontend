import { describe, expect, it } from "vitest";
import { extractRefundAddress } from "./bip21";

const BTC = "bc1p7hrkwjswcztk79e7vnn969vl2fgzg0p59eqwkaa0myw7ej3ms5jseyhshl";
const ARK =
  "ark1qzpq904am6clw3pgqwyh4p02708fy4xs0hcpwt7rwfdttuxsjameea87nn2gy3c62us24ej6dmgf2ew2l9u56p9f80yvvnngn7zc8kqyv8wdt8";

describe("extractRefundAddress", () => {
  it("passes plain addresses through, trimmed", () => {
    expect(extractRefundAddress(`  ${ARK} `, "arkade")).toBe(ARK);
    expect(extractRefundAddress(BTC, "bitcoin")).toBe(BTC);
  });

  it("extracts the ark parameter from a unified bitcoin: URI", () => {
    expect(extractRefundAddress(`bitcoin:${BTC}?ark=${ARK}`, "arkade")).toBe(
      ARK,
    );
  });

  it("extracts the bitcoin address from a bitcoin: URI", () => {
    expect(
      extractRefundAddress(`bitcoin:${BTC}?ark=${ARK}&amount=0.001`, "bitcoin"),
    ).toBe(BTC);
    expect(extractRefundAddress(`bitcoin:${BTC}`, "bitcoin")).toBe(BTC);
  });

  it("accepts an ark:/arkade: URI for arkade", () => {
    expect(extractRefundAddress(`ark:${ARK}`, "arkade")).toBe(ARK);
    expect(extractRefundAddress(`arkade:${ARK}`, "arkade")).toBe(ARK);
  });

  it("is case-insensitive on the scheme", () => {
    expect(extractRefundAddress(`BITCOIN:${BTC}?ark=${ARK}`, "arkade")).toBe(
      ARK,
    );
  });

  it("refuses a URI with no address for the requested network", () => {
    // A bitcoin: URI without an ark param must NOT fall back to the BTC
    // address when an Arkade address is needed — wrong network.
    expect(extractRefundAddress(`bitcoin:${BTC}`, "arkade")).toBeUndefined();
    expect(extractRefundAddress(`ark:${ARK}`, "bitcoin")).toBeUndefined();
  });

  it("returns non-URI colon input as-is for validation to reject", () => {
    expect(extractRefundAddress("not a uri: at all", "arkade")).toBe(
      "not a uri: at all",
    );
  });

  it("returns undefined for empty input", () => {
    expect(extractRefundAddress("   ", "arkade")).toBeUndefined();
  });
});
