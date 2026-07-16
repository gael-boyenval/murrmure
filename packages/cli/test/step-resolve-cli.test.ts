import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stepResolveCommand } from "../src/commands/run/step-resolve.js";

describe("step resolve cli", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...envSnapshot,
      MURRMURE_RUN_ID: "run_123",
      MURRMURE_STEP_ID: "write_spec",
      MURRMURE_HUB_TOKEN: "tok_run_scoped",
      MURRMURE_HUB_URL: "http://127.0.0.1:8787",
    };
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("posts resolve payload with branch + JSON body", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: "completed" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await (stepResolveCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        json: true,
        branch: "completed",
        "payload-json": '{"ok":true}',
      },
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/runs/run_123/steps/write_spec/resolve",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok_run_scoped",
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request?.body).toBeDefined();
    expect(JSON.parse(String(request?.body))).toEqual({
      branch: "completed",
      payload: { ok: true },
      artifacts_out: undefined,
    });
  });

  test("supports payload file + artifact mapping", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mrmr-step-resolve-"));
    const payloadPath = join(dir, "result.json");
    writeFileSync(payloadPath, '{"preview_url":"http://localhost:3000"}', "utf-8");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await (stepResolveCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        json: true,
        branch: "completed",
        "payload-file": payloadPath,
        "artifact-out": "report=out/result.json",
      },
      rawArgs: [],
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(request?.body))).toEqual({
      branch: "completed",
      payload: { preview_url: "http://localhost:3000" },
      artifacts_out: [{ slot: "report", path: "out/result.json" }],
    });
    rmSync(dir, { recursive: true, force: true });
  });

  test("fails when resolve token env is missing", async () => {
    delete process.env.MURRMURE_HUB_TOKEN;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);

    await expect(
      (stepResolveCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: { json: true, branch: "completed" },
        rawArgs: [],
      }),
    ).rejects.toThrow("EXIT");

    expect(exit).toHaveBeenCalledWith(1);
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { code: string; message: string };
    expect(payload.code).toBe("MISSING_ENV");
    expect(payload.message).toContain("MURRMURE_HUB_TOKEN");
  });

  test("surfaces hub branch/schema errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          code: "BRANCH_NOT_FOUND",
          message: "Unknown branch 'done' for step 'write_spec'",
        }),
      })),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);

    await expect(
      (stepResolveCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: { json: true, branch: "done" },
        rawArgs: [],
      }),
    ).rejects.toThrow("EXIT");

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { code: string; message: string };
    expect(payload.code).toBe("BRANCH_NOT_FOUND");
    expect(payload.message).toContain("Unknown branch");
  });
});
