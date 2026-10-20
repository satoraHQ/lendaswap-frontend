/**
 * Locale-aware normalization of a user-typed decimal amount into a canonical
 * string that uses "." as the decimal separator and no grouping.
 *
 * Browsers and on-screen keyboards follow the device locale: an iOS
 * `inputMode="decimal"` keypad shows "," instead of "." for German, French,
 * Spanish and many other regions. The numeric parsing in the app expects ".",
 * so we translate here instead of forcing users onto a US layout.
 *
 * The inputs are controlled and echo the canonical "." form, so whatever this
 * function emits is fed straight back in on the next keystroke. Every rule
 * below must therefore be a fixed point on its own output.
 */

/** Whitespace-like and apostrophe grouping characters used by e.g. fr, de-CH, ru. */
const SPACE_GROUPS = /[\s  '’]/g;

export function usesCommaDecimal(locale?: string): boolean {
  try {
    const resolved =
      locale ??
      (typeof navigator !== "undefined" ? navigator.language : undefined);
    const parts = new Intl.NumberFormat(resolved).formatToParts(1.5);
    return parts.find((p) => p.type === "decimal")?.value === ",";
  } catch {
    return false;
  }
}

function count(value: string, char: string): number {
  return value.split(char).length - 1;
}

/**
 * Normalize `raw` for the given locale (defaults to the browser locale).
 *
 * Rules, in order:
 * - whitespace-like and apostrophe grouping characters are removed,
 * - if both "." and "," are present, the last one is the decimal separator
 *   and every other separator is grouping ("1,000.5" and "1.000,5" → "1000.5"),
 * - two or more of the same separator are grouping and removed,
 * - a single "." is always a decimal separator (it is the canonical form the
 *   inputs echo back, so it must round-trip unchanged in every locale),
 * - a single "," is a decimal separator in comma-decimal locales; in other
 *   locales it is left in place so the caller's format validation rejects
 *   the keystroke rather than guessing between "0,1" and "1,000".
 *
 * Any other character is left in place for the caller to reject.
 */
export function normalizeDecimalInput(raw: string, locale?: string): string {
  const value = raw.replace(SPACE_GROUPS, "");
  const dots = count(value, ".");
  const commas = count(value, ",");

  if (dots > 0 && commas > 0) {
    const decimal = value.lastIndexOf(".") > value.lastIndexOf(",") ? "." : ",";
    const grouping = decimal === "." ? "," : ".";
    const withoutGrouping = value.split(grouping).join("");
    return count(withoutGrouping, decimal) === 1
      ? withoutGrouping.replace(decimal, ".")
      : withoutGrouping.split(decimal).join("");
  }

  if (dots >= 2) return value.split(".").join("");
  if (dots === 1) return value;

  if (commas >= 2) return value.split(",").join("");
  if (commas === 1 && usesCommaDecimal(locale)) return value.replace(",", ".");

  return value;
}
