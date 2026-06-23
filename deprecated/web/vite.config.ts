import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const DAEMON = "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@studio/review-contracts": fileURLToPath(
        new URL("../review-contracts/src/index.ts", import.meta.url),
      ),
      "@studio/client": fileURLToPath(new URL("../client/src/index.ts", import.meta.url)),
    },
  },
  server: {
    // Match CLI/README URLs (127.0.0.1). Node 17+ binds "localhost" to ::1 only.
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: DAEMON, changeOrigin: true },
      "/fixtures": { target: DAEMON, changeOrigin: true },
    },
  },
});
