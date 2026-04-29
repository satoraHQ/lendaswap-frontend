import { AlertTriangle, Download } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { api } from "../api";

interface FirstTimeBackupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

const STORAGE_KEY = "seedphraseBackupAcknowledged";

export function FirstTimeBackupModal({
  open,
  onOpenChange,
  onContinue,
}: FirstTimeBackupModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadBackupPhrase = async () => {
    setIsDownloading(true);
    try {
      const mnemonic = await api.getMnemonic();

      if (!mnemonic) {
        console.error("Mnemonic failed to download");
        return;
      }

      // Create a blob with the mnemonic
      const blob = new Blob([mnemonic], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      // Create a temporary link and trigger download
      const link = document.createElement("a");
      link.href = url;
      link.download = `satora-phrase-${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download mnemonic:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSkip = () => {
    // Set localStorage flag
    localStorage.setItem(STORAGE_KEY, "true");
    onOpenChange(false);
    onContinue();
  };

  const handleContinue = () => {
    if (dontShowAgain) {
      // Set localStorage flag
      localStorage.setItem(STORAGE_KEY, "true");
    }
    onOpenChange(false);
    onContinue();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Back Up Your Recovery Phrase</DialogTitle>
          </div>
          <DialogDescription>
            Before making your first swap, we strongly recommend backing up your
            recovery phrase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Your recovery phrase is the <strong>only way</strong> to access
              your funds if you:
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>Lose this device</li>
                <li>Clear your browser data</li>
                <li>Switch to a different browser</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Button
              onClick={handleDownloadBackupPhrase}
              variant="outline"
              className="w-full"
              disabled={isDownloading}
            >
              <Download className="h-4 w-4 mr-2" />
              {isDownloading ? "Downloading..." : "Download Recovery Phrase"}
            </Button>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="dont-show-again"
                checked={dontShowAgain}
                onCheckedChange={(checked) =>
                  setDontShowAgain(checked as boolean)
                }
              />
              <Label
                htmlFor="dont-show-again"
                className="text-sm font-normal cursor-pointer"
              >
                Don't show this again
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="w-full sm:w-auto"
          >
            Skip for Now
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!dontShowAgain}
            className="w-full sm:w-auto"
          >
            Continue to Swap
          </Button>
        </DialogFooter>

        <p className="text-xs text-muted-foreground text-center px-6 pb-2">
          You can always back up your recovery phrase later from the key icon in
          the header.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// Helper function to check if user has acknowledged backup
export function hasAcknowledgedBackup(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

// Helper function to reset the flag (for testing)
export function resetBackupAcknowledgement(): void {
  localStorage.removeItem(STORAGE_KEY);
}
