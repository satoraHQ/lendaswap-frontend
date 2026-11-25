export const payUsd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );

export function PayRecipients({
  recipients,
  names = [],
  usdRate,
}: {
  recipients: { address: string; amountSats: string }[];
  names?: string[];
  usdRate?: number;
}) {
  return (
    <ol className="divide-y rounded-2xl border">
      {recipients.map((r, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: Read-only payment outputs retain their committed order, including duplicate recipients.
          key={i}
          className="flex flex-wrap items-start gap-3 p-4 sm:items-center sm:gap-4"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{names[i] || `Recipient ${i + 1}`}</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {r.address}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-mono text-sm">
              {(Number(r.amountSats) / 1e8).toFixed(8)} BTC
            </p>
            {usdRate !== undefined && (
              <p className="mt-1 text-sm text-muted-foreground">
                ≈ {payUsd((Number(r.amountSats) / 1e8) * usdRate)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
