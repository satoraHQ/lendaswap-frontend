import { Bitcoin } from "lucide-react";
import { formatSatsForUnit, useBtcUnit } from "../utils/btcUnit";
import { SatoshiIcon } from "./CurrencyIcon";

/** One limit: muted label, then the amount with the same unit icon as the inputs. */
function Limit({
  label,
  sats,
  onSelect,
}: {
  label: string;
  sats: number;
  onSelect: (sats: number, bound: "min" | "max") => void;
}) {
  const { unit } = useBtcUnit();
  const Icon = unit === "sats" ? SatoshiIcon : Bitcoin;
  const amount = formatSatsForUnit(sats, unit);
  return (
    <button
      type="button"
      onClick={() => onSelect(sats, label === "Min" ? "min" : "max")}
      title={`Use ${label.toLowerCase()} amount`}
      className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
    >
      <span className="text-muted-foreground/70">{label}</span>
      <span className="flex items-center font-medium tabular-nums text-muted-foreground">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        {amount}
      </span>
    </button>
  );
}

/**
 * Pair min/max (static server limits), in the user's chosen Bitcoin unit.
 * Clicking one fills it into the Bitcoin-side amount field.
 */
export function SwapLimits({
  min,
  max,
  onSelect,
}: {
  min: number;
  max: number;
  onSelect: (sats: number, bound: "min" | "max") => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <Limit label="Min" sats={min} onSelect={onSelect} />
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <Limit label="Max" sats={max} onSelect={onSelect} />
    </div>
  );
}
