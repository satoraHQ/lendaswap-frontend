import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import {
  arbitrum,
  avalanche,
  base,
  hyperEvm,
  ink,
  linea,
  mainnet,
  monad,
  optimism,
  polygon,
  sei,
  solana,
  sonic,
  unichain,
  worldchain,
} from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { WagmiProvider } from "wagmi";
import App from "./app/App";
import { NwcProvider } from "./app/NwcContext";
import { ThemeProvider } from "./app/utils/theme-provider";
import { WalletBridgeProvider } from "./app/WalletBridgeContext";
import { getSpeedWalletParams } from "./utils/speedWallet";

// Capture Speed Wallet params IMMEDIATELY before any routing/redirects happen.
// This persists them to sessionStorage so they survive React Router redirects.
getSpeedWalletParams();

// Allow overriding the RPC URL for a specific chain via env variable.
// e.g. VITE_RPC_OVERRIDE_CHAIN_ID=137 VITE_RPC_OVERRIDE_URL=http://localhost:8545
// Native source chains (Ethereum/Polygon/Arbitrum) first; the rest are
// CCTPv2-only source chains enabled for the any-chain-USDC → BTC flow so
// wagmi can both read USDC balances and drive depositForBurn txs there.
const networks = [
  mainnet,
  polygon,
  arbitrum,
  base,
  optimism,
  linea,
  avalanche,
  unichain,
  worldchain,
  sonic,
  ink,
  sei,
  hyperEvm,
  monad,
];
const projectId = "a15c535db177c184c98bdbdc5ff12590";
const rpcOverrideChainId = import.meta.env.VITE_RPC_OVERRIDE_CHAIN_ID;
const rpcOverrideUrl = import.meta.env.VITE_RPC_OVERRIDE_URL;

const transports: Record<number, ReturnType<typeof http>> = {};
if (rpcOverrideChainId && rpcOverrideUrl) {
  transports[Number(rpcOverrideChainId)] = http(rpcOverrideUrl);
}

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
  transports,
});

// Solana adapter — surfaces Phantom / Solflare / Backpack / etc. in the
// same connect modal as EVM wallets. Used for read-only auto-fill of the
// destination address on outbound CCTP-to-Solana swaps; no signing happens
// on Solana, so we don't pass any RPC config beyond AppKit's defaults.
const solanaAdapter = new SolanaAdapter();

createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  networks: [networks[0], ...networks.slice(1), solana],
  projectId,
  metadata: {
    name: "Satora",
    description: "Lightning-Fast Bitcoin Atomic Swaps",
    url: window.location.origin,
    icons: [],
  },
  enableCoinbase: false,
  features: {
    analytics: false,
    swaps: false,
    onramp: false,
    email: false,
    socials: false,
  },
});

const queryClient = new QueryClient();

// @ts-expect-error
const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <StrictMode>
    <BrowserRouter>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <Theme>
            <ThemeProvider>
              <WalletBridgeProvider>
                <NwcProvider>
                  <App />
                </NwcProvider>
              </WalletBridgeProvider>
            </ThemeProvider>
          </Theme>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  </StrictMode>,
);
