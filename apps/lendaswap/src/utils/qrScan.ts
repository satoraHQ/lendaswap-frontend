/** True when the browser exposes a camera API (secure context required). */
export function hasCameraApi(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/**
 * QR codes commonly carry bech32 payloads in all-caps (BOLT11, LNURL,
 * bc1/tb1 addresses, ark1/tark1) because alphanumeric mode encodes smaller.
 * Downstream validators/decoders expect lowercase, so normalise those. Never
 * touch mixed-case strings: EVM checksums and Solana base58 are case-sensitive.
 */
export function normalizeScannedText(raw: string): string {
  const text = raw.trim();
  if (text !== text.toUpperCase()) return text;

  const match = /^(?:(bitcoin|lightning|ark):)?(.*)$/i.exec(text);
  if (!match) return text;
  const scheme = match[1];
  const rest = match[2];

  const looksBech32 = /^(ln(bc|tb|bcrt)|lnurl1|bc1|tb1|bcrt1|ark1|tark1)/i.test(
    rest,
  );
  // Query params (amount=, lightning=, ark=) are bech32/numeric too, so
  // lowercasing the whole thing is safe once the address part is bech32.
  if (looksBech32) return text.toLowerCase();
  // Base58 (legacy BTC, Solana) is case-sensitive: only normalise the scheme.
  if (scheme) return `${scheme.toLowerCase()}:${rest}`;
  return text;
}
