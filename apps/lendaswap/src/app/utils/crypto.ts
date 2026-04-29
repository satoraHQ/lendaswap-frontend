/**
 * Generate a secret and its SHA256 hash for HTLC
 *
 * The secret is a random 32-byte value that will be used by the client
 * to claim the Polygon HTLC. The hash is sent to satora when creating
 * the swap, and is used as the hash lock for both Bitcoin and Polygon HTLCs.
 *
 * @returns Object containing the secret and hashLock, both as hex strings with 0x prefix
 */
export async function generateSecret(): Promise<{
  secret: string;
  hashLock: string;
}> {
  // Generate random 32 bytes for the secret
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);

  // Convert secret to hex string with 0x prefix
  const secret =
    "0x" +
    Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Compute SHA-256 hash of the secret
  const hashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
  const hashBytes = new Uint8Array(hashBuffer);

  // Convert hash to hex string with 0x prefix
  const hashLock =
    "0x" +
    Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return { secret, hashLock };
}

/**
 * Verify that a secret matches its hash lock
 *
 * @param secret - The secret (32-byte hex string with 0x prefix)
 * @param expectedHashLock - The expected hash lock (32-byte hex string with 0x prefix)
 * @returns true if the hash of the secret matches the expected hash lock
 */
export async function verifySecret(
  secret: string,
  expectedHashLock: string,
): Promise<boolean> {
  // Remove 0x prefix and convert to bytes
  const secretBytes = hexToBytes(secret);

  // Compute SHA-256 hash
  const hashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
  const hashBytes = new Uint8Array(hashBuffer);

  // Convert to hex string with 0x prefix
  const computedHash =
    "0x" +
    Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return computedHash === expectedHashLock;
}

/**
 * Convert hex string to Uint8Array
 * @param hex - Hex string with or without 0x prefix
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}
