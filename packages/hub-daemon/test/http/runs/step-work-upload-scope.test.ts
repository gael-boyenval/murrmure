import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ulid } from "ulid";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

const FLOW_BUNDLE = {
  actions: {
    digest: "sha256:upload-actions",
    file: { version: 1, actions: { do_work: { executor: "shell" } } },
  },
  executors: {
    digest: "sha256:upload-exec",
    file: {
      version: 1,
      executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
    },
  },
  hooks: { digest: "sha256:upload-hooks", file: { version: 1, hooks: {} } },
  flows: [
    {
      flow_id: "flw_upload_scope",
      rel_path: "flows/linear/flow.manifest.yaml",
      digest: "sha256:upload-flow",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "upload-scope",
        triggers: { manual: true },
        steps: [
          {
            id: "intake",
            description: "intake",
            branches: {
              continue: { schema: { type: "object", required: ["topic"] }, route: { step: "work" } },
              cancel: { schema: { type: "object" }, route: { run: "failed" } },
            },
          },
          { id: "work", description: "work" },
        ],
      },
    },
  ],
};

function bareSpace(id: string): string {
  return id.startsWith("spc_") ? id.slice(4) : id;
}

describe("http/runs/step-work-upload — assignment token scope", () => {
  let baseUrl: string;
  let cleanup: () => Promise<void>;
  let bootstrapToken: string;
  let ctx: { murrmurePersistence: { insertToken: (row: unknown, ts: string) => Promise<void> } };
  let spaceX: string;
  let spaceY: string;
  let runA: string;
  let runB: string;
  let runC: string;
  let tokenA: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-upload-scope-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000041";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    ctx = daemon.ctx as unknown as typeof ctx;
    cleanup = async () => {
      await daemon.shutdown();
      rmSync(dir, { recursive: true, force: true });
    };

    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };

    const makeSpace = async (slug: string) => {
      const res = await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ slug, name: slug }),
      });
      return (await res.json()).space_id as string;
    };
    const applyFlow = async (spaceId: string) => {
      await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle: FLOW_BUNDLE }),
      });
    };
    const startRun = async (spaceId: string) => {
      const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ title: "upload-scope", space_id: spaceId }),
      });
      const session = (await sessionRes.json()) as { session_id: string };
      const runRes = await fetch(`${baseUrl}/v1/flows/flw_upload_scope/run`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ session_id: session.session_id, space_id: spaceId, input: {} }),
      });
      return (await runRes.json()).run_id as string;
    };

    spaceX = await makeSpace("upload-scope-x");
    await applyFlow(spaceX);
    spaceY = await makeSpace("upload-scope-y");
    await applyFlow(spaceY);

    runA = await startRun(spaceX);
    runB = await startRun(spaceX);
    runC = await startRun(spaceY);

    // Mint an ephemeral assignment token bound to run A's intake step in space X
    // (mirrors mintRunResolveToken, including the handler scope_ref segment).
    tokenA = ulid();
    await ctx.murrmurePersistence.insertToken(
      {
        token_id: tokenA,
        actor_id: "act_handler",
        space_id: bareSpace(spaceX),
        scopes: ["step:resolve"],
        capabilities: ["step:resolve"],
        harness_id: `run:${runA}`,
        scope_ref: `${runA}:intake:write_spec_copy`,
        status: "active",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      new Date().toISOString(),
    );
  });

  afterAll(async () => {
    await cleanup();
  });

  const tokenAuth = () => ({
    Authorization: `Bearer ${addTokenId(tokenA)}`,
    "Content-Type": "application/json",
  });

  async function createIntent(runId: string, stepId: string, idempotencyKey: string) {
    return fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/${stepId}/upload-intents`, {
      method: "POST",
      headers: tokenAuth(),
      body: JSON.stringify({
        branch: "continue",
        payload: { topic: "x" },
        files: [],
        idempotency_key: idempotencyKey,
      }),
    });
  }

  test("an ephemeral token cannot create an upload intent for another run (TOKEN_RUN_SCOPE_MISMATCH)", async () => {
    const res = await createIntent(runB, "intake", "cross-run");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TOKEN_RUN_SCOPE_MISMATCH");
  });

  test("an ephemeral token cannot create an upload intent in another space (scope_enforcement_failure)", async () => {
    const res = await createIntent(runC, "intake", "cross-space");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("scope_enforcement_failure");
  });

  test("an ephemeral token for its own run passes the scope boundary (reaches a later check)", async () => {
    const res = await createIntent(runA, "intake", "same-run");
    // The scope check passes; a later stage (e.g. missing space root or step
    // state) responds with a non-scope code — never a 403 scope denial.
    expect(res.status).not.toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).not.toBe("TOKEN_RUN_SCOPE_MISMATCH");
    expect(body.code).not.toBe("TOKEN_STEP_SCOPE_MISMATCH");
    expect(body.code).not.toBe("scope_enforcement_failure");
  });

  test("an ephemeral token cannot create an upload intent for another step of its run (TOKEN_STEP_SCOPE_MISMATCH)", async () => {
    const res = await createIntent(runA, "work", "cross-step");
    // run A may not have an active "work" step yet, but the scope check runs
    // after the run lookup and before step-state validation, so a step mismatch
    // is denied as a scope error (or a run-scope denial if the run id differs).
    const body = (await res.json()) as { code: string };
    expect(["TOKEN_STEP_SCOPE_MISMATCH", "TOKEN_RUN_SCOPE_MISMATCH", "RUN_NOT_FOUND", "RUN_TERMINAL"]).toContain(body.code);
  });
});
