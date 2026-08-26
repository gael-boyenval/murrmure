import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DIRECTIVE_FLOW_ID, addTokenId } from "@murrmure/hub-core";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

function emptyApply() {
  return {
    actions: { digest: "sha256:dir-actions", file: { version: 1, actions: {} } },
    hooks: { digest: "sha256:dir-hooks", file: { version: 1, hooks: {} } },
    handlers: { digest: "sha256:dir-handlers-empty", file: { version: 1, handlers: [] } },
    flows: [],
    views: [],
  };
}

function directiveHandlerApply() {
  return {
    ...emptyApply(),
    handlers: {
      digest: "sha256:dir-handlers",
      file: {
        version: 1,
        handlers: [
          {
            id: "directive",
            contract_keys: ["directive.execute"],
            on: "step.opened::directive.execute",
            type: "shell_spawn",
            complete: "explicit",
            prompt: "{{input.prompt}}",
            command: "true",
          },
        ],
      },
    },
  };
}

describe("http/directives", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let withHandler = "";
  let withoutHandler = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "hub-directives-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000091",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    withHandler = await createSpace(baseUrl, bootstrapToken, {
      slug: "directive-on",
      name: "Directive On",
    });
    withoutHandler = await createSpace(baseUrl, bootstrapToken, {
      slug: "directive-off",
      name: "Directive Off",
    });

    const linked = await fetch(`${baseUrl}/v1/spaces/${withHandler}/link`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ path: fixture.dataDir, primary: true }),
    });
    expect(linked.status).toBe(200);

    const bound = await applySpaceBundle(baseUrl, bootstrapToken, withHandler, directiveHandlerApply());
    expect(bound.status).toBe(200);
    const unbound = await applySpaceBundle(baseUrl, bootstrapToken, withoutHandler, emptyApply());
    expect(unbound.status).toBe(200);
  });

  afterAll(() => cleanup?.());

  const auth = () => bootstrapAuth(bootstrapToken);

  test("apply indexes the platform flow only when the handler is bound", async () => {
    const indexed = await fetch(`${baseUrl}/v1/spaces/${withHandler}/index/flows`, {
      headers: auth(),
    }).then((res) => res.json() as Promise<{ flows: Array<{ flow_id: string; name: string }> }>);
    expect(indexed.flows.map((flow) => flow.flow_id)).toContain(DIRECTIVE_FLOW_ID);

    const empty = await fetch(`${baseUrl}/v1/spaces/${withoutHandler}/index/flows`, {
      headers: auth(),
    }).then((res) => res.json() as Promise<{ flows: Array<{ flow_id: string }> }>);
    expect(empty.flows.map((flow) => flow.flow_id)).not.toContain(DIRECTIVE_FLOW_ID);
  });

  test("GET /v1/directives/eligible lists only bound spaces", async () => {
    const res = await fetch(`${baseUrl}/v1/directives/eligible`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      spaces: Array<{ space_id: string; handler_id: string; name?: string }>;
    };
    expect(body.spaces.map((space) => space.space_id)).toEqual([withHandler]);
    expect(body.spaces[0]?.handler_id).toBe("directive");
    expect(body.spaces[0]?.name).toBe("Directive On");
  });

  test("manual start opens execute with the prompt and resolve reports the message", async () => {
    const started = await fetch(`${baseUrl}/v1/flows/${DIRECTIVE_FLOW_ID}/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        space_id: withHandler,
        input: { prompt: "Say pong" },
      }),
    });
    expect(started.status).toBe(201);
    const startBody = (await started.json()) as { run_id: string; session: { session_id: string } };
    expect(startBody.run_id).toMatch(/^run_/);

    const missing = await fetch(`${baseUrl}/v1/flows/${DIRECTIVE_FLOW_ID}/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        space_id: withoutHandler,
        input: { prompt: "Say pong" },
      }),
    });
    expect(missing.status).toBe(404);

    const open = await fetch(`${baseUrl}/v1/runs/${startBody.run_id}`, { headers: auth() }).then(
      (res) =>
        res.json() as Promise<{
          lifecycle: string;
          exec_context?: { input?: { prompt?: string } };
          open_steps?: Array<{ step_id: string }>;
        }>,
    );
    expect(open.exec_context?.input?.prompt).toBe("Say pong");
    expect(open.open_steps?.some((step) => step.step_id === "execute")).toBe(true);

    const resolved = await fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(startBody.run_id)}/steps/execute/resolve`,
      {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({
          branch: "completed",
          payload: { message: "pong" },
          idempotency_key: "directive-pong",
        }),
      },
    );
    expect(resolved.status).toBe(200);

    const done = await fetch(`${baseUrl}/v1/runs/${startBody.run_id}`, { headers: auth() }).then(
      (res) =>
        res.json() as Promise<{
          lifecycle: string;
          result?: { step_id: string; status?: string; message?: string };
        }>,
    );
    expect(done.lifecycle).toBe("completed");
    expect(done.result).toEqual({
      step_id: "execute",
      status: "completed",
      message: "pong",
    });
  });

  test("space home does not mark the platform flow as locally runnable", async () => {
    const home = await fetch(`${baseUrl}/v1/spaces/${withHandler}/home`, { headers: auth() }).then(
      (res) =>
        res.json() as Promise<{
          flows: Array<{ flow_id: string; can_run: boolean; authored_here: boolean }>;
        }>,
    );
    const directive = home.flows.find((flow) => flow.flow_id === DIRECTIVE_FLOW_ID);
    expect(directive?.can_run).toBe(false);
    expect(directive?.authored_here).toBe(false);
  });
});
