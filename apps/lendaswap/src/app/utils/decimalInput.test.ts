import { describe, expect, it } from "vitest";
import { normalizeDecimalInput, usesCommaDecimal } from "./decimalInput";

describe("usesCommaDecimal", () => {
  it("is false for en-US", () => {
    expect(usesCommaDecimal("en-US")).toBe(false);
  });

  it("is true for de-DE and fr-FR", () => {
    expect(usesCommaDecimal("de-DE")).toBe(true);
    expect(usesCommaDecimal("fr-FR")).toBe(true);
  });

  it("falls back to dot on an invalid locale", () => {
    expect(usesCommaDecimal("not-a-locale-!!")).toBe(false);
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
      expect(n("0,123")).toBe("0.123");
    });

    it("round-trips the canonical dot form on successive keystrokes", () => {
      // The input echoes "0.12"; the user types "3" and "0.123" comes back in.
      expect(n("0.12")).toBe("0.12");
      expect(n("0.123")).toBe("0.123");
      expect(n("1.500")).toBe("1.500");
      expect(n("0.00000001")).toBe("0.00000001");
    });

    it("strips repeated dot grouping", () => {
      expect(n("1.000.000")).toBe("1000000");
    });

    it("handles mixed grouping and decimal", () => {
      expect(n("1.000,5")).toBe("1000.5");
      expect(n("1.000.000,25")).toBe("1000000.25");
    });
  });

  describe("en-US (dot decimal, comma grouping)", () => {
    const n = (s: string) => normalizeDecimalInput(s, "en-US");

    it("keeps the dot decimal", () => {
      expect(n("0.1")).toBe("0.1");
      expect(n("0.100")).toBe("0.100");
      expect(n("0.123")).toBe("0.123");
    });

    it("strips repeated comma grouping", () => {
      expect(n("1,000,000")).toBe("1000000");
    });

    it("handles mixed grouping and decimal", () => {
      expect(n("1,000.5")).toBe("1000.5");
      expect(n("1,000,000.25")).toBe("1000000.25");
    });

    it("leaves a lone comma for the caller to reject", () => {
      expect(n("0,1")).toBe("0,1");
      expect(n("0,100")).toBe("0,100");
      expect(n("1,000")).toBe("1,000");
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

  it("is idempotent on its own output", () => {
    const cases: Array<[string, string]> = [
      ["0,123", "de-DE"],
      ["1.000,5", "de-DE"],
      ["1,000.5", "en-US"],
      ["0.123", "en-US"],
      ["1 000,5", "fr-FR"],
    ];
    for (const [input, locale] of cases) {
      const once = normalizeDecimalInput(input, locale);
      expect(normalizeDecimalInput(once, locale)).toBe(once);
    }
  });

  it("leaves other characters for the caller to reject", () => {
    expect(normalizeDecimalInput("1a2", "en-US")).toBe("1a2");
  });
});
