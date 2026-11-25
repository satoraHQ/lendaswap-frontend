import { Download, Eye, History, Moon, Sun, Upload } from "lucide-react";
import { useNavigate } from "react-router";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "#/components/ui/dropdown-menu";
import isValidSpeedWalletContext from "../../utils/speedWallet";
import { useActionableSwaps } from "../swapActionCenter";
import { useTheme } from "../utils/theme-provider";
import { useWalletBridge } from "../WalletBridgeContext";
import { useWalletMenu, WalletMenu } from "./WalletMenu";

interface AppHeaderProps {
  onBackupOpen: () => void;
  onImportOpen: () => void;
  onDownloadSeedphrase: () => void;
}

/** Pulsing dot marking that a swap in the history needs the user. */
function ActionDot({ className }: { className?: string }) {
  return (
    <span className={`pointer-events-none flex h-2 w-2 ${className ?? ""}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-500 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-500" />
    </span>
  );
}

export function AppHeader({
  onBackupOpen,
  onImportOpen,
  onDownloadSeedphrase,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { isEmbedded } = useWalletBridge();
  const isSpeedWallet = isValidSpeedWalletContext();
  // NWC and Inscrib3 Arkade wallets only in standalone mode: an embedding
  // host wallet or Speed Wallet already supplies the Bitcoin side. Speed
  // Wallet also has no use for the EVM connect button.
  const { entries: walletEntries, dialogs: walletDialogs } = useWalletMenu({
    showNwc: !isEmbedded && !isSpeedWallet,
    showArkade: !isEmbedded && !isSpeedWallet,
    showEvm: !isSpeedWallet,
  });
  const needsAction = useActionableSwaps().size > 0;

  return (
    <>
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-6">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex items-center gap-2 transition-opacity hover:opacity-80"
              >
                <span className="select-none text-2xl font-bold">
                  satora
                  <span
                    className="inline-block rounded-full bg-lime-400 align-baseline"
                    style={{
                      width: "0.3em",
                      height: "0.3em",
                      marginLeft: "0.05em",
                    }}
                  />
                </span>
              </button>
            </div>

            <WalletMenu
              entries={walletEntries}
              indicator={
                needsAction ? (
                  <ActionDot className="absolute -right-1 -top-1" />
                ) : undefined
              }
            >
              {walletEntries.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={() => navigate("/swaps")}
                className="gap-2"
              >
                <History className="h-4 w-4" />
                Swap history
                {needsAction && <ActionDot className="relative ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground">
                Seedphrase settings
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={onBackupOpen} className="gap-2">
                <Eye className="h-4 w-4" /> Show seedphrase
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDownloadSeedphrase}
                className="gap-2"
              >
                <Download className="h-4 w-4" /> Download seedphrase
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onImportOpen} className="gap-2">
                <Upload className="h-4 w-4" /> Import seedphrase
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={toggleTheme} className="gap-2">
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                {theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"}
              </DropdownMenuItem>
            </WalletMenu>
          </div>
        </div>
      </header>
      {walletDialogs}
    </>
  );
}
