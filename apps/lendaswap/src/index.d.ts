declare module "*.png";
declare module "*.jpg";

declare module "*.svg" {
  import * as React from "react";
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  const src: string;
  export default src;
}

/**
 * Speed Wallet Mini App Integration
 *
 * When Satora runs inside Speed Wallet, these global interfaces
 * are available for triggering native payment flows.
 */

interface SpeedWalletAndroid {
  postMessage(data: string): void;
}

interface SpeedWalletIOSMessageHandler {
  postMessage(data: string): void;
}

interface SpeedWalletWebkit {
  messageHandlers?: {
    iosInterface?: SpeedWalletIOSMessageHandler;
  };
}

interface Window {
  /** Speed Wallet Android bridge */
  Android?: SpeedWalletAndroid;
  /** Speed Wallet iOS bridge */
  webkit?: SpeedWalletWebkit;
  /** Chatwoot live chat SDK */
  $chatwoot?: {
    toggle(state: "open" | "close"): void;
    setUser(id: string, attrs?: Record<string, unknown>): void;
    setCustomAttributes(attrs: Record<string, unknown>): void;
    setConversationCustomAttributes(attrs: Record<string, unknown>): void;
    reset(): void;
  };
  /** Chatwoot SDK loader */
  chatwootSDK?: {
    run(config: { websiteToken: string; baseUrl: string }): void;
  };
}
