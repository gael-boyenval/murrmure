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

  test("register posts filter and action from flags", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return mockWhoami(["trigger:register", "space:read"]);
      }
      if (url.endsWith("/v1/spaces/spc_dev/triggers") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body.name).toBe("spec-published-wake");
        expect(body.filter).toEqual({ event_types: ["spec.published"], source_space_id: "spc_orchestrator" });
        expect(body.action).toEqual({ type: "mcp_wake", target_space_id: "spc_dev" });
        return {
          ok: true,
          status: 201,
          json: async () => ({ trigger_id: "trg_abc", enabled: true }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await (triggerRegisterCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        json: true,
        space: "spc_dev",
        name: "spec-published-wake",
        filter: '{"event_types":["spec.published"],"source_space_id":"spc_orchestrator"}',
        action: '{"type":"mcp_wake","target_space_id":"spc_dev"}',
      },
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces/spc_dev/triggers",
      expect.objectContaining({ method: "POST" }),
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      ok: boolean;
      trigger_id?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.trigger_id).toBe("trg_abc");
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
