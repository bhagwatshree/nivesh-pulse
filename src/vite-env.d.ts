/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPSTOX_CLIENT_ID?: string
  readonly VITE_UPSTOX_REDIRECT_URI?: string
  readonly VITE_UPSTOX_PROXY_URL?: string
  readonly VITE_GROWW_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
