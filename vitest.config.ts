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
      project("@murrmure/contracts", "packages/contracts", [
        "test/**/*.test.ts",
        "conformance/**/*.test.ts",
      ]),
      project("@murrmure/hub-core", "packages/hub-core"),
      project("@murrmure/hub-persistence", "packages/hub-persistence"),
      project("@murrmure/hub-daemon", "packages/hub-daemon"),
      project("@murrmure/executors", "packages/executors", [
        "conformance/**/*.test.ts",
      ]),
      project("@murrmure/cli", "packages/cli"),
      project("@murrmure/shell-client", "packages/shell-client", ["test/**/*.test.ts"]),
      project("@murrmure/shell-web", "packages/shell-web", ["src/**/*.test.ts", "src/**/*.test.tsx"]),
      project("@murrmure/desktop", "apps/desktop", ["test/**/*.test.ts"]),
      project("@murrmure/view-sdk", "packages/view-sdk", ["test/**/*.test.ts"]),
    ],
  },
});
