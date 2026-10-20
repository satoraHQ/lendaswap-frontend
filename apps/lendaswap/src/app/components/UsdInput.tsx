import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { normalizeDecimalInput } from "../utils/decimalInput";

interface UsdInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function UsdInput({
  value,
  onChange,
  placeholder = "0.00",
  className = "",
  id,
  disabled = false,
  isLoading = false,
}: UsdInputProps) {
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

    // Validate USD format: optional digits, optional decimal point, up to 2 decimal places
    const usdRegex = /^\d*\.?\d{0,2}$/;

    if (usdRegex.test(input)) {
      onChange(input);
    }
    // If input doesn't match, don't update (ignore the invalid character)
  };

  if (isLoading) {
    return (
      <div
        className={`px-4 py-2 md:py-2.5 min-h-[3rem] md:min-h-[3.5rem] bg-card border-2  rounded-lg shadow-sm flex items-center ${className}`}
      >
        <Skeleton className="h-6 w-24" />
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
      className={`px-4 py-2 md:py-2.5 min-h-[3rem] md:min-h-[3.5rem] bg-card border-2 rounded-lg hover:border-blue-300 transition-colors shadow-sm ${className}`}
      disabled={disabled}
      data-1p-ignore
      data-lpignore="true"
      autoComplete="off"
    />
  );
}
