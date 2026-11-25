import { useState } from "react";
import { api } from "../api";
import { type PayBackup, validatePayBackup } from "../utils/payBackup";

export function PayBackupImport() {
  const [backup, setBackup] = useState<PayBackup>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground underline underline-offset-4">
        Recover a payment from backup
      </summary>
      <div className="mt-3 max-w-xl space-y-3 rounded-xl border bg-card p-4">
        <p>
          Choose your Satora Pay recovery JSON. The file stays in this browser.
          Restoring resumes payment processing, including automatic claims when
          ready.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          aria-label="Payment recovery backup"
          onChange={async (e) => {
            setBackup(undefined);
            setError("");
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2_000_000) {
              setError("Backup file is too large (maximum 2 MB).");
              return;
            }
            try {
              setBackup(validatePayBackup(JSON.parse(await file.text())));
            } catch (err) {
              setError(
                err instanceof SyntaxError
                  ? "This file is not valid JSON."
                  : err instanceof Error
                    ? err.message
                    : "Could not read backup.",
              );
            }
            e.target.value = "";
          }}
        />
        {backup && (
          <>
            <p className="break-all">
              Payment {backup.swap.swapId} ·{" "}
              {backup.swap.bitcoinPayout!.recipients.length} recipients ·{" "}
              {backup.network}
            </p>
            <ul className="max-h-48 space-y-2 overflow-auto">
              {backup.swap.bitcoinPayout!.recipients.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Read-only payment outputs retain their committed order, including duplicate recipients.
                <li key={i} className="break-all">
                  <span className="font-medium">
                    {backup.recipientNames[i] || `Recipient ${i + 1}`} · at
                    least {(Number(r.amountSats) / 1e8).toFixed(8)} BTC
                  </span>
                  <br />
                  <span className="font-mono text-xs">{r.address}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              This restores the backup’s wallet seed. A different wallet with
              saved payments will not be overwritten.
            </p>
            <button
              type="button"
              disabled={busy}
              className="rounded-full bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-50"
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const id = await api.importPayBackup(backup);
                  window.location.assign(`/pay/${id}`);
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Recovery failed.",
                  );
                  setBusy(false);
                }
              }}
            >
              {busy ? "Restoring…" : "Restore payment"}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
