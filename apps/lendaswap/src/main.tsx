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
  xdc,
} from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fallback, http, type Transport } from "viem";
import { unstable_connector, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import App from "./app/App";
import { NwcProvider } from "./app/NwcContext";
import { buildTransport } from "./app/utils/evmTransport";
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
  xdc,
];
const projectId = "a15c535db177c184c98bdbdc5ff12590";
const rpcOverrideChainId = import.meta.env.VITE_RPC_OVERRIDE_CHAIN_ID;
const rpcOverrideUrl = import.meta.env.VITE_RPC_OVERRIDE_URL;

const transports: Record<number, Transport> = {};
// Wallet-first reads: when an injected wallet is connected and on the chain,
// requests ride ITS provider (MetaMask's Infura etc.) — an RPC allowance the
// user already has, immune to our public endpoints rate-limiting us (e.g.
// publicnode 403s). Anything the connector can't serve — no wallet, WalletConnect
// mobile, wallet on another chain — falls through to the public-RPC list
// (buildTransport; chains without a curated list use the network's default).
// The env override below still wins outright for its chain (local anvil).
for (const chain of networks) {
  transports[Number(chain.id)] = fallback([
    unstable_connector(injected),
    buildTransport(chain),
  ]);
}
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
