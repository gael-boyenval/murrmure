import { describe, expect, test, beforeAll, afterAll } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId, inboxFilePath } from "@murrmure/hub-core";

describe("http/artifacts/transfer", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceA: string;
  let spaceB: string;
  let projectA: string;
  let projectB: string;
  let hubDataDir: string;

  beforeAll(async () => {
    projectA = mkdtempSync(join(tmpdir(), "artifact-space-a-"));
    projectB = mkdtempSync(join(tmpdir(), "artifact-space-b-"));

    const binB = join(projectB, "bin");
    mkdirSync(binB, { recursive: true });
    const script = join(binB, "read-diff.sh");
    writeFileSync(
      script,
      '#!/bin/sh\nfile=$(find .mrmr/dev/inbox -name openapi.diff 2>/dev/null | head -1)\nif [ -z "$file" ] || [ ! -f "$file" ]; then echo \'{"ok":false}\'; exit 1; fi\nnode -e "const fs=require(\'fs\');const p=process.argv[1];console.log(JSON.stringify({ok:true,content:fs.readFileSync(p,\'utf8\')}))" "$file"\n',
    );
    chmodSync(script, 0o755);

    hubDataDir = mkdtempSync(join(tmpdir(), "hub-artifact-transfer-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000004";
    const daemon = await startHubDaemon({
      databasePath: join(hubDataDir, "murrmure.db"),
      port: 0,
      dataDir: join(hubDataDir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(hubDataDir, { recursive: true, force: true });
      rmSync(projectA, { recursive: true, force: true });
      rmSync(projectB, { recursive: true, force: true });
    };

    const auth = authHeaders();

    const createdA = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "artifact-a", name: "Artifact A" }),
    });
    spaceA = (await createdA.json()).space_id;

    const createdB = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "artifact-b", name: "Artifact B" }),
    });
    spaceB = (await createdB.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceA}/link`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ path: projectA, primary: true }),
    });
    await fetch(`${baseUrl}/v1/spaces/${spaceB}/link`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ path: projectB, primary: true }),
    });

    await fetch(`${baseUrl}/v1/spaces/${spaceB}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:consume",
            file: {
              version: 1,
              actions: {
                consume_diff: {
                  executor: "shell",
                  command: "./bin/read-diff.sh",
                },
              },
            },
          },
          executors: {
            digest: "sha256:exec",
            file: {
              executors: {
                shell: {
                  binding: { type: "shell_spawn", executor_id: "shell" },
                },
              },
            },
          },
          flows: [],
          views: [],
        },
      }),
    });
  });

  afterAll(() => cleanup?.());

  function authHeaders() {
    return {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };
  }

  test("register, materialize via materialize route, and invoke route removed", async () => {
    const diff = "diff --git a/main.ts b/main.ts";
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceA,
        "x-murrmure-name": "openapi.diff",
        "x-murrmure-authorized-readers": spaceB,
      },
      body: Buffer.from(diff, "utf-8"),
    });
    expect(put.status).toBe(201);
    const { artifact } = await put.json();
    expect(artifact.transfer_id).toMatch(/^xfr_/);

    const invoke = await fetch(`${baseUrl}/v1/spaces/${spaceB}/actions/consume_diff/invoke`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        artifacts_in: [artifact.transfer_id],
      }),
    });
    expect(invoke.status).toBe(404);

    const materialize = await fetch(`${baseUrl}/v1/artifacts/${artifact.transfer_id}/materialize`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ space_id: spaceB }),
    });
    expect(materialize.status).toBe(200);

    const inbox = inboxFilePath(projectB, artifact.transfer_id, "openapi.diff");
    expect(existsSync(inbox)).toBe(true);
    expect(readFileSync(inbox, "utf-8")).toBe(diff);
  });

  test("action invoke route is removed — inline cap unreachable via invoke (404)", async () => {
    const oversized = "x".repeat(70_000);
    const invoke = await fetch(`${baseUrl}/v1/spaces/${spaceB}/actions/consume_diff/invoke`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ params: { blob: oversized } }),
    });
    expect(invoke.status).toBe(404);
  });

  test("digest mismatch on materialize fails closed", async () => {
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceA,
        "x-murrmure-name": "tamper.diff",
        "x-murrmure-authorized-readers": spaceB,
      },
      body: Buffer.from("original", "utf-8"),
    });
    const { artifact } = await put.json();

    const exchangePath = join(
      hubDataDir,
      "data",
      "exchanges",
      artifact.transfer_id,
      "tamper.diff",
    );
    writeFileSync(exchangePath, "tampered");

    const materialize = await fetch(`${baseUrl}/v1/artifacts/${artifact.transfer_id}/materialize`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ space_id: spaceB }),
    });
    expect(materialize.status).toBe(422);
    const body = await materialize.json();
    expect(body.code).toBe("ARTIFACT_DIGEST_MISMATCH");
  });

  test("step resolve promotes work upload to stable artifact slot", async () => {
    const project = mkdtempSync(join(tmpdir(), "artifact-step-resolve-"));
    try {
      await fetch(`${baseUrl}/v1/spaces/${spaceA}/link`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ path: project, primary: true }),
      });

      const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceA}/grants`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          label: "artifact-step-agent",
          capabilities: ["space:read", "flow:run", "step:resolve"],
        }),
      });
      const agentToken = (await grantRes.json()).token;
      const agentAuth = {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      };

      const flowBundle = {
        actions: { digest: "sha256:a", file: { version: 1, actions: {} } },
        executors: {
          digest: "sha256:e",
          file: {
            version: 1,
            executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
          },
        },
        hooks: { digest: "sha256:h", file: { version: 1, hooks: {} } },
        flows: [
          {
            flow_id: "flw_artifact_intake",
            rel_path: "flows/artifact-intake/flow.manifest.yaml",
            digest: "sha256:f",
            manifest: {
              apiVersion: "murrmure.flow/v1",
              name: "artifact-intake",
              triggers: { manual: true },
              steps: [
                {
                  id: "intake",
                  branches: {
                    continue: {
                      schema: { type: "object", required: ["topic"] },
                      artifact_slots: { spec: { max_bytes: 65536 } },
                      route: { run: "completed" },
                    },
                  },
                },
              ],
            },
          },
        ],
      };

      await fetch(`${baseUrl}/v1/spaces/${spaceA}/apply`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ bundle: flowBundle }),
      });

      const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
        method: "POST",
        headers: agentAuth,
        body: JSON.stringify({ title: "artifact intake", space_id: spaceA }),
      });
      const { session_id } = await sessionRes.json();

      const runRes = await fetch(`${baseUrl}/v1/flows/flw_artifact_intake/run`, {
        method: "POST",
        headers: agentAuth,
        body: JSON.stringify({ session_id, space_id: spaceA, input: {} }),
      });
      expect(runRes.status).toBe(201);
      const { run_id } = await runRes.json();

      const artifactBytes = Buffer.from("# Spec\n", "utf-8");
      const intent = await fetch(`${baseUrl}/v1/runs/${run_id}/steps/intake/upload-intents`, {
        method: "POST",
        headers: agentAuth,
        body: JSON.stringify({
          branch: "continue",
          payload: { topic: "demo" },
          files: [{
            slot: "spec",
            name: "spec.md",
            media_type: "text/markdown",
            size_bytes: artifactBytes.length,
          }],
          idempotency_key: "artifact-step-resolve",
        }),
      });
      const intentBody = await intent.json();
      expect(intent.status, JSON.stringify(intentBody)).toBe(201);
      const { intent_id } = intentBody;
      const upload = await fetch(`${baseUrl}/v1/upload-intents/${intent_id}/files/0`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: artifactBytes,
      });
      expect(upload.status).toBe(200);

      const resolve = await fetch(`${baseUrl}/v1/runs/${run_id}/steps/intake/resolve`, {
        method: "POST",
        headers: agentAuth,
        body: JSON.stringify({
          branch: "continue",
          payload: { topic: "demo" },
          upload_intent_id: intent_id,
          idempotency_key: "artifact-step-resolve",
        }),
      });
      expect(resolve.status).toBe(200);

      const stable = join(
        project,
        ".mrmr",
        "dev",
        "runs",
        run_id,
        "steps",
        "intake",
        "spec",
        "spec.md",
      );
      expect(existsSync(stable)).toBe(true);
      expect(readFileSync(stable, "utf-8")).toBe("# Spec\n");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
