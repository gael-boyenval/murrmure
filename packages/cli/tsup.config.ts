import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/main.ts", mcp: "src/mcp.ts", api: "src/api.ts" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    outDir: "dist",
    clean: true,
    shims: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
    external: ["esbuild"],
    noExternal: [/^@murrmure\//],
  },
]);
