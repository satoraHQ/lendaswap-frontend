import type { TokenInfo } from "@satora/swap";
import { ArrowRight, CheckCheck, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { getTokenIcon, getTokenNetworkIcon } from "../../utils/tokenUtils";
import { useCopyToClipboard } from "./useCopyToClipboard";

function TokenBadge({ token }: { token: TokenInfo }) {
  return (
    <div className="relative">
      <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center bg-muted border border-border">
        <div className="w-5 h-5 flex items-center justify-center">
          {getTokenIcon(token)}
        </div>
      </div>
      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-background p-[1px] flex items-center justify-center">
        <div className="w-full h-full rounded-full flex items-center justify-center [&_svg]:w-full [&_svg]:h-full">
          {getTokenNetworkIcon(token)}
        </div>
      </div>
    </div>
  );
}

interface DepositCardProps {
  sourceToken: TokenInfo;
  targetToken?: TokenInfo;
  swapId: string;
  title?: string;
  children: ReactNode;
}

export function DepositCard({
  sourceToken,
  targetToken,
  swapId,
  title = "Send BTC",
  children,
}: DepositCardProps) {
  const { copiedValue, handleCopy } = useCopyToClipboard();
  const isCopied = copiedValue === swapId;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm shadow-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-2">
          <TokenBadge token={sourceToken} />
          {targetToken && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <TokenBadge token={targetToken} />
            </>
          )}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleCopy(swapId)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Copy Swap ID"
          >
            <code className="text-[10px] font-mono">{swapId.slice(0, 8)}…</code>
            {isCopied ? (
              <CheckCheck className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
          <div className="h-2 w-2 rounded-full bg-primary/50 animate-pulse" />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-5 p-5">{children}</div>
    </div>
  );
}
