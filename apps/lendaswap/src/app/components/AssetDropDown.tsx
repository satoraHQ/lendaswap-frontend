import {
  isArbitrumToken,
  isBaseToken,
  isBridgeOnlyChain,
  isBtc,
  isEthereumToken,
  isOptimismToken,
  isPolygonToken,
  isSolanaToken,
  type TokenInfo,
  toChainName,
} from "@lendasat/lendaswap-sdk-pure";
import NetworkBase from "@web3icons/react/icons/networks/NetworkBase";
import NetworkOptimism from "@web3icons/react/icons/networks/NetworkOptimism";
import NetworkSolana from "@web3icons/react/icons/networks/NetworkSolana";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { Input } from "#/components/ui/input";
import { ReactComponent as ArbitrumIcon } from "../../assets/arbitrum.svg";
import { ReactComponent as BitcoinIcon } from "../../assets/bitcoin.svg";
import { ReactComponent as EthereumIcon } from "../../assets/eth.svg";
import { ReactComponent as EurIcon } from "../../assets/eure.svg";
import { ReactComponent as PolygonIcon } from "../../assets/polygon.svg";
import { ReactComponent as UsdcIcon } from "../../assets/usdc.svg";
import { ReactComponent as UsdtIcon } from "../../assets/usdt.svg";
import { getTokenIcon } from "../api";
import { getTokenNetworkIcon } from "../utils/tokenUtils";

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

type NetworkTabId =
  | "all"
  | "usdc"
  | "usdt"
  | "eur"
  | "bitcoin"
  | "ethereum"
  | "arbitrum"
  | "polygon"
  | "base"
  | "optimism"
  | "solana"
  | "other";

const networkTabs: {
  id: NetworkTabId;
  label: string;
  icon: React.ReactElement | null;
  filter?: (asset: TokenInfo) => boolean;
}[] = [
  { id: "all", label: "All", icon: null },
  {
    id: "usdc",
    label: "USDC",
    icon: <UsdcIcon width={14} height={14} />,
    filter: (a) => a.symbol === "USDC",
  },
  {
    id: "usdt",
    label: "USDT",
    icon: <UsdtIcon width={14} height={14} />,
    filter: (a) => a.symbol === "USDT" || a.symbol === "USDT0",
  },
  {
    id: "eur",
    label: "EUR",
    icon: <EurIcon width={14} height={14} />,
    filter: (a) => a.symbol === "EURe" || a.symbol === "EURC",
  },
  {
    id: "bitcoin",
    label: "Bitcoin",
    icon: <BitcoinIcon width={14} height={14} />,
    filter: (a) => isBtc(a),
  },
  {
    id: "ethereum",
    label: "Ethereum",
    icon: <EthereumIcon width={14} height={14} />,
    filter: (a) => isEthereumToken(a.chain),
  },
  {
    id: "arbitrum",
    label: "Arbitrum",
    icon: <ArbitrumIcon width={14} height={14} />,
    filter: (a) => isArbitrumToken(a.chain),
  },
  {
    id: "polygon",
    label: "Polygon",
    icon: <PolygonIcon width={14} height={14} />,
    filter: (a) => isPolygonToken(a.chain),
  },
  {
    id: "base",
    label: "Base",
    icon: <NetworkBase variant="branded" size={14} />,
    filter: (a) => isBaseToken(a.chain),
  },
  {
    id: "optimism",
    label: "Optimism",
    icon: <NetworkOptimism variant="branded" size={14} />,
    filter: (a) => isOptimismToken(a.chain),
  },
  {
    id: "solana",
    label: "Solana",
    icon: <NetworkSolana variant="branded" size={14} />,
    filter: (a) => isSolanaToken(a.chain),
  },
  {
    id: "other",
    label: "Other",
    icon: null,
    filter: (a) =>
      isBridgeOnlyChain(a.chain) &&
      !isBaseToken(a.chain) &&
      !isOptimismToken(a.chain) &&
      !isSolanaToken(a.chain),
  },
];

interface AssetDropDownProps {
  value: TokenInfo | undefined;
  onChange: (selectedAsset: TokenInfo) => void;
  availableAssets: TokenInfo[];
  label?: "sell" | "buy";
}

export function AssetDropDown({
  value,
  onChange,
  availableAssets,
  label = "sell",
}: AssetDropDownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<NetworkTabId>("all");
  const isMobile = useIsMobile();

  const selectedAsset = value;

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedTab("all");
    }
  }, [open]);

  const handleSelect = (asset: TokenInfo) => {
    onChange(asset);
    setOpen(false);
  };

  // Only show tabs that have at least 1 token in availableAssets
  const visibleTabs = useMemo(
    () =>
      networkTabs.filter(
        (tab) =>
          tab.id === "all" || availableAssets.some((a) => tab.filter?.(a)),
      ),
    [availableAssets],
  );

  // Combined filter: tab + search
  const filteredAssets = useMemo(() => {
    return availableAssets.filter((asset) => {
      // Tab filter
      const tab = networkTabs.find((t) => t.id === selectedTab);
      if (tab?.filter && !tab.filter(asset)) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const symbol = asset.symbol.toLowerCase();
        const network = asset.chain.toLowerCase();
        return (
          asset.toString().toLowerCase().includes(query) ||
          symbol.includes(query) ||
          network.includes(query)
        );
      }
      return true;
    });
  }, [availableAssets, selectedTab, searchQuery]);

  // Shared content for both Dialog and Drawer
  const tokenListContent = (
    <div className="overflow-hidden">
      {/* Network Tabs */}
      {visibleTabs.length > 2 && (
        <div className="px-5 pt-4 pb-2">
          <div className="flex gap-2 flex-wrap">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedTab === tab.id
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {tab.icon && (
                  <span className="flex items-center">{tab.icon}</span>
                )}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="px-5 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or network"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-2xl bg-muted border-0 focus-visible:ring-1 focus-visible:ring-border"
            autoFocus={!isMobile}
          />
        </div>
      </div>

      {/* Token List */}
      <div className="overflow-y-auto max-h-[50vh] px-3 pb-6 pt-1 scrollbar-thin">
        {filteredAssets.length > 0 ? (
          <div className="space-y-0.5">
            {filteredAssets.map((asset) => (
              <button
                key={`${asset.chain}:${asset.token_id}`}
                type="button"
                onClick={() => handleSelect(asset)}
                className="flex items-center gap-3 w-full px-2 py-3 rounded-xl hover:bg-muted/70 transition-colors text-left"
              >
                {/* Token Icon with Network Badge */}
                <div className="relative">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-muted border border-border">
                    <div className="w-8 h-8 flex items-center justify-center">
                      {getTokenIcon(asset)}
                    </div>
                  </div>
                  {/* Network badge */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-background p-[1px] flex items-center justify-center">
                    <div className="w-full h-full rounded-full flex items-center justify-center [&_svg]:w-full [&_svg]:h-full">
                      {getTokenNetworkIcon(asset)}
                    </div>
                  </div>
                </div>

                {/* Token Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{asset.symbol}</div>
                  <div className="text-sm text-muted-foreground">
                    {toChainName(asset.chain)}
                  </div>
                </div>

                {/* Selected Check */}
                {selectedAsset === asset && (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No currencies found
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 md:gap-2 pl-1.5 pr-2 py-1 md:pl-2 md:pr-3 md:py-1.5 rounded-full bg-background hover:bg-background/70 transition-colors"
      >
        {/* Token icon with network badge */}
        <div className="relative">
          <div className="w-6 h-6 md:w-7 md:h-7 rounded-full overflow-hidden flex items-center justify-center">
            {selectedAsset && getTokenIcon(selectedAsset)}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-background p-[1px] flex items-center justify-center">
            <div className="w-full h-full rounded-full flex items-center justify-center [&_svg]:w-full [&_svg]:h-full">
              {selectedAsset && getTokenNetworkIcon(selectedAsset)}
            </div>
          </div>
        </div>
        <span className="font-semibold text-sm md:text-base leading-tight">
          {selectedAsset?.symbol}
        </span>
        <ChevronDown className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
      </button>

      {/* Mobile: Bottom Sheet Drawer */}
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="rounded-t-2xl">
            <DrawerHeader className="px-5 pb-0">
              <DrawerTitle>
                {label === "buy"
                  ? "Select a currency to buy"
                  : "Select a currency to sell"}
              </DrawerTitle>
            </DrawerHeader>
            {tokenListContent}
          </DrawerContent>
        </Drawer>
      ) : (
        /* Desktop: Dialog Modal */
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl [&>button:last-child]:hidden">
            <DialogHeader className="px-5 pt-4 pb-0">
              <DialogTitle>
                {label === "buy"
                  ? "Select a currency to buy"
                  : "Select a currency to sell"}
              </DialogTitle>
            </DialogHeader>
            {tokenListContent}
          </DialogContent>
          <DialogDescription>{/*  empty */}</DialogDescription>
        </Dialog>
      )}
    </>
  );
}
