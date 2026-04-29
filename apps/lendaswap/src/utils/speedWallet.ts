/**
 * Speed Wallet Integration Utilities
 *
 * Speed Wallet is a Bitcoin wallet that supports Mini Apps.
 * When Satora runs inside Speed Wallet, we use their payment API
 * instead of displaying QR codes.
 *
 * @see https://docs.speed.app/mini-apps/receiving-payments
 *
 * URL Parameters passed by Speed Wallet:
 * - acct: Account ID (e.g., "acct_li8hh2xyRuSBWnE4")
 * - lang: Language preference (e.g., "en", "es", "de", "hi")
 * - bal_btc: Bitcoin balance in Satoshis (1 BTC = 100,000,000 SATs)
 * - bal_usdt: USDT balance in standard units
 * - p_add: Lightning address (e.g., "user@speed.app")
 *
 * Example URL:
 * https://app.com?acct=acct_li8hh2xyRuSBWnE4&lang=en&bal_btc=87636&bal_usdt=1975.29&p_add=abc%40speed.app
 */

const SPEED_WALLET_STORAGE_KEY = "speed_wallet_params";

/**
 * Persists Speed Wallet params to sessionStorage.
 * Called automatically when params are first detected from URL.
 */
const persistSpeedWalletParams = (params: SpeedWalletParams): void => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SPEED_WALLET_STORAGE_KEY, JSON.stringify(params));
  } catch {
    // sessionStorage might not be available
  }
};

/**
 * Gets persisted Speed Wallet params from sessionStorage.
 */
const getPersistedSpeedWalletParams = (): SpeedWalletParams | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(SPEED_WALLET_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as SpeedWalletParams;
    }
  } catch {
    // sessionStorage might not be available or JSON parse failed
  }
  return null;
};

export interface SpeedWalletParams {
  /** Account ID (e.g., "acct_li8hh2xyRuSBWnE4") */
  accountId: string | null;
  /** Language preference (e.g., "en", "es", "de", "hi") */
  language: string | null;
  /** Bitcoin balance in Satoshis */
  balanceBtcSats: number | null;
  /** USDT balance in standard units */
  balanceUsdt: number | null;
  /** Lightning address (e.g., "user@speed.app") */
  lightningAddress: string | null;
}

export interface SpeedWalletPaymentRequest {
  version: "2022-10-15";
  account_id: string;
  data: {
    amount: number;
    currency: "SATS" | "USD" | "EUR" | "BTC";
    target_currency: "SATS" | "USDT";
    deposit_address: string; // LN invoice, LN address, LNURL, or BTC/USDT address
    note?: string;
  };
}

/**
 * Parses all Speed Wallet parameters from the URL.
 * If found in URL, persists to sessionStorage for later use after redirects.
 * Falls back to sessionStorage if URL params are missing.
 */
export const getSpeedWalletParams = (): SpeedWalletParams => {
  const emptyParams: SpeedWalletParams = {
    accountId: null,
    language: null,
    balanceBtcSats: null,
    balanceUsdt: null,
    lightningAddress: null,
  };

  if (typeof window === "undefined") {
    return emptyParams;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const acct = urlParams.get("acct");

  // If we have Speed Wallet params in URL, parse and persist them
  if (acct?.startsWith("acct_")) {
    const balBtcRaw = urlParams.get("bal_btc");
    const balUsdtRaw = urlParams.get("bal_usdt");
    const pAdd = urlParams.get("p_add");

    const params: SpeedWalletParams = {
      accountId: acct,
      language: urlParams.get("lang"),
      balanceBtcSats: balBtcRaw ? parseInt(balBtcRaw, 10) : null,
      balanceUsdt: balUsdtRaw ? parseFloat(balUsdtRaw) : null,
      lightningAddress: pAdd ? decodeURIComponent(pAdd) : null,
    };

    // Persist for use after redirects
    persistSpeedWalletParams(params);
    return params;
  }

  // Fallback to persisted params (survives redirects)
  return getPersistedSpeedWalletParams() || emptyParams;
};

/**
 * Detects if Satora is running inside Speed Wallet's Mini App environment.
 * Checks URL params first, then falls back to persisted sessionStorage.
 */
export const isSpeedWalletEnvironment = (): boolean => {
  if (typeof window === "undefined") return false;

  // Check if we have valid Speed Wallet context (URL or persisted)
  const params = getSpeedWalletParams();
  if (params.accountId?.startsWith("acct_")) {
    return true;
  }

  // Fallback: check for native message handlers
  return !!(
    window.Android ||
    window.webkit?.messageHandlers?.iosInterface ||
    (window.parent && window.parent !== window)
  );
};

/**
 * Gets the Speed Wallet account ID.
 * Checks URL first, then falls back to persisted sessionStorage.
 * @returns Account ID (e.g., "acct_li8hh2xyRuSBWnE4") or null
 */
export const getSpeedAccountId = (): string | null => {
  return getSpeedWalletParams().accountId;
};

/**
 * Gets the user's Lightning address from Speed Wallet.
 * Checks URL first, then falls back to persisted sessionStorage.
 * @returns Lightning address (e.g., "user@speed.app") or null
 */
export const getSpeedLightningAddress = (): string | null => {
  return getSpeedWalletParams().lightningAddress;
};

/**
 * Gets the user's Bitcoin balance in Satoshis from Speed Wallet.
 * Checks URL first, then falls back to persisted sessionStorage.
 * @returns Balance in Satoshis or null
 */
export const getSpeedBalanceBtc = (): number | null => {
  return getSpeedWalletParams().balanceBtcSats;
};

/**
 * Gets the user's USDT balance from Speed Wallet.
 * Checks URL first, then falls back to persisted sessionStorage.
 * @returns USDT balance or null
 */
export const getSpeedBalanceUsdt = (): number | null => {
  return getSpeedWalletParams().balanceUsdt;
};

/**
 * Gets the user's language preference from Speed Wallet.
 * Checks URL first, then falls back to persisted sessionStorage.
 * @returns Language code (e.g., "en", "es", "de") or null
 */
export const getSpeedLanguage = (): string | null => {
  return getSpeedWalletParams().language;
};

/**
 * Checks if we have a valid Speed Wallet context (has account_id with correct prefix).
 * Works even after redirects that lose URL params, thanks to sessionStorage persistence.
 */
const isValidSpeedWalletContext = (): boolean => {
  const accountId = getSpeedAccountId();
  return !!accountId?.startsWith("acct_");
};
export default isValidSpeedWalletContext;

/**
 * Triggers a payment request via Speed Wallet's native payment UI.
 *
 * This sends a JSON payload to Speed Wallet which then:
 * 1. Shows the user a native payment confirmation screen
 * 2. Processes the payment through Speed Wallet
 * 3. Sends funds to the specified deposit_address (our LN invoice)
 *
 * @param lightningInvoice - The BOLT11 Lightning invoice to pay
 * @param satsAmount - Amount in satoshis
 * @param note - Optional payment note/description
 * @returns true if the message was sent, false if not in Speed Wallet environment
 */
export const triggerSpeedWalletPayment = (
  lightningInvoice: string,
  satsAmount: number,
  note?: string,
): boolean => {
  const accountId = getSpeedAccountId();

  if (!accountId) {
    console.warn("Speed Wallet payment triggered but no account_id found");
    return false;
  }

  const paymentRequest: SpeedWalletPaymentRequest = {
    version: "2022-10-15",
    account_id: accountId,
    data: {
      amount: satsAmount,
      currency: "SATS",
      target_currency: "SATS",
      deposit_address: lightningInvoice,
      note: note,
    },
  };

  const data = JSON.stringify(paymentRequest);

  // Speed Wallet's required payment bridge
  // Priority: Android > iOS > Web (parent iframe) > fallback
  if (window.Android) {
    window.Android.postMessage(data);
  } else if (window.webkit?.messageHandlers?.iosInterface) {
    window.webkit.messageHandlers.iosInterface.postMessage(data);
  } else if (window.parent && window.parent !== window) {
    window.parent.postMessage(data, "*");
  } else {
    window.postMessage(data, "*");
  }

  return true;
};
