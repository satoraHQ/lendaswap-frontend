import { useLocation, useNavigate } from "react-router";
import { Button } from "#/components/ui/button";
import { DEBUG_SWAP_ID, isDebugMode } from "../utils/debugMode";

const STEP_TABS = [
  { label: "Enter Amount", step: null },
  { label: "Send", step: "pending" },
  { label: "Processing", step: "clientfunded" },
  { label: "Success", step: "serverredeemed" },
] as const;

const DIRECTION_TABS = [
  { label: "⚡ → EVM", direction: "lightning-to-evm" },
  { label: "Ark → EVM", direction: "arkade-to-evm" },
  { label: "On-chain → EVM", direction: "onchain-to-evm" },
  { label: "On-chain → Ark", direction: "onchain-to-arkade" },
  { label: "EVM → ⚡", direction: "evm-to-lightning" },
  { label: "EVM → Ark", direction: "evm-to-arkade" },
] as const;

export function DebugNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  if (!isDebugMode()) {
    return null;
  }

  const params = new URLSearchParams(location.search);
  const currentStep = params.get("step");
  const currentDirection = params.get("direction") || "lightning-to-evm";
  const isWizardPage = location.pathname.includes(
    `/swap/${DEBUG_SWAP_ID}/wizard`,
  );

  const buildUrl = (step: string | null, direction?: string) => {
    if (!step) return "/";
    const dir = direction || currentDirection;
    return `/swap/${DEBUG_SWAP_ID}/wizard?step=${step}&direction=${dir}`;
  };

  return (
    <div className="mb-6 flex flex-col items-center gap-2.5 border-t border-lime-400/30 bg-lime-400/5 px-4 py-3 rounded-lg">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-lime-400" />
        <span className="text-xs font-semibold text-lime-600 dark:text-lime-300 uppercase tracking-wider">
          Debug Mode
        </span>
      </div>

      {/* Step tabs */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {STEP_TABS.map((tab) => {
          const isActive =
            tab.step === null ? !isWizardPage : currentStep === tab.step;
          return (
            <Button
              key={tab.label}
              size="sm"
              variant={isActive ? "default" : "outline"}
              onClick={() => navigate(buildUrl(tab.step))}
              className="h-7 text-[11px] px-2.5"
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Direction tabs - only show on wizard pages */}
      {isWizardPage && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {DIRECTION_TABS.map((tab) => {
            const isActive = currentDirection === tab.direction;
            return (
              <Button
                key={tab.direction}
                size="sm"
                variant={isActive ? "default" : "ghost"}
                onClick={() => navigate(buildUrl(currentStep, tab.direction))}
                className={`h-6 text-[10px] px-2 ${isActive ? "" : "text-muted-foreground"}`}
              >
                {tab.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
