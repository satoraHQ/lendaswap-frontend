import { useEffect, useMemo, useState } from "react";

// ── Constants ────────────────────────────────────────────────────────

const BTC_SYMBOLS = new Set(["btc", "wbtc", "tbtc"]);

export function isBtcToken(symbol: string | undefined): boolean {
  return symbol !== undefined && BTC_SYMBOLS.has(symbol.toLowerCase());
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Format a number without scientific notation, preserving precision. */
function formatNumber(val: number, maxDecimals = 8): string {
  const fixed = val.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, "") || "0";
}

// ── Hook ─────────────────────────────────────────────────────────────

interface UseAmountInputOptions {
  /** External value in smallest unit (sats for BTC, 10^-6 for USDC, etc.) - set by parent or quote. */
  value: number | undefined;
  /** Called with the amount in smallest unit when the user edits the input. */
  onChange: (value: number | undefined) => void;
  /** Number of decimal places for this token (8 for BTC, 6 for USDC, etc.). */
  decimals: number | undefined;
  /** Token symbol, e.g. "BTC", "WBTC". */
  symbol: string | undefined;
}

interface AmountInputMode {
  /** The string shown inside the <input>. */
  inputValue: string;
  /** Whether this is a BTC-family token. */
  isBtc: boolean;
  /** Whether displaying in sats (true) or BTC (false). */
  satsMode: boolean;
  /** Toggle between sats and BTC display. */
  toggleSatsMode: () => void;
  /** Pass this to the <input onChange>. */
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useSatsBtcMode({
  value,
  onChange,
  decimals,
  symbol,
}: UseAmountInputOptions): AmountInputMode {
  const [inputValue, setInputValue] = useState<string>("");
  const [satsMode, setSatsMode] = useState(false);

  const isBtc = isBtcToken(symbol);

  // Display decimals: BTC-family tokens always show 8 decimals (even tBTC with 18 on-chain decimals).
  const displayDecimals = isBtc ? 8 : (decimals ?? 0);

  // In sats mode for BTC tokens, divisor converts from token smallest units to sats.
  // - BTC/WBTC (8 decimals): divisor = 1 (already in sats)
  // - tBTC (18 decimals): divisor = 10^10 (convert 18-dec to 8-dec sats)
  // Otherwise, convert from smallest unit to display unit using display decimals.
  const divisor = useMemo(() => {
    if (isBtc && satsMode) {
      // Convert from token's smallest units to sats (8 decimals)
      return 10 ** ((decimals ?? 8) - 8);
    }
    // BTC mode: show human-readable BTC (divide by 10^decimals)
    return 10 ** (decimals ?? 0);
  }, [isBtc, satsMode, decimals]);

  const displayValue = value !== undefined ? value / divisor : undefined;

  const toggleSatsMode = () => {
    if (!isBtc) return;
    const newSatsMode = !satsMode;
    setSatsMode(newSatsMode);
    // Re-format current value for the new mode
    if (value !== undefined) {
      const newDivisor = newSatsMode
        ? 10 ** ((decimals ?? 8) - 8)
        : 10 ** (decimals ?? 0);
      const newDisplay = value / newDivisor;
      setInputValue(
        newSatsMode
          ? String(Math.round(newDisplay))
          : formatNumber(newDisplay, displayDecimals),
      );
    }
  };

  // Sync internal input string when external value changes (e.g. quote)
  useEffect(() => {
    if (displayValue === undefined) {
      setInputValue((prev) => {
        const currentNum = Number.parseFloat(prev);
        return Number.isNaN(currentNum) ? prev : "";
      });
    } else {
      setInputValue((prev) => {
        const currentNum = Number.parseFloat(prev);
        if (
          Number.isNaN(currentNum) ||
          Math.abs(currentNum - displayValue) > 1e-10
        ) {
          if (isBtc && satsMode) {
            return String(Math.round(displayValue));
          }
          return formatNumber(displayValue, displayDecimals);
        }
        return prev;
      });
    }
  }, [displayValue, isBtc, satsMode, displayDecimals]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.replace(/[^0-9.]/g, "");

    if (input === "") {
      setInputValue("");
      onChange(undefined);
      return;
    }

    const effectiveDecimals = isBtc && satsMode ? 0 : displayDecimals;
    const regex =
      effectiveDecimals > 0
        ? new RegExp(`^\\d*\\.?\\d{0,${effectiveDecimals}}$`)
        : /^\d*$/;

    if (regex.test(input)) {
      setInputValue(input);
      const parsed = Number.parseFloat(input);
      if (!Number.isNaN(parsed)) {
        onChange(Math.round(parsed * divisor));
      }
    }
  };

  return { inputValue, isBtc, satsMode, toggleSatsMode, handleChange };
}
