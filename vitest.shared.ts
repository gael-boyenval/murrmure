import type { ViteUserConfig } from "vitest/config";

export const sharedTestConfig: NonNullable<ViteUserConfig["test"]> = {
  environment: "node",
  include: ["test/**/*.test.ts"],
  pool: "forks",
};
