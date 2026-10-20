import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { normalizeDecimalInput } from "../utils/decimalInput";

interface BtcInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function BtcInput({
  value,
  onChange,
  placeholder = "0.00000000",
  className = "",
  id,
  disabled = false,
  isLoading = false,
}: BtcInputProps) {
  // Format to always show 8 decimal places
  const formatBtcDisplay = (val: string): string => {
    if (!val || val === "") return "";

    // Parse the value
    const numValue = parseFloat(val);
    if (Number.isNaN(numValue)) return val;

    // Always show 8 decimal places
    return numValue.toFixed(8);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = normalizeDecimalInput(e.target.value);

    // Allow empty string (user can delete everything)
    if (input === "") {
      onChange("");
      return;
    }

    // Allow single decimal point at the end (for typing flow)
    if (input === ".") {
      onChange("0.");
      return;
    }

    // Validate BTC format: optional digits, optional decimal point, up to 8 decimal places
    const btcRegex = /^\d*\.?\d{0,8}$/;

    if (btcRegex.test(input)) {
      onChange(input);
    }
    // If input doesn't match, don't update (ignore the invalid character)
  };

  // Only format on blur to show 8 decimals
  const handleBlur = () => {
    if (value && value !== "") {
      const formatted = formatBtcDisplay(value);
      if (formatted !== value) {
        onChange(formatted);
      }
    }
  };

  if (isLoading) {
    return (
      <div
        className={`px-4 py-2 md:py-2.5 min-h-[3rem] md:min-h-[3.5rem] bg-card border-2 rounded-lg shadow-sm flex items-center ${className}`}
      >
        <Skeleton className="h-6 w-32" />
      </div>
    );
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      className={`px-4 py-2 md:py-2.5 min-h-[3rem] md:min-h-[3.5rem] bg-card border-2  rounded-lg hover:border-blue-300 transition-colors shadow-sm ${className}`}
      disabled={disabled}
      data-1p-ignore
      data-lpignore="true"
      autoComplete="off"
    />
  );
}
