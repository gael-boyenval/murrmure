import { afterEach, describe, expect, test } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadPrivateEnvFile,
  PrivateEnvFileError,
  resolveHubEnvFilePath,
} from "../../src/load-private-env.js";

const FIXTURE_VALUE = "ok";
const SECRET_VALUE = "supersecret-do-not-leak";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeEnvFile(dir: string, contents: string, mode = 0o600, name = "hub.env"): string {
  const path = join(dir, name);
  writeFileSync(path, contents, { mode });
  chmodSync(path, mode);
  return path;
}

function expectNoLeak(text: string, secrets: string[] = [FIXTURE_VALUE, SECRET_VALUE]): void {
  for (const secret of secrets) {
    expect(text).not.toContain(secret);
  }
}

describe("resolveHubEnvFilePath", () => {
  test("walks up to pnpm-workspace.yaml then uses .env.local", () => {
    const root = tempDir("hub-env-ws-");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    mkdirSync(join(root, "packages", "hub-daemon"), { recursive: true });
    const resolved = resolveHubEnvFilePath({
      cwd: join(root, "packages", "hub-daemon"),
      env: {},
    });
    expect(resolved.path).toBe(join(root, ".env.local"));
    expect(resolved.required).toBe(false);
  });

  test("MURRMURE_ENV_FILE override is required", () => {
    const cwd = tempDir("hub-env-ovr-");
    const resolved = resolveHubEnvFilePath({
      cwd,
      env: { MURRMURE_ENV_FILE: "custom.env" },
    });
    expect(resolved.path).toBe(join(cwd, "custom.env"));
    expect(resolved.required).toBe(true);
  });
});

describe("loadPrivateEnvFile", () => {
  const logs: string[] = [];
  const log = (message: string) => {
    logs.push(message);
  };

  afterEach(() => {
    logs.length = 0;
  });

  test("missing default file skips with path-only diagnostic", () => {
    const path = join(tempDir("hub-env-miss-"), ".env.local");
    const result = loadPrivateEnvFile(path, {}, { required: false, log });
    expect(result).toEqual({ loaded: 0, skipped: true });
    expect(logs).toEqual([`env file not found: ${path}`]);
    expectNoLeak(logs.join("\n"));
  });

  test("explicit missing file throws ENV_FILE_MISSING", () => {
    const path = join(tempDir("hub-env-req-"), "missing.env");
    try {
      loadPrivateEnvFile(path, {}, { required: true, log });
      expect.unreachable("expected missing required file to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrivateEnvFileError);
      const err = error as PrivateEnvFileError;
      expect(err.code).toBe("ENV_FILE_MISSING");
      expect(err.path).toBe(path);
      expect(err.message).toContain(path);
      expectNoLeak(err.message);
    }
    expect(logs).toEqual([]);
  });

  test("0600 file loads KEY=VALUE, export, comments, and quotes", () => {
    const path = writeEnvFile(
      tempDir("hub-env-ok-"),
      [
        "# comment",
        "PLAIN=plain-value",
        "export EXPORTED=exported-value",
        `QUOTED="quoted value"`,
        "SINGLE='keep # hash'",
        "EMPTY=",
        "",
      ].join("\n"),
    );
    const target: NodeJS.ProcessEnv = {};
    const result = loadPrivateEnvFile(path, target, { log });
    expect(result).toEqual({ loaded: 5, skipped: false });
    expect(target.PLAIN).toBe("plain-value");
    expect(target.EXPORTED).toBe("exported-value");
    expect(target.QUOTED).toBe("quoted value");
    expect(target.SINGLE).toBe("keep # hash");
    expect(target.EMPTY).toBe("");
    expect(logs).toEqual([`loaded 5 variables from ${path}`]);
    expectNoLeak(logs.join("\n"), ["plain-value", "exported-value", "quoted value"]);
  });

  test("0644 and 0666 files throw ENV_FILE_PERMISSIONS", () => {
    for (const mode of [0o644, 0o666]) {
      const path = writeEnvFile(tempDir(`hub-env-mode-${mode}-`), "SAFE=leaked-mode-value\n", mode);
      try {
        loadPrivateEnvFile(path, {}, { log });
        expect.unreachable(`expected mode ${mode.toString(8)} to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(PrivateEnvFileError);
        const err = error as PrivateEnvFileError;
        expect(err.code).toBe("ENV_FILE_PERMISSIONS");
        expect(err.path).toBe(path);
        expect(err.message).toContain(path);
        expectNoLeak(err.message, ["SAFE", "leaked-mode-value"]);
      }
    }
  });

  test("symlink throws ENV_FILE_SYMLINK", () => {
    const dir = tempDir("hub-env-link-");
    const real = writeEnvFile(dir, `MURRMURE_ENV_FIXTURE=${FIXTURE_VALUE}\n`);
    const link = join(dir, "linked.env");
    symlinkSync(real, link);
    try {
      loadPrivateEnvFile(link, {}, { log });
      expect.unreachable("expected symlink to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrivateEnvFileError);
      const err = error as PrivateEnvFileError;
      expect(err.code).toBe("ENV_FILE_SYMLINK");
      expect(err.path).toBe(link);
      expect(err.message).toContain(link);
      expectNoLeak(err.message);
    }
  });

  test("malformed line throws without echoing the line, keys, or values", () => {
    const path = writeEnvFile(
      tempDir("hub-env-bad-"),
      [`LEAK=${SECRET_VALUE}`, "this line is not an assignment"].join("\n"),
    );
    try {
      loadPrivateEnvFile(path, {}, { log });
      expect.unreachable("expected malformed file to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrivateEnvFileError);
      const err = error as PrivateEnvFileError;
      expect(err.code).toBe("ENV_FILE_MALFORMED");
      expect(err.path).toBe(path);
      expect(err.line).toBe(2);
      expect(err.message).toContain(path);
      expect(err.message).toContain(":2:");
      expect(err.message).toMatch(/missing '='/);
      expectNoLeak(err.message, [SECRET_VALUE, "LEAK", "this line is not an assignment"]);
    }
  });

  test("does not override existing target keys", () => {
    const path = writeEnvFile(tempDir("hub-env-keep-"), "EXISTING=from-file\nNEW=from-file\n");
    const target: NodeJS.ProcessEnv = { EXISTING: "from-process" };
    const result = loadPrivateEnvFile(path, target, { log });
    expect(result.loaded).toBe(1);
    expect(target.EXISTING).toBe("from-process");
    expect(target.NEW).toBe("from-file");
    expectNoLeak(logs.join("\n"), ["from-file", "from-process", "EXISTING", "NEW"]);
  });

  test("errors contain the path and never values", () => {
    const path = writeEnvFile(tempDir("hub-env-unclosed-"), `TOKEN="${SECRET_VALUE}\n`);
    try {
      loadPrivateEnvFile(path, {}, { log });
      expect.unreachable("expected unclosed quote to throw");
    } catch (error) {
      const err = error as PrivateEnvFileError;
      expect(err.code).toBe("ENV_FILE_MALFORMED");
      expect(err.message).toContain(path);
      expectNoLeak(err.message, [SECRET_VALUE, "TOKEN"]);
    }
  });

  test("loaded fixture is visible in the spawned-seat env merge", () => {
    const path = writeEnvFile(
      tempDir("hub-env-spawn-"),
      `MURRMURE_ENV_FIXTURE=${FIXTURE_VALUE}\n`,
    );
    const target: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    loadPrivateEnvFile(path, target, { log });
    const extraEnv = { MURRMURE_ACTION: "seat" };
    const childEnv = { ...target, ...extraEnv };
    expect(childEnv.MURRMURE_ENV_FIXTURE).toBe(FIXTURE_VALUE);
    expect(childEnv.MURRMURE_ACTION).toBe("seat");
    expect(childEnv.PATH).toBe("/usr/bin");
    for (const line of logs) {
      expectNoLeak(line, [FIXTURE_VALUE]);
      expect(line).toContain(path);
    }
  });
});
