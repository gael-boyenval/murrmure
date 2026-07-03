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
      '#!/bin/sh\nfile=$(find .mrmr.temp/inbox -name openapi.diff 2>/dev/null | head -1)\nif [ -z "$file" ] || [ ! -f "$file" ]; then echo \'{"ok":false}\'; exit 1; fi\nnode -e "const fs=require(\'fs\');const p=process.argv[1];console.log(JSON.stringify({ok:true,content:fs.readFileSync(p,\'utf8\')}))" "$file"\n',
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

  test("register, materialize, and invoke with artifacts_in", async () => {
    const diff = "diff --git a/main.ts b/main.ts";
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        space_id: spaceA,
        name: "openapi.diff",
        content_base64: Buffer.from(diff, "utf-8").toString("base64"),
        authorized_readers: [spaceB],
      }),
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
    expect(invoke.status).toBe(200);
    const body = await invoke.json();
    expect(body.dispatch.status).toBe("completed");
    expect(body.body?.ok).toBe(true);
    expect(body.body?.content).toBe(diff);

    const inbox = inboxFilePath(projectB, artifact.transfer_id, "openapi.diff");
    expect(existsSync(inbox)).toBe(true);
    expect(readFileSync(inbox, "utf-8")).toBe(diff);
  });

  test("rejects invoke params over 64 KiB inline cap", async () => {
    const oversized = "x".repeat(70_000);
    const invoke = await fetch(`${baseUrl}/v1/spaces/${spaceB}/actions/consume_diff/invoke`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ params: { blob: oversized } }),
    });
    expect(invoke.status).toBe(413);
    const body = await invoke.json();
    expect(body.code).toBe("INLINE_PAYLOAD_EXCEEDED");
  });

  test("digest mismatch on materialize fails closed", async () => {
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        space_id: spaceA,
        name: "tamper.diff",
        content_base64: Buffer.from("original", "utf-8").toString("base64"),
        authorized_readers: [spaceB],
      }),
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
});
