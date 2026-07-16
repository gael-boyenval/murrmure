import { defineConfig } from "vitest/config";
import { sharedTestConfig } from "../../vitest.shared.js";

export default defineConfig({
  test: {
    ...sharedTestConfig,
    name: "@murrmure/mcp-bridge",
    root: import.meta.dirname,
  },
});
