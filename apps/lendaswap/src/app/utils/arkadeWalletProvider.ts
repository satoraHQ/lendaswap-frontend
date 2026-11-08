/**
 * Inscrib3 Arkade wallet integration primitives.
 *
 * Inscrib3 (https://docs.inscrib3.com) ships an Arkade wallet in two forms:
 *
 * - a browser extension that injects a `window.arkade` provider, and
 * - a web wallet (PWA) at wallet.inscrib3.com that is driven through a popup
 *   and `postMessage`, for browsers without the extension.
 *
 * Both only deal in Arkade addresses: we never use the boarding (on-chain)
 * address or Lightning through them. This module is framework-free so the
 * protocol bits can be unit tested; the React glue lives in
 * `ArkadeWalletContext.tsx`.
 */

import { ArkAddress } from "@arkade-os/sdk";

// ── window.arkade provider types (from docs.inscrib3.com/provider/typescript)

export type ArkadeProviderEvent =
  | "accountsChanged"
  | "accountChanged"
  | "networkChanged"
  | "lock"
  | "unlock";

export interface ArkadeProviderNetworkInfo {
  network: "bitcoin" | "mutinynet" | "custom";
  displayName: string;
  isTestnet: boolean;
  arkServerUrl: string;
  esploraUrl: string;
}

export interface ArkadeProviderBalance {
  available: number;
  total: number;
  vtxo: { confirmed: number; unconfirmed: number; total: number };
  boarding: { confirmed: number; unconfirmed: number; total: number };
}

export interface ArkadeProviderState {
  isConnected: boolean;
  isUnlocked: boolean;
  network: string | null;
  accounts: string[];
}

/** The subset of the injected provider this app uses. */
export interface InjectedArkadeProvider {
  readonly isArkade: true;
  connect(): Promise<string[]>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  getAccounts(): Promise<string[]>;
  getProviderState(): Promise<ArkadeProviderState>;
  getAddress(): Promise<string>;
  getBalance(): Promise<ArkadeProviderBalance>;
  getNetwork(): Promise<ArkadeProviderNetworkInfo>;
  sendToAddress(address: string, amount: number): Promise<string>;
  on(event: ArkadeProviderEvent, callback: (data?: unknown) => void): void;
  off(event: ArkadeProviderEvent, callback: (data?: unknown) => void): void;
}

declare global {
  interface Window {
    arkade?: InjectedArkadeProvider;
  }
}

/** Returns the injected provider if an Arkade extension is present. */
export function getInjectedArkadeProvider(): InjectedArkadeProvider | null {
  if (typeof window === "undefined") return null;
  const candidate = window.arkade;
  return candidate?.isArkade === true ? candidate : null;
}

/**
 * The extension injects `window.arkade` asynchronously, so a single check at
 * startup can miss it. Resolves with the provider once it appears, or `null`
 * after the retry schedule runs out.
 */
export async function waitForInjectedArkadeProvider(
  delaysMs: readonly number[] = [0, 100, 500, 1500],
): Promise<InjectedArkadeProvider | null> {
  for (const delay of delaysMs) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const provider = getInjectedArkadeProvider();
    if (provider) return provider;
  }
  return null;
}

// ── Amount validation ──────────────────────────────────────────────────────

/** Inscrib3 rejects anything but a positive safe integer number of sats. */
export function isValidSatsAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0;
}

// ── Server check ───────────────────────────────────────────────────────────

/**
 * An Arkade address commits to the server that issues its VTXOs. A wallet on
 * another Arkade server could neither pay our VHTLCs nor receive from our
 * server, so a connected wallet is only usable when its address was issued by
 * the server this app is configured for.
 *
 * @param address - Arkade address reported by the wallet.
 * @param signerPubkeyHex - `signerPubkey` from the Arkade server info. Either
 *   a 33-byte compressed key or a 32-byte x-only key, hex encoded.
 */
export function arkadeAddressMatchesServer(
  address: string,
  signerPubkeyHex: string,
): boolean {
  let decoded: ArkAddress;
  try {
    decoded = ArkAddress.decode(address);
  } catch {
    return false;
  }
  const serverXOnly = toHex(decoded.serverPubKey);
  const normalized = signerPubkeyHex.trim().toLowerCase();
  const expectedXOnly =
    normalized.length === 66 ? normalized.slice(2) : normalized;
  return expectedXOnly.length === 64 && expectedXOnly === serverXOnly;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

// ── PWA popup protocol (docs.inscrib3.com/pwa/popup) ───────────────────────

export const INSCRIB3_PWA_ORIGIN = "https://wallet.inscrib3.com";
export const INSCRIB3_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/inscrib3/hafphignbjdmblopkophkohgnphalclg";

const PWA_WINDOW_NAME = "inscrib3-wallet";
// The PWA identifies the calling app through `window.opener` and the
// referrer, so `noopener` / `noreferrer` must NOT be set here.
const PWA_WINDOW_FEATURES = "width=380,height=640,popup=yes";

type PwaReply =
  | { type: "inscrib3:connect"; accounts?: unknown }
  | { type: "inscrib3:connect_rejected" }
  | { type: "inscrib3:send"; txid?: unknown }
  | { type: "inscrib3:send_failed"; error?: unknown }
  | { type: "inscrib3:send_rejected" };

/**
 * Interprets a reply from the PWA. Returns `undefined` for messages that are
 * not Inscrib3 replies so unrelated `message` events can be ignored.
 */
export function parsePwaReply(data: unknown): PwaReply | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const type = (data as { type?: unknown }).type;
  if (typeof type !== "string" || !type.startsWith("inscrib3:")) {
    return undefined;
  }
  return data as PwaReply;
}

/** Address list from an `inscrib3:connect` reply, invalid entries dropped. */
export function pwaAccountsFromReply(accounts: unknown): string[] {
  if (!Array.isArray(accounts)) return [];
  return accounts.filter((a): a is string => typeof a === "string");
}

export function buildPwaConnectUrl(): string {
  const url = new URL(INSCRIB3_PWA_ORIGIN);
  url.searchParams.set("arkade_connect_origin", "1");
  return url.toString();
}

export function buildPwaSendUrl(address: string, amountSats: number): string {
  const url = new URL(INSCRIB3_PWA_ORIGIN);
  url.searchParams.set("arkade_send_origin", "1");
  url.searchParams.set("arkade_send_address", address);
  url.searchParams.set("arkade_send_amount", String(amountSats));
  return url.toString();
}

/**
 * Opens the PWA popup for `url` and resolves with the first Inscrib3 reply
 * that comes from it. Must be called synchronously from a user gesture, or
 * the browser blocks the popup.
 */
function requestViaPwa(url: string): Promise<PwaReply> {
  const popup = window.open(url, PWA_WINDOW_NAME, PWA_WINDOW_FEATURES);
  if (!popup) {
    return Promise.reject(
      new Error("Popup blocked by the browser. Allow popups and try again."),
    );
  }

  return new Promise<PwaReply>((resolve, reject) => {
    let closedPoll: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (closedPoll !== undefined) clearInterval(closedPoll);
    };

    const onMessage = (event: MessageEvent) => {
      // Only trust replies from the wallet origin AND from the window we
      // opened: anything else could be another tab talking to us.
      if (event.origin !== INSCRIB3_PWA_ORIGIN || event.source !== popup) {
        return;
      }
      const reply = parsePwaReply(event.data);
      if (!reply) return;
      cleanup();
      resolve(reply);
    };

    window.addEventListener("message", onMessage);
    closedPoll = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Wallet window closed."));
      }
    }, 500);
  });
}

/** Connects through the PWA. Resolves with the wallet's Arkade addresses. */
export async function connectWithPwa(): Promise<string[]> {
  const reply = await requestViaPwa(buildPwaConnectUrl());
  switch (reply.type) {
    case "inscrib3:connect": {
      const accounts = pwaAccountsFromReply(reply.accounts);
      if (accounts.length === 0) {
        throw new Error("Wallet returned no address.");
      }
      return accounts;
    }
    case "inscrib3:connect_rejected":
      throw new Error("Connection rejected.");
    default:
      throw new Error("Unrecognized wallet response.");
  }
}

/** Sends `amountSats` to an Arkade address through the PWA. Returns the txid. */
export async function sendWithPwa(
  address: string,
  amountSats: number,
): Promise<string> {
  if (!isValidSatsAmount(amountSats)) {
    throw new Error("Invalid amount: must be a positive integer");
  }
  const reply = await requestViaPwa(buildPwaSendUrl(address, amountSats));
  switch (reply.type) {
    case "inscrib3:send":
      if (typeof reply.txid !== "string" || reply.txid.length === 0) {
        throw new Error("Wallet returned no transaction id.");
      }
      return reply.txid;
    case "inscrib3:send_failed":
      throw new Error(
        typeof reply.error === "string" && reply.error
          ? reply.error
          : "Wallet failed to send.",
      );
    case "inscrib3:send_rejected":
      throw new Error("Send rejected.");
    default:
      throw new Error("Unrecognized wallet response.");
  }
}
