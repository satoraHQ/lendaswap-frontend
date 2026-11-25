import { useState } from "react";
import { useLocation } from "react-router";
import { api } from "../api";
import { downloadPayBackup } from "../utils/payBackup";

export function PayBackupDownload({ swapId }: { swapId: string }) {
  const [busy, setBusy] = useState(false);
  const { state } = useLocation();
  const [error, setError] = useState(
    state?.backupFailed
      ? "The automatic backup failed. Download it here before funding."
      : "",
  );
  return (
    <div className="space-y-2 text-sm">
      <button
        type="button"
        disabled={busy}
        className="underline underline-offset-4 disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            downloadPayBackup(await api.exportPayBackup(swapId));
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not create a complete backup. Please try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing backup…" : "Download recovery backup"}
      </button>
      <p className="text-xs text-muted-foreground">
        Contains your wallet seed and payment keys. Anyone with this file can
        access funds controlled by this browser wallet. Keep it private.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
