/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

interface ImportMetaEnv {
  readonly VITE_REQUIRE_INSTALL?: string;
  readonly VITE_ALLOW_BROWSER?: string;
}
