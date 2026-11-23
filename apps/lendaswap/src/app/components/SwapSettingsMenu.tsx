import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { type BtcUnit, useBtcUnit } from "../utils/btcUnit";

interface Props {
  confirmations: number;
  onChange: (confirmations: number) => void;
  /** Rendered centered in the row, e.g. the pair's swap limits. */
  children?: ReactNode;
}

const OPTIONS = [0, 1, 2, 3, 6];

const UNIT_OPTIONS: { value: BtcUnit; label: string }[] = [
  { value: "btc", label: "BTC" },
  { value: "sats", label: "sats" },
];

const TOGGLE_GROUP_CLASS = "w-full rounded-xl bg-muted p-1";
const TOGGLE_ITEM_CLASS =
  "h-8 rounded-lg text-sm text-muted-foreground first:rounded-lg last:rounded-lg hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm";

/** One setting: title, a line of help, the control. */
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-sm">{title}</div>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * Always rendered, whatever the pair, so the card keeps its shape when the
 * target changes. The depth persists and applies to the next on-chain payout.
 */
export function SwapSettingsMenu({ confirmations, onChange, children }: Props) {
  const { unit, setUnit } = useBtcUnit();
  return (
    <div className="mb-1 grid h-7 grid-cols-[1.75rem_1fr_1.75rem] items-center gap-2 px-1">
      <span aria-hidden="true" />
      <div className="flex min-w-0 justify-center">{children}</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label="Swap settings"
            title="Swap settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-80 divide-y divide-border rounded-2xl p-0"
        >
          <div className="px-4 py-3 text-sm font-medium">Swap settings</div>
          <SettingRow
            title="Bitcoin unit"
            description="How Bitcoin amounts are shown and entered."
          >
            <ToggleGroup
              type="single"
              value={unit}
              onValueChange={(value) => value && setUnit(value as BtcUnit)}
              className={TOGGLE_GROUP_CLASS}
              aria-label="Bitcoin unit"
            >
              {UNIT_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className={TOGGLE_ITEM_CLASS}
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingRow>
          <SettingRow
            title="Bitcoin confirmations"
            description="Blocks the payout needs before it is claimed."
          >
            <ToggleGroup
              type="single"
              value={String(confirmations)}
              // Radix reports "" when the selected item is clicked again.
              onValueChange={(value) => value && onChange(Number(value))}
              className={TOGGLE_GROUP_CLASS}
              aria-label="Bitcoin confirmations"
            >
              {OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option}
                  value={String(option)}
                  className={TOGGLE_ITEM_CLASS}
                >
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingRow>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
