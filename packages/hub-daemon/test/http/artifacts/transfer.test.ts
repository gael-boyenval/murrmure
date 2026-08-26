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

  test("MCP materializes an authorized xfr into the caller space inbox", async () => {
    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceB}/grants`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        label: "artifact-reader",
        capabilities: ["space:read"],
      }),
    });
    expect(grantRes.status).toBe(200);
    const grant = (await grantRes.json()) as { token: string };

    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceA,
        "x-murrmure-name": "meeting-feedback.txt",
        "x-murrmure-authorized-readers": spaceB,
      },
      body: Buffer.from("artifact feedback", "utf-8"),
    });
    expect(put.status).toBe(201);
    const { artifact } = (await put.json()) as {
      artifact: { transfer_id: string };
    };

    const catalog = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceB}`, {
      headers: { Authorization: `Bearer ${grant.token}` },
    }).then((res) => res.json() as Promise<{ tools: Array<{ name: string }> }>);
    expect(catalog.tools.map((tool) => tool.name)).toContain("murrmure_get_artifact");

    const call = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grant.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceB,
        name: "murrmure_get_artifact",
        arguments: { transfer_id: artifact.transfer_id },
      }),
    });
    expect(call.status).toBe(200);
    const body = (await call.json()) as {
      result: { artifact: { transfer_id: string; local_path: string } };
    };
    expect(body.result.artifact).toMatchObject({
      transfer_id: artifact.transfer_id,
      local_path: `.mrmr/dev/inbox/${artifact.transfer_id}/meeting-feedback.txt`,
    });
    expect(body.result.artifact).not.toHaveProperty("authorized_readers");
    expect(
      readFileSync(inboxFilePath(projectB, artifact.transfer_id, "meeting-feedback.txt"), "utf-8"),
    ).toBe("artifact feedback");

    const aliasCall = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grant.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceB,
        name: "murrmure_get_artifact",
        arguments: { artifact_id: artifact.transfer_id },
      }),
    });
    expect(aliasCall.status).toBe(200);

    const crossSpaceCall = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grant.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceB,
        name: "murrmure_get_artifact",
        arguments: {
          transfer_id: artifact.transfer_id,
          space_id: spaceA,
        },
      }),
    });
    expect(crossSpaceCall.status).toBe(500);
    expect(await crossSpaceCall.json()).toMatchObject({
      message: "Token not valid for this space or action",
    });
  });

  test("MCP artifact tool is included in the default space-read catalog", async () => {
    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceB}/grants`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        label: "artifact-metadata-only",
        capabilities: ["space:read"],
      }),
    });
    expect(grantRes.status).toBe(200);
    const grant = (await grantRes.json()) as { token: string };

    const catalog = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceB}`, {
      headers: { Authorization: `Bearer ${grant.token}` },
    }).then((res) => res.json() as Promise<{ tools: Array<{ name: string }> }>);
    expect(catalog.tools.map((tool) => tool.name)).toContain("murrmure_get_artifact");
    expect(catalog.tools.map((tool) => tool.name)).not.toContain("murrmure_put_artifact");
  });

  test("MCP put_artifact uploads inline content and peer get materializes it", async () => {
    const writerRes = await fetch(`${baseUrl}/v1/spaces/${spaceA}/grants`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        label: "artifact-writer",
        capabilities: ["space:read", "blob:write"],
      }),
    });
    expect(writerRes.status).toBe(200);
    const writer = (await writerRes.json()) as { token: string };

    const readerRes = await fetch(`${baseUrl}/v1/spaces/${spaceB}/grants`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        label: "artifact-reader-peer",
        capabilities: ["space:read"],
      }),
    });
    expect(readerRes.status).toBe(200);
    const reader = (await readerRes.json()) as { token: string };

    const writerCatalog = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceA}`, {
      headers: { Authorization: `Bearer ${writer.token}` },
    }).then((res) => res.json() as Promise<{ tools: Array<{ name: string }> }>);
    expect(writerCatalog.tools.map((tool) => tool.name)).toContain("murrmure_put_artifact");

    const put = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${writer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceA,
        name: "murrmure_put_artifact",
        arguments: {
          content: "kb surprise notes",
          name: "surprise.txt",
          authorized_readers: [spaceB],
        },
      }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as {
      result: { artifact: { transfer_id: string; name: string; size_bytes: number } };
    };
    expect(putBody.result.artifact.transfer_id).toMatch(/^xfr_/);
    expect(putBody.result.artifact.name).toBe("surprise.txt");
    expect(putBody.result.artifact.size_bytes).toBe(Buffer.byteLength("kb surprise notes"));
    expect(putBody.result.artifact).not.toHaveProperty("authorized_readers");

    const get = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reader.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceB,
        name: "murrmure_get_artifact",
        arguments: { transfer_id: putBody.result.artifact.transfer_id },
      }),
    });
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as {
      result: { artifact: { local_path: string } };
    };
    expect(getBody.result.artifact.local_path).toBe(
      `.mrmr/dev/inbox/${putBody.result.artifact.transfer_id}/surprise.txt`,
    );
    expect(
      readFileSync(
        inboxFilePath(projectB, putBody.result.artifact.transfer_id, "surprise.txt"),
        "utf-8",
      ),
    ).toBe("kb surprise notes");

    const xor = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${writer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceA,
        name: "murrmure_put_artifact",
        arguments: { content: "x", path: "notes.txt", name: "notes.txt" },
      }),
    });
    expect(xor.status).toBe(500);
    expect(await xor.json()).toMatchObject({
      message: "exactly one of path or content is required",
    });
  });

  test("MCP put_artifact reads a space-relative path", async () => {
    mkdirSync(join(projectA, "notes"), { recursive: true });
    writeFileSync(join(projectA, "notes", "desk.md"), "canon notes", "utf-8");

    const writerRes = await fetch(`${baseUrl}/v1/spaces/${spaceA}/grants`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        label: "artifact-path-writer",
        capabilities: ["blob:write"],
      }),
    });
    expect(writerRes.status).toBe(200);
    const writer = (await writerRes.json()) as { token: string };

    const put = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${writer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceA,
        name: "murrmure_put_artifact",
        arguments: { path: "notes/desk.md" },
      }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as {
      result: { artifact: { name: string; size_bytes: number } };
    };
    expect(putBody.result.artifact.name).toBe("desk.md");
    expect(putBody.result.artifact.size_bytes).toBe(Buffer.byteLength("canon notes"));

    const escape = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${writer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceA,
        name: "murrmure_put_artifact",
        arguments: { path: "../outside.txt" },
      }),
    });
    expect(escape.status).toBe(500);
    expect(await escape.json()).toMatchObject({
      message: "path escapes the space root",
    });
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
