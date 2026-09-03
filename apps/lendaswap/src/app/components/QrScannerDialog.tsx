import { Loader2, ScanLine } from "lucide-react";
import QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once with the decoded QR payload. The dialog closes itself. */
  onScan: (data: string) => void;
}

function describeCameraError(err: unknown): string {
  const name =
    err instanceof DOMException || err instanceof Error ? err.name : "";
  const message =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : String(err ?? "");

  if (name === "NotAllowedError" || /permission|denied/i.test(message)) {
    return "Camera access was denied. Allow camera access in your browser settings and try again.";
  }
  if (name === "NotFoundError" || /not found|no camera/i.test(message)) {
    return "No camera found on this device.";
  }
  if (name === "NotReadableError" || /in use|could not start/i.test(message)) {
    return "The camera is in use by another application.";
  }
  return message || "Could not start the camera.";
}

export function QrScannerDialog({
  open,
  onOpenChange,
  onScan,
}: QrScannerDialogProps) {
  // Callback ref → state: DialogContent is portalled and mounts a render
  // after `open` flips, so a plain ref is still null when the effect runs.
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Keep the latest callbacks in refs so the scanner effect only re-runs on
  // open/close, not on every parent render.
  const onScanRef = useRef(onScan);
  const onOpenChangeRef = useRef(onOpenChange);
  onScanRef.current = onScan;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open || !video) return;

    let disposed = false;
    let scanned = false;
    setError(null);
    setStarting(true);

    const scanner = new QrScanner(
      video,
      (result) => {
        if (scanned || disposed) return;
        scanned = true;
        scanner.stop();
        onScanRef.current(result.data);
        onOpenChangeRef.current(false);
      },
      {
        returnDetailedScanResult: true,
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 10,
      },
    );

    scanner
      .start()
      .catch((err: unknown) => {
        if (disposed) return;
        setError(describeCameraError(err));
      })
      .finally(() => {
        if (!disposed) setStarting(false);
      });

    return () => {
      disposed = true;
      scanner.stop();
      scanner.destroy();
    };
  }, [open, video]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Scan QR code
          </DialogTitle>
          <DialogDescription>
            Point your camera at a QR code containing the receive address or
            invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
          <video
            ref={setVideo}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
