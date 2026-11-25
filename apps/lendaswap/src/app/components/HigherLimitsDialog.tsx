import { Mail } from "lucide-react";
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

export interface HigherLimitsRequest {
  requestedSats: number;
  maximumSats: number;
  route: string;
}

export function HigherLimitsDialog({
  requestedSats,
  maximumSats,
  route,
  initiallyOpen = false,
}: HigherLimitsRequest & { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const sats = (value: number) => `${value.toLocaleString("en-US")} sats`;
  const body = `Hi Satora team,

I'd like to request a higher payment limit.

Route: ${route}
Requested amount (BTC equivalent, including applicable fees): ${sats(requestedSats)}
Current maximum: ${sats(maximumSats)}

My expected payment size and frequency:
`;
  const href = `mailto:support@satora.io?subject=${encodeURIComponent("Request higher payment limits")}&body=${encodeURIComponent(body)}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-sm underline underline-offset-4">
          Request higher limits
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Need a higher limit?</DialogTitle>
          <DialogDescription>
            This amount exceeds the current limit. Contact us to discuss a
            higher limit for your payments.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 rounded-xl bg-muted p-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Requested (BTC equivalent)</dt>
            <dd>{sats(requestedSats)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Current maximum</dt>
            <dd>{sats(maximumSats)}</dd>
          </div>
        </dl>
        <Button asChild>
          <a href={href}>
            <Mail className="mr-2 h-4 w-4" />
            Email Satora
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Opens an email to support@satora.io with the amount and route. Higher
          limits are subject to review.
        </p>
      </DialogContent>
    </Dialog>
  );
}
