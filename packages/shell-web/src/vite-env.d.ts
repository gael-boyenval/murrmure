/// <reference types="vite/client" />

declare module "@wterm/ghostty/ghostty-vt.wasm?url" {
  const url: string;
  export default url;
}

interface ImportMetaEnv {
  readonly VITE_MURRMURE_BUNDLED?: string;
}
