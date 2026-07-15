import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderUsage } from "citty";
import {
  triggerCommand,
  triggerDeliveriesCommand,
  triggerDisableCommand,
  triggerEventCatalogCommand,
  triggerListCommand,
  triggerRegisterCommand,
  triggerReplayCommand,
  triggerTemplatesCommand,
  triggerTestFireCommand,
} from "../src/commands/space/trigger.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";

const TRIGGER_LEAVES = [
  { name: "list", command: triggerListCommand, requires: "space:read" },
  { name: "register", command: triggerRegisterCommand, requires: "trigger:register" },
  { name: "disable", command: triggerDisableCommand, requires: "trigger:register" },
  { name: "deliveries", command: triggerDeliveriesCommand, requires: "space:read" },
  { name: "replay", command: triggerReplayCommand, requires: "space:admin" },
  { name: "templates", command: triggerTemplatesCommand, requires: "space:read" },
  { name: "event-catalog", command: triggerEventCatalogCommand, requires: "space:read" },
  { name: "test-fire", command: triggerTestFireCommand, requires: "trigger:register" },
] as const;

describe("space trigger command help", () => {
  test("trigger group usage lists all subcommands", async () => {
    const usage = await renderUsage(triggerCommand);
    for (const leaf of TRIGGER_LEAVES) {
      expect(usage).toContain(leaf.name);
    }
  });

  test.each(TRIGGER_LEAVES)("$name --help includes Requires line", async ({ command, requires }) => {
    const usage = await renderUsage(command);
    expect(usage.length).toBeGreaterThan(20);
    expect(usage).toMatch(/Requires:/);
    expect(usage).toContain(requires);
  });
});

describe("space trigger register/list", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_trigger";
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  function mockWhoami(scopes: string[]) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        actor_id: "act_1",
        kind: "agent",
        token_id: "tok_trigger",
        spaces: [{ space_id: "spc_dev", scopes }],
      }),
    };
  }

  test("register rejects retired mcp_wake action (strict)", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return mockWhoami(["trigger:register", "space:read"]);
      }
      if (url.endsWith("/v1/spaces/spc_dev/triggers") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        // The CLI passes the caller's action through verbatim; the hub rejects
        // retired mcp_wake actions at the register/apply boundary (Task 15 Lane C).
        expect(body.name).toBe("spec-published-wake");
        expect(body.filter).toEqual({ event_types: ["spec.published"], source_space_id: "spc_orchestrator" });
        expect(body.action).toEqual({ type: "mcp_wake", target_space_id: "spc_dev" });
        return {
          ok: false,
          status: 422,
          json: async () => ({
            code: "TRIGGER_ACTION_RETIRED",
            message:
              "mcp_wake trigger actions are retired (Task 15 Lane C); use an on: event: handler in .mrmr/space/handlers.yaml + murrmure_emit_event",
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);

    await expect(
      (triggerRegisterCommand as { run: (ctx: unknown) => Promise<void> }).run({
        args: {
          json: true,
          space: "spc_dev",
          name: "spec-published-wake",
          filter: '{"event_types":["spec.published"],"source_space_id":"spc_orchestrator"}',
          action: '{"type":"mcp_wake","target_space_id":"spc_dev"}',
        },
        rawArgs: [],
      }),
    ).rejects.toThrow("EXIT");

    expect(exit).toHaveBeenCalledWith(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces/spc_dev/triggers",
      expect.objectContaining({ method: "POST" }),
    );

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as {
      ok: boolean;
      code: string;
      message: string;
    };
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("TRIGGER_ACTION_RETIRED");
    expect(payload.message).toContain("mcp_wake");
  });

  test("list calls GET /triggers", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return mockWhoami(["space:read"]);
      }
      if (url.endsWith("/v1/spaces/spc_dev/triggers")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ triggers: [{ trigger_id: "trg_1", name: "Wake dev" }] }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await (triggerListCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { json: true, space: "spc_dev" },
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces/spc_dev/triggers",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok_trigger" }),
      }),
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      ok: boolean;
      triggers?: unknown[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.triggers).toHaveLength(1);
  });
});
