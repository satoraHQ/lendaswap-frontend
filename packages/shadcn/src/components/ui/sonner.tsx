import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          // The app defines these tokens as bare HSL triplets (see
          // tailwind.config.js), so they must be wrapped in hsl() — used
          // directly they are invalid colors and render transparent.
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Brand-lime call to action (matches the logo dot); !important to
          // beat sonner's built-in button styles.
          actionButton: "!bg-lime-400 !text-black hover:!bg-lime-300",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
