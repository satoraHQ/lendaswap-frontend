/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_MODE?: string;
  readonly VITE_LENDASWAP_API_URL?: string;
  readonly VITE_ESPLORA_URL?: string;
  readonly VITE_ELECTRUM_WS_URL?: string;
  readonly VITE_RPC_OVERRIDES?: string;
  readonly VITE_RPC_OVERRIDE_CHAIN_ID?: string;
  readonly VITE_RPC_OVERRIDE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
