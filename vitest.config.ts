import { defineConfig } from "vitest/config";
import { sharedTestConfig } from "./vitest.shared";

const project = (name: string, root: string, include = sharedTestConfig.include) => ({
  extends: true as const,
  test: {
    ...sharedTestConfig,
    name,
    root,
    include,
  },
});

export default defineConfig({
  test: {
    projects: [
      project("@murrmure/runtime-contracts", "packages/runtime-contracts"),
      project("@murrmure/runtime-kernel", "packages/runtime-kernel"),
      project("@murrmure/runtime-persistence", "packages/runtime-persistence"),
      project("@murrmure/runtime-adapter-http", "packages/runtime-adapter-http"),
      project("@murrmure/contracts", "packages/studio-contracts"),
      project("@murrmure/hub-core", "packages/studio-hub-core"),
      project("@murrmure/hub-persistence", "packages/studio-hub-persistence"),
      project("@murrmure/hub-daemon", "packages/studio-hub-daemon"),
      project("@murrmure/cli", "packages/cli"),
      project("@murrmure/shell-web", "packages/shell-web", ["src/**/*.test.ts"]),
      project("@murrmure/desktop", "apps/desktop", ["test/**/*.test.ts"]),
      project("@murrmure/flow-dev-kit", "packages/flow-dev-kit"),
    ],
  },
});
