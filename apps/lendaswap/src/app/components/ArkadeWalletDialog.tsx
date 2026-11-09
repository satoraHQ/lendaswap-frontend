import { Check, ExternalLink, Loader2, Unplug, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { useArkadeWallet } from "../ArkadeWalletContext";
import {
  INSCRIB3_EXTENSION_URL,
  INSCRIB3_PWA_ORIGIN,
} from "../utils/arkadeWalletProvider";

interface ArkadeWalletDialogProps {
  trigger?: React.ReactNode;
  /** Controlled open state; when set, no trigger is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function truncateArkadeAddress(address: string): string {
  return address.length > 20
    ? `${address.slice(0, 10)}…${address.slice(-6)}`
    : address;
}

/**
 * Connect / inspect / disconnect an Inscrib3 Arkade wallet. Mirrors the NWC
 * dialog so the header reads the same for both external wallets.
 */
export function ArkadeWalletDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: ArkadeWalletDialogProps) {
  const {
    hasExtension,
    isConnected,
    isConnecting,
    mode,
    address,
    balanceSats,
    network,
    error,
    connect,
    disconnect,
    refreshBalance,
  } = useArkadeWallet();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [localError, setLocalError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLocalError(null);
    try {
      await connect();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to connect");
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setLocalError(null);
  };

  const displayError = localError || error;

  const defaultTrigger = (
    <Button
      variant={isConnected ? "outline" : "ghost"}
      size="sm"
      className={`h-9 gap-1.5 ${isConnected ? "border-lime-500/30 text-lime-700 hover:bg-lime-500/10 dark:text-lime-400" : ""}`}
      title="Arkade wallet"
    >
      <Wallet className={`h-3.5 w-3.5 ${isConnected ? "text-lime-500" : ""}`} />
      {isConnected && address
        ? balanceSats !== null
          ? `${balanceSats.toLocaleString()} sats`
          : truncateArkadeAddress(address)
        : "Arkade"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Arkade Wallet
          </DialogTitle>
          <DialogDescription>
            {isConnected
              ? mode === "extension"
                ? "Your Inscrib3 extension is connected."
                : "Your Inscrib3 web wallet is connected. Each payment opens the wallet in a popup to approve."
              : "Connect an Inscrib3 wallet to receive Arkade swaps to it and to pay Arkade deposits with one click."}
          </DialogDescription>
        </DialogHeader>

        {isConnected && address ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" />
                <span className="font-medium">Connected</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Address</span>
                <span className="truncate font-mono text-xs" title={address}>
                  {truncateArkadeAddress(address)}
                </span>
              </div>
              {network && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Network</span>
                  <span className="text-sm">{network.displayName}</span>
                </div>
              )}
              {balanceSats !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Balance</span>
                  <span className="font-mono font-medium">
                    {balanceSats.toLocaleString()} sats
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {mode === "extension" && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => refreshBalance()}
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1 text-destructive hover:text-destructive"
                onClick={handleDisconnect}
              >
                <Unplug className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {hasExtension
                ? "The Inscrib3 extension was detected. Connecting asks the extension for permission once."
                : "No Inscrib3 extension detected. You can connect through the Inscrib3 web wallet instead; it opens in a popup."}
            </p>

            {displayError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                {displayError}
              </div>
            )}

            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="mr-2 h-4 w-4" />
                  {hasExtension ? "Connect Extension" : "Open Web Wallet"}
                </>
              )}
            </Button>

            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {!hasExtension && (
                <a
                  href={INSCRIB3_EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  Install the Inscrib3 extension
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <a
                href={INSCRIB3_PWA_ORIGIN}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                Create a wallet at wallet.inscrib3.com
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
