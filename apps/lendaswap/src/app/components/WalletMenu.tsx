import { useAppKit } from "@reown/appkit/react";
import { ChevronDown, Wallet, Zap } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useArkadeWallet } from "../ArkadeWalletContext";
import { useNwc } from "../NwcContext";
import {
  ArkadeWalletDialog,
  truncateArkadeAddress,
} from "./ArkadeWalletDialog";
import { NwcConnectDialog } from "./NwcConnectDialog";

export interface WalletMenuEntry {
  key: "lightning" | "arkade" | "evm";
  /** Wallet name, e.g. "Lightning". */
  label: string;
  /** Balance or address when connected, otherwise a hint to connect. */
  detail: string;
  connected: boolean;
  icon: ReactNode;
  onSelect: () => void;
}

export interface WalletMenuOptions {
  showNwc: boolean;
  showArkade: boolean;
  showEvm: boolean;
}

/**
 * Collects every external wallet the app can talk to into one list, so the
 * header can render a single dropdown instead of one button per wallet.
 * Returns the menu entries plus the dialogs they open; the dialogs must be
 * rendered outside any dropdown content so they survive the menu closing.
 */
export function useWalletMenu({
  showNwc,
  showArkade,
  showEvm,
}: WalletMenuOptions) {
  const { open: openAppKit } = useAppKit();
  const { isConnected: isEvmConnected, address: evmAddress } = useAccount();
  const { isConnected: isNwcConnected, balanceSats: nwcBalanceSats } = useNwc();
  const {
    isConnected: isArkadeConnected,
    address: arkadeAddress,
    balanceSats: arkadeBalanceSats,
  } = useArkadeWallet();
  const [nwcOpen, setNwcOpen] = useState(false);
  const [arkadeOpen, setArkadeOpen] = useState(false);

  const entries: WalletMenuEntry[] = [];

  if (showNwc) {
    entries.push({
      key: "lightning",
      label: "Lightning",
      detail: isNwcConnected
        ? nwcBalanceSats !== null
          ? `${nwcBalanceSats.toLocaleString()} sats`
          : "Connected"
        : "Connect via NWC",
      connected: isNwcConnected,
      icon: (
        <Zap
          className={
            isNwcConnected
              ? "fill-yellow-500 text-yellow-500"
              : "text-muted-foreground"
          }
        />
      ),
      onSelect: () => setNwcOpen(true),
    });
  }

  if (showArkade) {
    const connected = isArkadeConnected && !!arkadeAddress;
    entries.push({
      key: "arkade",
      label: "Arkade",
      detail: connected
        ? arkadeBalanceSats !== null
          ? `${arkadeBalanceSats.toLocaleString()} sats`
          : truncateArkadeAddress(arkadeAddress)
        : "Connect Inscrib3",
      connected,
      icon: (
        <Wallet
          className={connected ? "text-lime-500" : "text-muted-foreground"}
        />
      ),
      onSelect: () => setArkadeOpen(true),
    });
  }

  if (showEvm) {
    const connected = isEvmConnected && !!evmAddress;
    entries.push({
      key: "evm",
      label: "EVM",
      detail: connected
        ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}`
        : "Connect via WalletConnect",
      connected,
      icon: (
        <Wallet
          className={connected ? "text-blue-500" : "text-muted-foreground"}
        />
      ),
      onSelect: () => openAppKit().catch(console.error),
    });
  }

  const dialogs = (
    <>
      {showNwc && <NwcConnectDialog open={nwcOpen} onOpenChange={setNwcOpen} />}
      {showArkade && (
        <ArkadeWalletDialog open={arkadeOpen} onOpenChange={setArkadeOpen} />
      )}
    </>
  );

  return { entries, dialogs };
}

/** One row per wallet; shared by the desktop dropdown and the mobile menu. */
export function WalletMenuItems({ entries }: { entries: WalletMenuEntry[] }) {
  return (
    <>
      {entries.map((entry) => (
        <DropdownMenuItem
          key={entry.key}
          onClick={entry.onSelect}
          className="gap-3 py-2"
        >
          {entry.icon}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">{entry.label}</span>
            <span
              className={`truncate text-xs ${entry.connected ? "font-mono text-foreground/80" : "text-muted-foreground"}`}
            >
              {entry.detail}
            </span>
          </div>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${entry.connected ? "bg-lime-500" : "bg-muted-foreground/30"}`}
            title={entry.connected ? "Connected" : "Not connected"}
            aria-hidden="true"
          />
        </DropdownMenuItem>
      ))}
    </>
  );
}

/**
 * Desktop header control: a single wallet button that opens the list. The
 * caller owns `useWalletMenu` and renders its dialogs once.
 */
export function WalletMenu({ entries }: { entries: WalletMenuEntry[] }) {
  if (entries.length === 0) return null;

  const connected = entries.filter((e) => e.connected);
  const triggerLabel =
    connected.length === 0
      ? "Connect wallet"
      : connected.length === 1
        ? connected[0].detail
        : `${connected.length} wallets`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 gap-1.5 ${connected.length > 0 ? "border-lime-500/40" : ""}`}
        >
          <Wallet className="h-3.5 w-3.5" />
          <span className={connected.length === 1 ? "font-mono" : ""}>
            {triggerLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground">
          Wallets
        </DropdownMenuLabel>
        <WalletMenuItems entries={entries} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
