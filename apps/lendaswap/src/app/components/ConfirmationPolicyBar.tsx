import { ChevronDown } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

interface Props {
  confirmations: number;
  onChange: (confirmations: number) => void;
}

const OPTIONS = [0, 1, 2, 3, 6];

function label(confirmations: number): string {
  if (confirmations === 0) return "Instant (0-conf)";
  return `${confirmations} confirmation${confirmations > 1 ? "s" : ""}`;
}

export function ConfirmationPolicyBar({ confirmations, onChange }: Props) {
  return (
    <div className="mb-1 flex items-center justify-between px-1">
      <span className="text-xs text-muted-foreground">Payout security</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs font-normal text-muted-foreground"
          >
            {label(confirmations)}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuRadioGroup
            value={String(confirmations)}
            onValueChange={(value) => onChange(Number(value))}
          >
            {OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option} value={String(option)}>
                {label(option)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
