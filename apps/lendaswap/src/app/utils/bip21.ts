/**
 * Extract the address we need from user input that may be a BIP21-style URI,
 * e.g. `bitcoin:bc1p…?ark=ark1…&amount=0.001`.
 *
 * - `network: "arkade"` → the `ark` query parameter (unified BIP21), an
 *   `ark:`/`arkade:` URI's own address, or a plain `ark1…` input.
 * - `network: "bitcoin"` → the URI's path address, or the plain input.
 *
 * Returns the trimmed candidate address — validation stays with the caller —
 * or `undefined` when the input is a URI that carries no address for the
 * requested network (e.g. a bitcoin: URI without an `ark` parameter while an
 * Arkade address is needed; falling back to the BTC address there would send
 * a refund to an address of the wrong network).
 */
export function extractRefundAddress(
  input: string,
  network: "arkade" | "bitcoin",
): string | undefined {
  const raw = input.trim();
  if (raw === "") return undefined;
  if (!raw.includes(":")) return raw; // plain address

  let uri: URL;
  try {
    uri = new URL(raw);
  } catch {
    return raw; // not a URI after all — let validation judge it
  }
  const scheme = uri.protocol.replace(/:$/, "").toLowerCase();
  const address = uri.pathname;

  if (network === "arkade") {
    const arkParam = uri.searchParams.get("ark");
    if (arkParam) return arkParam;
    if (scheme === "ark" || scheme === "arkade") return address;
    return undefined;
  }
  // bitcoin: the path address of a bitcoin: URI; other schemes carry none.
  return scheme === "bitcoin" ? address : undefined;
}
