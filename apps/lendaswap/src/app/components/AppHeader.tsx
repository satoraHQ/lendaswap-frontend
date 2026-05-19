import { useAppKit } from "@reown/appkit/react";
import {
  Download,
  Eye,
  Github,
  Globe,
  History,
  Key,
  Menu,
  Upload,
  Wallet,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useAccount } from "wagmi";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { ReactComponent as XLogo } from "../../assets/x-com-logo.svg";
import isValidSpeedWalletContext from "../../utils/speedWallet";
import { useNwc } from "../NwcContext";
import { ThemeToggle } from "../utils/theme-toggle";
import { useWalletBridge } from "../WalletBridgeContext";
import { NwcConnectDialog } from "./NwcConnectDialog";

interface AppHeaderProps {
  onBackupOpen: () => void;
  onImportOpen: () => void;
  onDownloadSeedphrase: () => void;
}

export function AppHeader({
  onBackupOpen,
  onImportOpen,
  onDownloadSeedphrase,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const { open } = useAppKit();
  const { isConnected, address } = useAccount();
  const { isEmbedded } = useWalletBridge();
  const isSpeedWallet = isValidSpeedWalletContext();
  const showNwc = !isEmbedded && !isSpeedWallet;
  const { isConnected: isNwcConnected, balanceSats } = useNwc();
  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : undefined;

  return (
    <header className="border-b">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex items-center gap-2 transition-opacity hover:opacity-80"
            >
              <span className="text-2xl font-bold select-none">
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

            {/* GitHub Link */}
            <a
              href="https://github.com/satoraHQ"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-muted/50 text-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
              aria-label="Visit us on GitHub"
            >
              <Github className="h-4 w-4" />
            </a>

            {/* X/Twitter Link */}
            <a
              href="https://x.com/lendasat"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-muted/50 text-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
              aria-label="Follow us on X"
            >
              <XLogo className="h-3.5 w-3.5 fill-current" />
            </a>

            {/* Satora Website Link */}
            <a
              href="https://satora.io"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-muted/50 text-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
              aria-label="Visit satora.io"
            >
              <Globe className="h-4 w-4" />
            </a>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile Dropdown Menu */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => navigate("/swaps")}
                    className="gap-2"
                  >
                    <History className="h-4 w-4" />
                    Swaps
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={onBackupOpen} className="gap-2">
                    <Eye className="h-4 w-4" />
                    Show Seedphrase
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={onDownloadSeedphrase}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Seedphrase
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={onImportOpen} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Import Seedphrase
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* NWC Lightning Wallet - only in standalone mode */}
                  {showNwc && (
                    <NwcConnectDialog
                      trigger={
                        <button
                          type="button"
                          className="focus:bg-accent focus:text-accent-foreground outline-hidden relative flex w-full cursor-default select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-200"
                        >
                          <Zap
                            className={`h-4 w-4 shrink-0 ${isNwcConnected ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`}
                          />
                          {isNwcConnected
                            ? balanceSats !== null
                              ? `${balanceSats.toLocaleString()} sats`
                              : "Connected"
                            : "Lightning"}
                        </button>
                      }
                    />
                  )}

                  {/* Hide Connect button in Speed Wallet - not needed */}
                  {!isSpeedWallet && (
                    <DropdownMenuItem
                      onClick={() => open().catch(console.error)}
                    >
                      <Wallet className="h-4 w-4" />
                      {isConnected ? truncatedAddress : "Connect"}
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem asChild>
                    <ThemeToggle />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Desktop Buttons */}
            <div className="hidden items-center gap-3 md:flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/swaps")}
                className="gap-2"
                title="Swaps"
              >
                <History className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    title="Wallet Settings"
                  >
                    <Key className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={onBackupOpen} className="gap-2">
                    <Eye className="h-4 w-4" />
                    Show Seedphrase
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onDownloadSeedphrase}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Seedphrase
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onImportOpen} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Import Seedphrase
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* NWC Lightning Wallet - only in standalone mode */}
              {showNwc && <NwcConnectDialog />}
              <ThemeToggle />
              {/* Hide Connect button in Speed Wallet - not needed */}
              {!isSpeedWallet && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => open().catch(console.error)}
                  className="h-9"
                >
                  <Wallet className="mr-1.5 h-3.5 w-3.5" />
                  {isConnected ? truncatedAddress : "Connect"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
