import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

import { formatDoctorHuman, runDoctor } from "../src/lib/doctor.js";
import { resolveAuthSource } from "../src/lib/auth-source.js";

describe("resolveAuthSource", () => {
  const env = { ...process.env };

  beforeEach(() => {
    testHomeRef.value = mkdtempSync(join(tmpdir(), "murrmure-doctor-auth-source-"));
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = { ...env };
    if (testHomeRef.value) {
      rmSync(testHomeRef.value, { recursive: true, force: true });
      testHomeRef.value = "";
    }
  });

  test("prefers flags over env", () => {
    process.env.MURRMURE_HUB_URL = "http://env.example";
    process.env.MURRMURE_HUB_TOKEN = "tok_env";
    expect(resolveAuthSource({ hubUrl: "http://flag.example", token: "tok_flag" })).toBe("flags");
  });

  test("detects env when no flags", () => {
    process.env.MURRMURE_HUB_URL = "http://env.example";
    process.env.MURRMURE_HUB_TOKEN = "tok_env";
    expect(resolveAuthSource()).toBe("env");
  });

  test("detects active grant source when env is absent", () => {
    const grantsDir = join(testHomeRef.value, ".murrmure", "grants");
    mkdirSync(grantsDir, { recursive: true });
    writeFileSync(join(grantsDir, "spc_ui_sandbox.token"), "tok_space\n");
    writeFileSync(join(grantsDir, "active"), "spc_ui_sandbox\n");
    expect(resolveAuthSource()).toBe("active-grant");
  });
});

describe("runDoctor", () => {
  const env = { ...process.env };

  beforeEach(() => {
    testHomeRef.value = mkdtempSync(join(tmpdir(), "murrmure-doctor-"));
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = { ...env };
    if (testHomeRef.value) {
      rmSync(testHomeRef.value, { recursive: true, force: true });
      testHomeRef.value = "";
    }
  });

  test("reports AUTH_MISSING when no auth configured", async () => {
    const result = await runDoctor({ hubUrl: undefined, token: undefined });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("AUTH_MISSING");
    expect(result.profile.spaces).toEqual([]);
  });

  test("formatDoctorHuman includes profile section", () => {
    const text = formatDoctorHuman({
      ok: false,
      issues: [{ code: "AUTH_MISSING", message: "Missing hub auth" }],
      profile: {
        auth_source: null,
        hub_reachable: false,
        token_valid: false,
        bootstrap_token: false,
        spaces: [],
      },
    });
    expect(text).toContain("Profile");
    expect(text).toContain("Issues");
  });
});
