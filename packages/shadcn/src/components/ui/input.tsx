import * as React from "react";

import { cn } from "#/lib/utils";

/**
 * Satora-aligned text input primitive.
 *
 * Sizes match the `Button` primitive (sm = h-9, md = h-11, lg = h-12) so an
 * input + button row visually aligns. Default size is `md`.
 *
 * Style: `rounded-xl` (matches Card/Button), gray-200 border, white bg in
 * light mode and `white/5` in dark mode. Focus ring uses the lime brand
 * accent (`focus:border-lime-500 dark:focus:border-lime-400`).
 *
 * Use the `mono` flag for crypto addresses, NWC URIs, mnemonic seeds, etc.
 * Use `leftSlot` / `rightSlot` to add icons or buttons inside the field
 * (the input gets the right padding automatically).
 */

type Size = "sm" | "md" | "lg";

interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  inputSize?: Size;
  mono?: boolean;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  /** Wrapper className. The default `className` prop is forwarded to the input. */
  wrapperClassName?: string;
  invalid?: boolean;
}

const sizeClasses: Record<Size, string> = {
  sm: "h-9 text-[13px]",
  md: "h-11 text-sm",
  lg: "h-12 text-[15px]",
};

const slotPadding: Record<Size, { left: string; right: string; base: string }> =
  {
    sm: { left: "pl-9", right: "pr-9", base: "px-3" },
    md: { left: "pl-10", right: "pr-10", base: "px-4" },
    lg: { left: "pl-11", right: "pr-11", base: "px-5" },
  };

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      wrapperClassName,
      type = "text",
      inputSize = "md",
      mono = false,
      leftSlot,
      rightSlot,
      invalid = false,
      disabled,
      ...props
    },
    ref,
  ) => {
    const sz = slotPadding[inputSize];
    const padding = cn(sz.base, leftSlot && sz.left, rightSlot && sz.right);

    const inputElement = (
      <input
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          "w-full rounded-xl",
          sizeClasses[inputSize],
          padding,
          "bg-white dark:bg-white/5",
          "border",
          invalid
            ? "border-red-500/40"
            : "border-gray-200 dark:border-white/10",
          "text-black dark:text-white",
          "placeholder:text-gray-400 dark:placeholder:text-white/40",
          mono ? "font-mono" : "font-sans",
          "outline-none transition-colors duration-150",
          invalid
            ? "focus:border-red-500/60"
            : "focus:border-lime-500 dark:focus:border-lime-400",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className,
        )}
        {...props}
      />
    );

    if (!leftSlot && !rightSlot) {
      return wrapperClassName ? (
        <div className={wrapperClassName}>{inputElement}</div>
      ) : (
        inputElement
      );
    }

    const slotInset =
      inputSize === "sm"
        ? "left-3"
        : inputSize === "lg"
          ? "left-4"
          : "left-3.5";
    const slotInsetRight =
      inputSize === "sm"
        ? "right-3"
        : inputSize === "lg"
          ? "right-4"
          : "right-3.5";

    return (
      <div className={cn("relative", wrapperClassName)}>
        {leftSlot && (
          <span
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500",
              slotInset,
            )}
          >
            {leftSlot}
          </span>
        )}
        {inputElement}
        {rightSlot && (
          <span
            className={cn("absolute top-1/2 -translate-y-1/2", slotInsetRight)}
          >
            {rightSlot}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
