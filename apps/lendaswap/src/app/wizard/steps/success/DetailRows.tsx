import {
  AlertCircle,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import {
  getBlockexplorerAddressLink,
  getBlockexplorerTxLink,
} from "../../../utils/tokenUtils";

/** Simple key-value row (Amount Sent, Amount Received, etc.) */
export function AmountRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

/** Transaction hash with copy + block-explorer link. */
export function TxHashRow({
  label,
  txHash,
  chain,
  copiedAddress,
  onCopy,
}: {
  label: string;
  txHash: string;
  chain: string;
  copiedAddress: string | null;
  onCopy: (v: string) => void;
}) {
  const href = getBlockexplorerTxLink(chain, txHash);
  return (
    <div className="border-border flex flex-col gap-2 border-t pt-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 break-all font-mono text-xs hover:underline"
        >
          {txHash}
        </a>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onCopy(txHash)}
            className="h-8 w-8"
          >
            {copiedAddress === txHash ? (
              <CheckCheck className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
          <Button size="icon" variant="ghost" asChild className="h-8 w-8">
            <a href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Address with copy + block-explorer link. */
export function AddressRow({
  label,
  address,
  chain,
  noLink,
  copiedAddress,
  onCopy,
}: {
  label: string;
  address: string;
  chain: string;
  noLink?: boolean;
  copiedAddress: string | null;
  onCopy: (v: string) => void;
}) {
  const href = getBlockexplorerAddressLink(chain, address);
  return (
    <div className="border-border flex flex-col gap-2 border-t pt-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {noLink ? (
          <span className="flex-1 break-all font-mono text-xs">{address}</span>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 break-all font-mono text-xs hover:underline"
          >
            {address}
          </a>
        )}
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onCopy(address)}
            className="h-8 w-8"
          >
            {copiedAddress === address ? (
              <CheckCheck className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
          {!noLink && (
            <Button size="icon" variant="ghost" asChild className="h-8 w-8">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Cross-chain transfer status badge row. */
export function CrossChainStatusRow({
  status,
  statusText,
  description,
}: {
  status: "pending" | "complete" | "error";
  statusText: string;
  description: ReactNode;
}) {
  return (
    <>
      <div className="border-border flex items-center justify-between border-t pt-2 text-sm">
        <span className="text-muted-foreground">Cross-chain Transfer</span>
        {status === "complete" ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
            <Check className="h-3.5 w-3.5" />
            Delivered
          </span>
        ) : status === "error" ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            Error
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {statusText}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
    </>
  );
}
