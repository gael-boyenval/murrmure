import type { ElectrobunConfig } from "electrobun";

const config: ElectrobunConfig = {
  app: {
    name: "Murrmure",
    identifier: "dev.murrmure.desktop",
    version: "0.1.0",
    description: "Murrmure desktop shell (MVP)",
  },
  build: {
    bun: {
      entrypoint: "src/main.ts",
    },
    copy: {
      "../../packages/studio-hub-daemon/dist": "Resources/hub",
      "../../packages/studio-hub-daemon/src/capability-worker-entry.js": "Resources/hub/capability-worker-entry.js",
      "../../packages/shell-web/dist": "Resources/shell/dist",
      "../../fixtures/hub/contracts": "Resources/hub/contracts",
      "../../fixtures/hub/workers": "Resources/hub/workers",
    },
    buildFolder: "build",
    artifactFolder: "artifacts",
    watch: [
      "src/**",
      "../../packages/studio-hub-daemon/dist/**",
      "../../packages/shell-web/dist/**",
    ],
    watchIgnore: ["build/**", "artifacts/**"],
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
};

export default config;
