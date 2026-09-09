import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { InMemoryMemoryMcp } from "../../../src/memory-mcp-client.js";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applySpaceBundle, bootstrapAuth, createSpace } from "../../helpers/space-fixture.js";

describe("http/mcp/memory-proxy", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let spaceId = "";
  let cleanup: (() => void) | undefined;
  const memory = new InMemoryMemoryMcp();

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-memory-proxy-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000088";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
      memoryMcp: memory,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      void daemon.shutdown();
      rmSync(dir, { recursive: true, force: true });
    };

    spaceId = await createSpace(baseUrl, bootstrapToken, { slug: "memory-proxy-space" });
    const applyRes = await applySpaceBundle(baseUrl, bootstrapToken, spaceId, {
      space: {
        digest: "sha256:memory-space",
        file: {
          apiVersion: "murrmure.space/v1",
          slug: "memory-proxy-space",
          name: "Memory proxy",
          memory_bank: "doctrine",
          memory_tags: ["project:atlas"],
        },
      },
    });
    expect(applyRes.status).toBe(200);
    memory.setSubjectNames(["architecture", "harness"]);
  });

  afterAll(() => cleanup?.());

  async function mint(capabilities: string[]): Promise<string> {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: capabilities.join("-"), capabilities }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  test("catalog hides memory tools without memory caps", async () => {
    const token = await mint(["space:read"]);
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as { tools: Array<{ name: string }> };
    const names = body.tools.map((tool) => tool.name);
    expect(names).not.toContain("retain");
    expect(names).not.toContain("recall");
  });

  test("catalog shows memory tools when child is ready and caps are granted", async () => {
    const token = await mint(["memory:read", "memory:write"]);
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
      }>;
    };
    const names = body.tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["retain", "recall", "reflect", "recent", "retire"]));
    const byName = new Map(body.tools.map((tool) => [tool.name, tool]));
    expect(Object.keys(byName.get("retain")?.inputSchema?.properties ?? {})).toEqual(
      expect.arrayContaining(["bank", "content", "tags", "subjects"]),
    );
    expect(Object.keys(byName.get("recall")?.inputSchema?.properties ?? {})).toEqual(
      expect.arrayContaining(["bank", "query", "tags", "subjects", "factTypes", "when"]),
    );
    expect(Object.keys(byName.get("reflect")?.inputSchema?.properties ?? {})).toEqual(
      expect.arrayContaining(["includeBasedOn", "tags", "subjects", "factTypes"]),
    );
    const retainTags = byName.get("retain")?.inputSchema?.properties?.tags as
      | { items?: { enum?: string[] }; description?: string }
      | undefined;
    expect(retainTags?.items?.enum).toEqual(["project:atlas"]);
    const retainSubjects = byName.get("retain")?.inputSchema?.properties?.subjects as
      | { items?: { enum?: string[] } }
      | undefined;
    expect(retainSubjects?.items?.enum).toEqual(["architecture", "harness"]);
    expect(byName.get("retain")?.inputSchema?.required).toEqual(
      expect.arrayContaining(["bank", "content", "subjects"]),
    );
    expect(byName.get("retain")?.description).toContain("project:atlas");
    expect(byName.get("retain")?.description).toContain("architecture");
  });

  test("retain tags and subjects pass through the proxy", async () => {
    const token = await mint(["memory:read", "memory:write"]);
    const auth = {
      Authorization: `Bearer ${token.startsWith("tok_") ? token : addTokenId(token)}`,
      "Content-Type": "application/json",
    };

    const retain = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "retain",
        space_id: spaceId,
        arguments: {
          bank: "doctrine",
          content: "Emily owns the invoice retry queue.",
          tags: ["project:atlas"],
          subjects: ["billing"],
        },
      }),
    });
    expect(retain.status).toBe(200);
    const retained = (await retain.json()) as { result: { facts: Array<{ tags?: string[]; subjects?: string[] }> } };
    expect(retained.result.facts[0]?.tags).toEqual(["project:atlas"]);
    expect(retained.result.facts[0]?.subjects).toEqual(["billing"]);

    const recall = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "recall",
        space_id: spaceId,
        arguments: {
          bank: "doctrine",
          query: "invoice",
          tags: { tags: ["project:atlas"], match: "any" },
          subjects: ["billing"],
        },
      }),
    });
    expect(recall.status).toBe(200);
    const recalled = (await recall.json()) as { result: { results: Array<{ text: string }> } };
    expect(recalled.result.results.some((row) => row.text.includes("Emily"))).toBe(true);
  });

  test("retain rejects tags outside the space grant", async () => {
    const token = await mint(["memory:write"]);
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.startsWith("tok_") ? token : addTokenId(token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "retain",
        space_id: spaceId,
        arguments: { bank: "doctrine", content: "secret", tags: ["secret"] },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MEMORY_GRANT_DENIED");
  });

  test("recall without agent tags applies the space grant filter", async () => {
    const token = await mint(["memory:read", "memory:write"]);
    const auth = {
      Authorization: `Bearer ${token.startsWith("tok_") ? token : addTokenId(token)}`,
      "Content-Type": "application/json",
    };
    await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "retain",
        space_id: spaceId,
        arguments: { bank: "doctrine", content: "Atlas decision.", tags: ["project:atlas"] },
      }),
    });
    const recall = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "recall",
        space_id: spaceId,
        arguments: { bank: "doctrine", query: "Atlas" },
      }),
    });
    expect(recall.status).toBe(200);
    const recalled = (await recall.json()) as { result: { results: Array<{ tags?: string[] }> } };
    expect(recalled.result.results.some((row) => row.tags?.includes("project:atlas"))).toBe(true);
  });

  test("own-bank retain then recall via hub proxy", async () => {
    const token = await mint(["memory:read", "memory:write"]);
    const auth = {
      Authorization: `Bearer ${token.startsWith("tok_") ? token : addTokenId(token)}`,
      "Content-Type": "application/json",
    };

    const retain = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "retain",
        space_id: spaceId,
        arguments: { bank: "doctrine", content: "Meetings close with a retain of the decision." },
      }),
    });
    expect(retain.status).toBe(200);
    const retained = (await retain.json()) as { result: { status: string } };
    expect(retained.result.status).toBe("ok");

    const recall = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "recall",
        space_id: spaceId,
        arguments: { bank: "doctrine", query: "meetings" },
      }),
    });
    expect(recall.status).toBe(200);
    const recalled = (await recall.json()) as { result: { results: Array<{ text: string }> } };
    expect(recalled.result.results.some((row) => row.text.includes("Meetings close"))).toBe(true);
  });

  test("cross-bank retain is denied", async () => {
    const token = await mint(["memory:write"]);
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.startsWith("tok_") ? token : addTokenId(token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "retain",
        space_id: spaceId,
        arguments: { bank: "kb", content: "should not land" },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MEMORY_GRANT_DENIED");
  });

  test("retain without memory:write is unauthorized", async () => {
    const token = await mint(["memory:read"]);
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.startsWith("tok_") ? token : addTokenId(token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "retain",
        space_id: spaceId,
        arguments: { bank: "doctrine", content: "nope" },
      }),
    });
    expect(res.status).toBe(403);
  });
});
