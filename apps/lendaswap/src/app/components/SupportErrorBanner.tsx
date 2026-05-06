import { AlertCircle, ChevronDown, Mail, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { api } from "../api";

const SUPPORT_EMAIL = "support@satora.io";

/** Error messages the user can resolve themselves - no support needed. */
const KNOWN_ERROR_PATTERNS: Array<{ pattern: RegExp; action: string }> = [
  {
    pattern: /please enter a.*address/i,
    action: "Please enter a valid address above.",
  },
  {
    pattern: /please enter a valid/i,
    action: "Please check the address format and try again.",
  },
  {
    pattern: /locktime has not been reached/i,
    action:
      "The refund locktime hasn't passed yet. Please wait and try again later.",
  },
  {
    pattern: /payment details not available/i,
    action:
      "Payment details are still loading. Please wait a moment and try again.",
  },
  {
    pattern: /please refresh and try again/i,
    action: "Please refresh the page and try again.",
  },
  {
    pattern: /a swap with this invoice exists already/i,
    action:
      "This Lightning invoice has already been used for another swap. Please generate a new invoice and try again.",
  },
];

function getKnownAction(error: string): string | null {
  for (const { pattern, action } of KNOWN_ERROR_PATTERNS) {
    if (pattern.test(error)) return action;
  }
  return null;
}

interface SupportErrorBannerProps {
  /** Short user-facing message (e.g. "Failed to create swap"). */
  message?: string;
  /** Raw error string - included in the support email, NOT shown to the user. */
  error: string;
  /** Swap ID, if available - included in the support email. */
  swapId?: string;
}

function buildMailtoUrl(error: string, swapId?: string, xpub?: string): string {
  const subject = swapId
    ? `Satora Support - Swap ${swapId}`
    : "Satora Support Request";

  const body = [
    swapId && `Swap ID: ${swapId}`,
    xpub && `User xpub: ${xpub}`,
    `Error: ${error}`,
    "",
    "Please describe what happened:",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function SupportErrorBanner({
  message = "Something went wrong",
  error,
  swapId,
}: SupportErrorBannerProps) {
  const [xpub, setXpub] = useState<string>();
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const knownAction = getKnownAction(error);

  useEffect(() => {
    console.error(`Error: ${error}`);
    if (!knownAction) {
      api
        .getUserIdXpub()
        .then(setXpub)
        .catch(() => {});
    }
  }, [knownAction, error]);

  // Known/actionable error - show instruction, no support button
  if (knownAction) {
    return (
      <div className="rounded-xl border border-lime-400/30 bg-lime-50 p-3 flex items-center gap-3 dark:bg-lime-950/20">
        <AlertCircle className="h-4 w-4 shrink-0 text-lime-500" />
        <span className="text-sm text-lime-500">{knownAction}</span>
      </div>
    );
  }

  // Unknown error - show expandable details + support dialog
  return (
    <>
      <Collapsible>
        <div className="bg-destructive/10 border-destructive/20 text-destructive rounded-xl border p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium hover:underline">
              {message}
              <ChevronDown className="h-3.5 w-3.5 transition-transform [[data-state=open]_&]:rotate-180" />
            </CollapsibleTrigger>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs shrink-0"
              onClick={() => setSupportDialogOpen(true)}
            >
              Get Support
            </Button>
          </div>
          <CollapsibleContent>
            <pre className="text-xs text-destructive/70 bg-destructive/5 rounded-lg p-2 mt-1 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {error}
            </pre>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Dialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Get Support</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <a
              href={buildMailtoUrl(error, swapId, xpub)}
              onClick={() => setSupportDialogOpen(false)}
            >
              <Button variant="outline" className="w-full gap-2">
                <Mail className="h-4 w-4" />
                Send Email
              </Button>
            </a>
            {window.$chatwoot && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  setSupportDialogOpen(false);
                  window.$chatwoot?.setConversationCustomAttributes({
                    ...(swapId && { swapId }),
                    error,
                  });
                  window.$chatwoot?.toggle("open");
                }}
              >
                <MessageCircle className="h-4 w-4" />
                Chat with Support
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
