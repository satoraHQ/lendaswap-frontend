/**
 * Locale-aware normalization of a user-typed decimal amount into a canonical
 * string that uses "." as the decimal separator and no grouping.
 *
 * Browsers and on-screen keyboards follow the device locale: an iOS
 * `inputMode="decimal"` keypad shows "," instead of "." for German, French,
 * Spanish and many other regions. The numeric parsing in the app expects ".",
 * so we translate here instead of forcing users onto a US layout.
 */

interface Separators {
  decimal: string;
  group: string;
}

const FALLBACK: Separators = { decimal: ".", group: "," };

/** Whitespace-like grouping characters used by e.g. fr, de-CH, ru. */
const SPACE_GROUPS = /[\s  '’]/g;

export function getLocaleSeparators(locale?: string): Separators {
  try {
    const resolved =
      locale ??
      (typeof navigator !== "undefined" ? navigator.language : undefined);
    const parts = new Intl.NumberFormat(resolved).formatToParts(1234567.8);
    return {
      decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
      group: parts.find((p) => p.type === "group")?.value ?? ",",
    };
  } catch {
    return FALLBACK;
  }
}

/**
 * Normalize `raw` for the given locale (defaults to the browser locale).
 *
 * Rules:
 * - the locale's grouping separator is removed,
 * - the locale's decimal separator becomes ".",
 * - whitespace-like grouping characters are always removed,
 * - a lone grouping separator that is not followed by exactly three digits is
 *   treated as a decimal separator, so a German user typing "0.1" on a desktop
 *   keyboard or a US user typing "0,1" still gets what they meant.
 *
 * Any remaining character outside digits and "." is left in place so the
 * caller's format validation can reject it.
 */
export function normalizeDecimalInput(raw: string, locale?: string): string {
  const { decimal, group } = getLocaleSeparators(locale);
  let value = raw.replace(SPACE_GROUPS, "");

  const groupCount = value.split(group).length - 1;
  const hasDecimal = decimal !== "" && value.includes(decimal);
  const groupLooksLikeDecimal =
    group !== "" &&
    groupCount === 1 &&
    !hasDecimal &&
    !new RegExp(`\\${group}\\d{3}$`).test(value);

  if (groupLooksLikeDecimal) {
    value = value.replace(group, ".");
  } else if (group !== "") {
    value = value.split(group).join("");
  }

  if (decimal !== "." && decimal !== "") {
    value = value.split(decimal).join(".");
  }

  return value;
}
