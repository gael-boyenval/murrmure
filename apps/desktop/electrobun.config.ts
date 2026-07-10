import type { ElectrobunConfig } from "electrobun";

const config: ElectrobunConfig = {
  app: {
    name: "Murrmure",
    identifier: "dev.murrmure.desktop",
    version: "0.1.0",
    description: "Murrmure desktop shell (MVP)",
    urlSchemes: ["murrmure"],
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      "../../packages/hub-daemon/dist": "Resources/hub",
      "../../packages/mcp-bridge/dist": "Resources/mcp-bridge",
      "../../packages/shell-web/dist": "Resources/shell/dist",
      "../../fixtures/hub/contracts": "Resources/hub/contracts",
    },
    buildFolder: "build",
    artifactFolder: "artifacts",
    watch: [
      "src/**",
      "../../packages/hub-daemon/dist/**",
      "../../packages/shell-web/dist/**",
    ],
    watchIgnore: ["build/**", "artifacts/**"],
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
};

export default config;
