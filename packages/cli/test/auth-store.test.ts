import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
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

import {
  deleteCredentials,
  readCredentials,
  writeCredentials,
  type CredentialsFile,
} from "../src/lib/auth-store.js";

describe("auth-store", () => {
  beforeEach(() => {
    testHomeRef.value = mkdtempSync(join(tmpdir(), "murrmure-auth-store-"));
  });

  afterEach(() => {
    rmSync(testHomeRef.value, { recursive: true, force: true });
  });

  test("round-trips credentials with mode 0600", () => {
    const payload: CredentialsFile = {
      version: 1,
      hubUrl: "http://127.0.0.1:8787",
      token: "tok_test",
      defaultSpaceId: "spc_ui_sandbox",
      savedAt: "2026-06-24T12:00:00.000Z",
    };

    writeCredentials(payload);
    const path = join(testHomeRef.value, ".murrmure", "credentials");
    expect(existsSync(path)).toBe(true);
    expect((statSync(path).mode & 0o777).toString(8)).toBe("600");
    expect(readCredentials()).toEqual(payload);

    deleteCredentials();
    expect(readCredentials()).toBeNull();
    expect(existsSync(path)).toBe(false);
  });

  test("returns null for invalid credential files", () => {
    mkdirSync(join(testHomeRef.value, ".murrmure"), { recursive: true });
    const path = join(testHomeRef.value, ".murrmure", "credentials");
    writeFileSync(path, JSON.stringify({ version: 2, hubUrl: "x", token: "y" }));
    chmodSync(path, 0o600);
    expect(readCredentials()).toBeNull();
  });
});
