import { defineConfig } from "vitest/config";
import { sharedTestConfig } from "./vitest.shared";

const project = (name: string, root: string) => ({
  extends: true,
  test: {
    ...sharedTestConfig,
    name,
    root,
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
      project("@murrmure/flow-dev-kit", "packages/flow-dev-kit"),
    ],
  },
});
