import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const testHomeRef = { value: "" };

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => testHomeRef.value,
  };
});

import { resolveHubAuth } from "../src/auth.js";
import { validateAndSaveLogin } from "../src/commands/auth.js";
import { writeCredentials } from "../src/lib/auth-store.js";

describe("resolveHubAuth", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    testHomeRef.value = mkdtempSync(join(tmpdir(), "murrmure-auth-resolve-"));
    process.env = { ...envSnapshot };
    delete process.env.MURRMURE_HUB_URL;
    delete process.env.MURRMURE_HUB_TOKEN;
    delete process.env.MURRMURE_TOKEN;
    delete process.env.MURRMURE_DEPLOY_TOKEN;
    delete process.env.STUDIO_API_URL;
    delete process.env.STUDIO_API_TOKEN;
  });

  afterEach(() => {
    process.env = envSnapshot;
    rmSync(testHomeRef.value, { recursive: true, force: true });
  });

  test("prefers CLI flags over env and credentials", () => {
    process.env.MURRMURE_HUB_URL = "http://env.example";
    process.env.MURRMURE_HUB_TOKEN = "tok_env";
    writeCredentials({
      version: 1,
      hubUrl: "http://cred.example",
      token: "tok_cred",
      defaultSpaceId: "spc_cred",
      savedAt: new Date().toISOString(),
    });

    expect(resolveHubAuth({ hubUrl: "http://flag.example", token: "tok_flag" })).toEqual({
      hubUrl: "http://flag.example",
      token: "tok_flag",
      defaultSpaceId: "spc_cred",
    });
  });

  test("falls back env then credentials then shared.json", () => {
    writeCredentials({
      version: 1,
      hubUrl: "http://cred.example",
      token: "tok_cred",
      defaultSpaceId: "spc_cred",
      savedAt: new Date().toISOString(),
    });
    expect(resolveHubAuth()).toEqual({
      hubUrl: "http://cred.example",
      token: "tok_cred",
      defaultSpaceId: "spc_cred",
    });

    process.env.MURRMURE_HUB_URL = "http://env.example";
    process.env.MURRMURE_HUB_TOKEN = "tok_env";
    expect(resolveHubAuth()).toEqual({
      hubUrl: "http://env.example",
      token: "tok_env",
      defaultSpaceId: "spc_cred",
    });
  });

  test("accepts legacy STUDIO_API_* env aliases", () => {
    process.env.STUDIO_API_URL = "http://legacy.example";
    process.env.STUDIO_API_TOKEN = "tok_legacy";
    expect(resolveHubAuth()).toEqual({
      hubUrl: "http://legacy.example",
      token: "tok_legacy",
      defaultSpaceId: undefined,
    });
  });
});

describe("validateAndSaveLogin", () => {
  beforeEach(() => {
    testHomeRef.value = mkdtempSync(join(tmpdir(), "murrmure-auth-login-"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(testHomeRef.value, { recursive: true, force: true });
  });

  test("validates token via whoami before saving credentials", async () => {
    const whoami = {
      actor_id: "act_1",
      kind: "human",
      token_id: "tok_1",
      spaces: [{ space_id: "spc_ui_sandbox", scopes: ["space:read"] }],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe("http://127.0.0.1:8787/v1/auth/whoami");
        return {
          ok: true,
          status: 200,
          json: async () => whoami,
        };
      }),
    );

    const result = await validateAndSaveLogin("http://127.0.0.1:8787/", "tok_1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.whoami).toEqual(whoami);
    }

    const saved = join(testHomeRef.value, ".murrmure", "credentials");
    expect(JSON.parse(readFileSync(saved, "utf-8"))).toMatchObject({
      version: 1,
      hubUrl: "http://127.0.0.1:8787",
      token: "tok_1",
      defaultSpaceId: "spc_ui_sandbox",
    });
  });

  test("does not save credentials when whoami fails with 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: "Invalid token" }),
      })),
    );

    const result = await validateAndSaveLogin("http://127.0.0.1:8787", "tok_bad");
    expect(result).toEqual({
      ok: false,
      code: "AUTH_INVALID",
      message: "Invalid token",
    });

    const saved = join(testHomeRef.value, ".murrmure", "credentials");
    expect(existsSync(saved)).toBe(false);
  });

  test("maps hub 403 token_denied to AUTH_INVALID via mapHubDenial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          code: "token_denied",
          message: "Invalid or revoked token",
        }),
      })),
    );

    const result = await validateAndSaveLogin("http://127.0.0.1:8787", "tok_bad");
    expect(result).toEqual({
      ok: false,
      code: "AUTH_INVALID",
      message: "Invalid or revoked token",
    });

    const saved = join(testHomeRef.value, ".murrmure", "credentials");
    expect(existsSync(saved)).toBe(false);
  });
});

describe("whoami formatting", () => {
  test("renders header and space table", async () => {
    const { formatWhoamiTable } = await import("../src/lib/whoami-format.js");
    const text = formatWhoamiTable({
      actor_id: "act_1",
      kind: "human",
      token_id: "tok_1",
      spaces: [
        { space_id: "spc_a", scopes: ["space:read", "event:read"] },
        { space_id: "spc_b", scopes: ["space:admin"] },
      ],
    });

    expect(text).toContain("actor: act_1");
    expect(text).toContain("SPACE  SCOPES");
    expect(text).toContain("spc_a");
    expect(text).toContain("space:read, event:read");
  });
});
