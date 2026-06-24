import { afterEach, describe, expect, test } from "vitest";
import { formatDoctorHuman, runDoctor } from "../src/lib/doctor.js";
import { resolveAuthSource } from "../src/lib/auth-source.js";

describe("resolveAuthSource", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
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
});

describe("runDoctor", () => {
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
