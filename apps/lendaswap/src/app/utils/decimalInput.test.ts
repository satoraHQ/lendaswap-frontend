import { describe, expect, it } from "vitest";
import { getLocaleSeparators, normalizeDecimalInput } from "./decimalInput";

describe("getLocaleSeparators", () => {
  it("detects en-US", () => {
    expect(getLocaleSeparators("en-US")).toEqual({ decimal: ".", group: "," });
  });

  it("detects de-DE", () => {
    expect(getLocaleSeparators("de-DE")).toEqual({ decimal: ",", group: "." });
  });

  it("falls back on an invalid locale", () => {
    expect(getLocaleSeparators("not-a-locale-!!")).toEqual({
      decimal: ".",
      group: ",",
    });
  });
});

describe("normalizeDecimalInput", () => {
  describe("de-DE (comma decimal, dot grouping)", () => {
    const n = (s: string) => normalizeDecimalInput(s, "de-DE");

    it("maps the comma decimal to a dot", () => {
      expect(n("0,1")).toBe("0.1");
      expect(n("12,5")).toBe("12.5");
      expect(n(",")).toBe(".");
      expect(n("0,100")).toBe("0.100");
    });

    it("strips dot grouping", () => {
      expect(n("1.000")).toBe("1000");
      expect(n("1.000.000")).toBe("1000000");
      expect(n("1.000,5")).toBe("1000.5");
    });

    it("treats a lone dot as a decimal typo", () => {
      expect(n("0.1")).toBe("0.1");
      expect(n("12.5")).toBe("12.5");
    });
  });

  describe("en-US (dot decimal, comma grouping)", () => {
    const n = (s: string) => normalizeDecimalInput(s, "en-US");

    it("keeps the dot decimal", () => {
      expect(n("0.1")).toBe("0.1");
      expect(n("0.100")).toBe("0.100");
    });

    it("strips comma grouping", () => {
      expect(n("1,000")).toBe("1000");
      expect(n("1,000,000")).toBe("1000000");
      expect(n("1,000.5")).toBe("1000.5");
    });

    it("treats a lone comma as a decimal typo", () => {
      expect(n("0,1")).toBe("0.1");
      expect(n("12,5")).toBe("12.5");
    });
  });

  describe("fr-FR (comma decimal, narrow no-break space grouping)", () => {
    const n = (s: string) => normalizeDecimalInput(s, "fr-FR");

    it("handles space grouping and comma decimal", () => {
      expect(n("1 000,5")).toBe("1000.5");
      expect(n("1 000")).toBe("1000");
      expect(n("0,5")).toBe("0.5");
    });
  });

  describe("de-CH (dot decimal, apostrophe grouping)", () => {
    const n = (s: string) => normalizeDecimalInput(s, "de-CH");

    it("handles apostrophe grouping", () => {
      expect(n("1’000.5")).toBe("1000.5");
      expect(n("1'000")).toBe("1000");
    });
  });

  it("leaves other characters for the caller to reject", () => {
    expect(normalizeDecimalInput("1a2", "en-US")).toBe("1a2");
  });
});
