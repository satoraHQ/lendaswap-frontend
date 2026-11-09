import { Check, Loader2, Unplug, Wallet, Zap } from "lucide-react";
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
import { Input } from "#/components/ui/input";
import { useNwc } from "../NwcContext";

interface NwcConnectDialogProps {
  trigger?: React.ReactNode;
  /** Controlled open state; when set, no trigger is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NwcConnectDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: NwcConnectDialogProps) {
  const {
    isConnected,
    isConnecting,
    balanceSats,
    error,
    connect,
    disconnect,
    refreshBalance,
  } = useNwc();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [uri, setUri] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!uri.trim()) return;
    setLocalError(null);
    try {
      await connect(uri.trim());
      setUri("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to connect");
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setUri("");
    setLocalError(null);
  };

  const displayError = localError || error;

  const defaultTrigger = (
    <Button
      variant={isConnected ? "outline" : "ghost"}
      size="sm"
      className={`gap-1.5 h-9 ${isConnected ? "border-yellow-500/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10" : ""}`}
    >
      <Zap
        className={`w-3.5 h-3.5 ${isConnected ? "fill-yellow-500 text-yellow-500" : ""}`}
      />
      {isConnected
        ? balanceSats !== null
          ? `${balanceSats.toLocaleString()} sats`
          : "Connected"
        : "Lightning"}
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
            <Zap className="h-5 w-5" />
            Lightning Wallet
          </DialogTitle>
          <DialogDescription>
            {isConnected
              ? "Your Lightning wallet is connected via NWC."
              : "Connect a Lightning wallet to pay invoices directly from this page."}
          </DialogDescription>
        </DialogHeader>

        {isConnected ? (
          <div className="space-y-4">
            {/* Connected state */}
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" />
                <span className="font-medium">Connected</span>
              </div>
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
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => refreshBalance()}
              >
                <Wallet className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-destructive hover:text-destructive"
                onClick={handleDisconnect}
              >
                <Unplug className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connection form */}
            <div className="space-y-2">
              <label
                htmlFor="nwc-uri"
                className="text-sm font-medium text-foreground"
              >
                NWC Connection String
              </label>
              <Input
                id="nwc-uri"
                type="text"
                placeholder="nostr+walletconnect://..."
                value={uri}
                onChange={(e) => {
                  setUri(e.target.value);
                  setLocalError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                className="font-mono text-xs"
                data-1p-ignore
                data-lpignore="true"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Get this from your wallet (e.g. Alby Hub → Connections → New
                Connection)
              </p>
            </div>

            {displayError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                {displayError}
              </div>
            )}

            <Button
              onClick={handleConnect}
              disabled={!uri.trim() || isConnecting}
              className="w-full"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Connect Wallet
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
