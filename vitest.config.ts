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
      project("@runtime/contracts", "packages/runtime-contracts"),
      project("@runtime/kernel", "packages/runtime-kernel"),
      project("@runtime/persistence", "packages/runtime-persistence"),
      project("@runtime/adapter-http", "packages/runtime-adapter-http"),
      project("@studio/contracts", "packages/studio-contracts"),
      project("@studio/hub-core", "packages/studio-hub-core"),
      project("@studio/hub-persistence", "packages/studio-hub-persistence"),
      project("@studio/hub-daemon", "packages/studio-hub-daemon"),
      project("@murrmure/cli", "packages/cli"),
      project("@murrmure/flow-dev-kit", "packages/flow-dev-kit"),
    ],
  },
});
