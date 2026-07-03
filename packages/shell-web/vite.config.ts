import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  DESKTOP_HOST,
  parseHubPort,
  parseShellDevPort,
} from "../../apps/desktop/src/dev-ports.ts";

const shellDevPort = parseShellDevPort(process.env);
const hubUrl = `http://${DESKTOP_HOST}:${parseHubPort(process.env)}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: DESKTOP_HOST,
    port: shellDevPort,
    strictPort: true,
    proxy: {
      "/v1": { target: hubUrl, changeOrigin: true },
      "/api": { target: hubUrl, changeOrigin: true },
      "/flows": { target: hubUrl, changeOrigin: true },
    },
  },
});
