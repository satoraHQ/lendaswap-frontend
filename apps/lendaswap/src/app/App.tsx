import { useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import "../assets/styles.css";
import { ArrowLeftRight, Zap } from "lucide-react";
import { Card } from "#/components/ui/card";
import isValidSpeedWalletContext from "../utils/speedWallet";
import { api } from "./api";
import { AppHeader } from "./components/AppHeader";
import { BackupMnemonicDialog } from "./components/BackupMnemonicDialog";
import { ChatwootWidget } from "./components/ChatwootWidget";
import { DebugNavigation } from "./components/DebugNavigation";
import { ImportMnemonicDialog } from "./components/ImportMnemonicDialog";
import { LandingSection } from "./components/LandingSection";
import { HomePage } from "./HomePage";
import { RefundPage, SwapsPage, TermsOfServicePage, TrackPage } from "./pages";
import { SwapWizardPage } from "./wizard";

/** Redirect `/` to the default pair, preserving query params like `?ref=`. */
function DefaultRedirect() {
  const location = useLocation();
  return (
    <Navigate to={`/lightning:BTC/polygon:USDC${location.search}`} replace />
  );
}

// Get step title and description based on current route
function useStepInfo() {
  const location = useLocation();
  const isSpeedWallet = isValidSpeedWalletContext();

  // Check if on home page (token pair route like /btc_lightning/usdc_pol)
  const isHomePage =
    location.pathname === "/" || /^\/[^/]+\/[^/]+$/.test(location.pathname);

  if (isHomePage) {
    return {
      title: isSpeedWallet
        ? "⚡ Lightning-fast Bitcoin to Stablecoins"
        : "Lightning-fast Bitcoin to Stablecoins",
      description: "",
      isHomePage: true,
    };
  } else if (location.pathname.includes("/send")) {
    return {
      title: "Send Bitcoin",
      description: "Use one of the addresses below",
    };
  } else if (location.pathname.includes("/processing")) {
    return {
      title: "Processing Swap",
      description: "Please wait while we process your transaction",
    };
  } else if (location.pathname.includes("/success")) {
    return {
      title: "Swap Complete",
      description: "Your swap has been completed successfully",
    };
  } else if (location.pathname === "/swaps") {
    return {
      title: "Your Swaps",
      description: "View and manage all your swaps",
    };
  } else if (location.pathname.startsWith("/track")) {
    return {
      title: "Track Swap",
      description: "Check the status and transactions of any swap",
    };
  } else if (location.pathname.includes("/manage/")) {
    return {
      title: "Manage Swap",
      description: "View details and refund your swap",
    };
  } else if (location.pathname.includes("/refund")) {
    return {
      title: "Refund Swap",
      description: "Reclaim your funds from an expired swap",
    };
  }

  return {
    title: "",
    description: "",
  };
}

export default function App() {
  const stepInfo = useStepInfo();
  const location = useLocation();
  const navigate = useNavigate();
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Check if on home page (token pair route like /btc_lightning/usdc_pol)
  const isHomePage =
    location.pathname === "/" || /^\/[^/]+\/[^/]+$/.test(location.pathname);

  const handleDownloadSeedphrase = async () => {
    try {
      const mnemonic = await api.getMnemonic();

      if (!mnemonic) {
        console.error("No mnemonic found");
        return;
      }

      // Create a blob with the mnemonic
      const blob = new Blob([mnemonic], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      // Create a temporary link and trigger download
      const link = document.createElement("a");
      link.href = url;
      link.download = `lendaswap-phrase-${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download mnemonic:", error);
    }
  };

  return (
    <div className="bg-background relative min-h-screen overflow-hidden">

      {/* Modern Gradient Glows */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {/* Top Left - Lime Gradient */}
        <div
          className="absolute -left-48 -top-48 h-[600px] w-[600px] opacity-100 dark:opacity-40"
          style={{
            background:
              "radial-gradient(circle at center, rgba(163, 196, 16, 0.08) 0%, rgba(194, 232, 33, 0.05) 25%, rgba(163, 196, 16, 0.03) 50%, transparent 70%)",
            filter: "blur(100px)",
            mixBlendMode: "screen",
          }}
        />

        {/* Bottom Right - Lime Gradient */}
        <div
          className="absolute -bottom-40 -right-40 h-[550px] w-[550px] opacity-100 dark:opacity-40"
          style={{
            background:
              "radial-gradient(circle at center, rgba(163, 196, 16, 0.07) 0%, rgba(194, 232, 33, 0.04) 30%, rgba(163, 196, 16, 0.03) 50%, transparent 68%)",
            filter: "blur(110px)",
            mixBlendMode: "screen",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <AppHeader
          onBackupOpen={() => setBackupDialogOpen(true)}
          onImportOpen={() => setImportDialogOpen(true)}
          onDownloadSeedphrase={handleDownloadSeedphrase}
        />

        {/* Terms of Service - rendered outside constrained layout */}
        {location.pathname === "/terms" && <TermsOfServicePage />}

        {/* Main Content */}
        {location.pathname !== "/terms" && (
          <main className="container mx-auto px-4 py-16 sm:px-5 md:px-6">
            <div className="mx-auto max-w-2xl space-y-10">
              {/* Title */}
              <div className="text-center">
                {stepInfo.isHomePage ? (
                  <div className="space-y-1">
                    <div className="text-muted-foreground/60 flex items-center justify-center gap-1.5">
                      <Zap className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      <span className="font-sans text-xs font-semibold uppercase tracking-widest md:text-sm">
                        Lightning-fast
                      </span>
                    </div>
                    <h1 className="from-foreground to-foreground/40 flex items-center justify-center gap-2 bg-gradient-to-b bg-clip-text font-sans text-xl font-bold tracking-tight text-transparent md:gap-3 md:text-3xl">
                      <span>Bitcoin</span>
                      <ArrowLeftRight className="text-muted-foreground/30 h-4 w-4 md:h-6 md:w-6" />
                      <span>Stablecoins</span>
                    </h1>
                  </div>
                ) : (
                  <h2 className="font-sans text-2xl font-bold leading-snug tracking-tight md:text-4xl">
                    {stepInfo.title}
                  </h2>
                )}
                {stepInfo.description && (
                  <p className="text-muted-foreground mt-2">
                    {stepInfo.description}
                  </p>
                )}
              </div>

              {/* Step Card */}
              <div className="mx-auto max-w-lg">
                <Routes>
                  <Route
                    path="/swap/:swapId/wizard"
                    element={<SwapWizardPage />}
                  />
                  <Route path="/swap/:swapId/refund" element={<RefundPage />} />
                  <Route
                    path="*"
                    element={
                      <div className="group relative">
                        {/* Lime glow effect on hover */}
                        <div className="group-hover:via-lime-400/8 absolute -inset-1 rounded-[28px] bg-gradient-to-br from-lime-400/0 via-lime-400/0 to-lime-400/0 opacity-0 blur-xl transition-all duration-500 group-hover:from-lime-400/10 group-hover:to-lime-400/10 group-hover:opacity-100" />
                        <Card className="border-border from-card via-card relative !gap-0 rounded-3xl border bg-gradient-to-br to-lime-400/5 !py-0 shadow-sm">
                          <Routes>
                            <Route path="/" element={<DefaultRedirect />} />
                            <Route
                              path="/:sourceToken/:targetToken"
                              element={<HomePage />}
                            />
                            <Route path="/swaps" element={<SwapsPage />} />
                            <Route path="/track" element={<TrackPage />} />
                            <Route
                              path="/track/:swapId/*"
                              element={<TrackPage />}
                            />
                          </Routes>
                        </Card>
                      </div>
                    }
                  />
                </Routes>
              </div>
            </div>

            {/* Stats, Features & FAQ - Only show on home page */}
            {isHomePage && <LandingSection />}
          </main>
        )}

        {/* Footer */}
        <footer className="mt-16 border-t">
          <div className="container mx-auto px-6 py-6">
            {/* Debug Navigation */}
            <DebugNavigation />

            <div className="text-muted-foreground space-y-2 text-center text-sm">
              <p>© 2026 LendaSwap. All rights reserved.</p>
              <p>
                <button
                  type="button"
                  onClick={() => navigate("/terms")}
                  className="hover:text-foreground underline transition-colors"
                >
                  Terms of Service
                </button>
              </p>
            </div>
          </div>
        </footer>

        {/* Wallet Management Dialogs */}
        <BackupMnemonicDialog
          open={backupDialogOpen}
          onOpenChange={setBackupDialogOpen}
        />
        <ImportMnemonicDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImportSuccess={() => {
            // Optionally refresh the page or show a success message
            window.location.reload();
          }}
        />
      </div>

      <ChatwootWidget />
    </div>
  );
}
