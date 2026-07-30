import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so hub-served dist/ loads assets under
  // /v1/spaces/.../views/.../dist/ instead of hub-root /assets/.
  base: "./",
  server: {
    // Keep clear of Desktop shell (5174) and docs (5173). CLI also passes --port.
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    cors: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
