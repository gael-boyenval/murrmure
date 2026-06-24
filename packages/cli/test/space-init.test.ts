import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn() },
  note: vi.fn(),
  confirm: vi.fn(async () => false),
  isCancel: () => false,
}));

import { spaceInitCommand } from "../src/commands/space/init.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";

describe("space init wizard", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_bootstrap";
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  test("init wizard smoke skips all steps without crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/v1/auth/whoami")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              actor_id: "act_admin",
              kind: "human",
              token_id: "tok_bootstrap",
              spaces: [],
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    await expect(
      (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: {},
        rawArgs: [],
      }),
    ).resolves.toBeUndefined();
  });
});
