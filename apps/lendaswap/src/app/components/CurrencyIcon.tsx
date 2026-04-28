import { Bitcoin, DollarSign } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { isBtcToken } from "./useSatsBtcMode";

// ── Custom SVG icons ─────────────────────────────────────────────────

/** Gold bar icon - stroke-based SVG matching the Lucide icon style. */
function GoldBar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 6h8l3 12H5z" />
      <path d="M10 6l1 5" />
    </svg>
  );
}

/**
 * Satoshi symbol - three parallel diagonal lines with two short vertical strokes.
 * @see https://bitcoin.design/guide/designing-products/units-and-symbols/
 */
function SatoshiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8.86 8.01L16.5 10.07" />
      <path d="M8.18 10.97L15.82 13.04" />
      <path d="M7.5 13.92L15.14 15.99" />
      <path d="M13.09 7.27L13.5 5.5" />
      <path d="M10.5 18.5L10.91 16.73" />
    </svg>
  );
}

// ── Icon mapping ─────────────────────────────────────────────────────

type CurrencyCategory = "stablecoin" | "bitcoin" | "gold";
type IconComponent = ComponentType<{ className?: string }>;

const SYMBOL_CATEGORY: Record<string, CurrencyCategory> = {
  usdc: "stablecoin",
  usdt: "stablecoin",
  usdt0: "stablecoin",
  dai: "stablecoin",
  busd: "stablecoin",
  btc: "bitcoin",
  wbtc: "bitcoin",
  tbtc: "bitcoin",
  xaut: "gold",
};

const CATEGORY_ICON: Record<CurrencyCategory, IconComponent> = {
  stablecoin: DollarSign,
  bitcoin: Bitcoin,
  gold: GoldBar,
};

const ICON_CLASS = "h-6 w-6 md:h-8 md:w-8 text-muted-foreground/70 shrink-0";
const CLICKABLE_ICON_CLASS =
  "h-6 w-6 md:h-8 md:w-8 text-muted-foreground/70 shrink-0 cursor-pointer hover:text-muted-foreground transition-colors";

// ── Exported component ───────────────────────────────────────────────

export function CurrencyIcon({
  symbol,
  satsMode,
  onToggle,
}: {
  symbol: string | undefined;
  satsMode?: boolean;
  onToggle?: () => void;
}) {
  if (!symbol) return null;
  const category = SYMBOL_CATEGORY[symbol.toLowerCase()];
  if (!category) return null;

  const clickable = isBtcToken(symbol) && onToggle;
  const Icon =
    satsMode && category === "bitcoin" ? SatoshiIcon : CATEGORY_ICON[category];

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title={satsMode ? "Switch to BTC" : "Switch to sats"}
      >
        <Icon className={CLICKABLE_ICON_CLASS} />
      </button>
    );
  }

  return <Icon className={ICON_CLASS} />;
}
