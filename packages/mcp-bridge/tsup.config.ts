import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { main: "src/main.ts" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    outDir: "dist",
    clean: true,
    shims: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
