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

  test("unknown foreign bank retain is denied as MEMORY_BANK_UNKNOWN", async () => {
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
        arguments: { bank: "no-such-bank", content: "should not land" },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; capability?: string };
    expect(body.code).toBe("MEMORY_BANK_UNKNOWN");
    expect(body.capability).toBe("memory:write");
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

describe("http/mcp/memory-proxy cross-bank grants", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let ownerSpace = "";
  let readerSpace = "";
  let otherSpace = "";
  let cleanup: (() => void) | undefined;
  const memory = new InMemoryMemoryMcp();

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-memory-cross-bank-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000089";
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

    ownerSpace = await createSpace(baseUrl, bootstrapToken, { slug: "memory-owner" });
    readerSpace = await createSpace(baseUrl, bootstrapToken, { slug: "memory-reader" });
    otherSpace = await createSpace(baseUrl, bootstrapToken, { slug: "memory-other" });

    for (const [id, slug, bank] of [
      [ownerSpace, "memory-owner", "kb"],
      [readerSpace, "memory-reader", "print-business"],
      [otherSpace, "memory-other", "doctrine"],
    ] as const) {
      const applyRes = await applySpaceBundle(baseUrl, bootstrapToken, id, {
        space: {
          digest: `sha256:${slug}`,
          file: { apiVersion: "murrmure.space/v1", slug, name: slug, memory_bank: bank },
        },
      });
      expect(applyRes.status).toBe(200);
    }
  });

  afterAll(() => cleanup?.());

  async function mintFor(spaceId: string, capabilities: string[]): Promise<string> {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: capabilities.join("-"), capabilities }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  function authHeaders(token: string) {
    return {
      Authorization: `Bearer ${token.startsWith("tok_") ? token : addTokenId(token)}`,
      "Content-Type": "application/json",
    };
  }

  async function callTool(token: string, spaceId: string, name: string, args: Record<string, unknown>) {
    return fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name, space_id: spaceId, arguments: args }),
    });
  }

  async function grantRead(readerId: string) {
    const res = await fetch(`${baseUrl}/v1/spaces/${ownerSpace}/memory-bank-grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ reader_space_id: readerId }),
    });
    expect([200, 201]).toContain(res.status);
    return (await res.json()) as { grant: { grant_id: string } };
  }

  test("own-bank recall still succeeds", async () => {
    const token = await mintFor(ownerSpace, ["memory:read", "memory:write"]);
    const retain = await callTool(token, ownerSpace, "retain", {
      bank: "kb",
      content: "Owner fact about invoices.",
    });
    expect(retain.status).toBe(200);
    const recall = await callTool(token, ownerSpace, "recall", { bank: "kb", query: "invoices" });
    expect(recall.status).toBe(200);
    const body = (await recall.json()) as { result: { results: Array<{ text: string }> } };
    expect(body.result.results.some((row) => row.text.includes("Owner fact"))).toBe(true);
  });

  test("granted foreign recall/reflect/recent forward the requested bank", async () => {
    const ownerToken = await mintFor(ownerSpace, ["memory:read", "memory:write"]);
    await callTool(ownerToken, ownerSpace, "retain", {
      bank: "kb",
      content: "Shared catalog fact.",
    });
    const { grant } = await grantRead(readerSpace);
    const readerToken = await mintFor(readerSpace, ["memory:read", "memory:write"]);

    const recall = await callTool(readerToken, readerSpace, "recall", { bank: "kb", query: "catalog" });
    expect(recall.status).toBe(200);
    const recalled = (await recall.json()) as { result: { results: Array<{ text: string; bank?: string }> } };
    expect(recalled.result.results.some((row) => row.text.includes("Shared catalog"))).toBe(true);

    const reflect = await callTool(readerToken, readerSpace, "reflect", { bank: "kb", query: "catalog" });
    expect(reflect.status).toBe(200);
    const reflected = (await reflect.json()) as { result: { answer: string | null } };
    expect(reflected.result.answer).toContain("Shared catalog");

    const recent = await callTool(readerToken, readerSpace, "recent", { bank: "kb" });
    expect(recent.status).toBe(200);

    const journal = await fetch(
      `${baseUrl}/v1/journal?type=${encodeURIComponent("mrmr.memory.bank_accessed")}&space_id=${readerSpace}`,
      { headers: bootstrapAuth(bootstrapToken) },
    );
    expect(journal.status).toBe(200);
    const entries = ((await journal.json()) as { entries: Array<{ type: string; data: Record<string, unknown> }> })
      .entries;
    expect(entries.length).toBeGreaterThan(0);
    const access = entries.find((entry) => {
      const data = entry.data;
      return data.decision === "allowed" && data.tool === "recall" && data.grant_id === grant.grant_id;
    });
    expect(access).toBeTruthy();
    expect(JSON.stringify(access?.data)).not.toContain("Shared catalog");
    expect(access?.data.caller_space_id).toBe(readerSpace);
    expect(access?.data.target_bank).toBe("kb");
  });

  test("ungranted and unknown foreign reads fail closed", async () => {
    const readerToken = await mintFor(readerSpace, ["memory:read"]);
    const ungranted = await callTool(readerToken, readerSpace, "recall", {
      bank: "doctrine",
      query: "secret",
    });
    expect(ungranted.status).toBe(403);
    const ungrantedBody = (await ungranted.json()) as { code: string; capability?: string };
    expect(ungrantedBody.code).toBe("MEMORY_GRANT_DENIED");
    expect(ungrantedBody.capability).toBe("memory:read");

    const unknown = await callTool(readerToken, readerSpace, "recall", {
      bank: "missing-bank",
      query: "secret",
    });
    expect(unknown.status).toBe(400);
    const unknownBody = (await unknown.json()) as { code: string; capability?: string };
    expect(unknownBody.code).toBe("MEMORY_BANK_UNKNOWN");
    expect(unknownBody.capability).toBe("memory:read");
  });

  test("foreign retain and retire stay denied even with a read grant", async () => {
    await grantRead(readerSpace);
    const readerToken = await mintFor(readerSpace, ["memory:read", "memory:write"]);
    const retain = await callTool(readerToken, readerSpace, "retain", {
      bank: "kb",
      content: "should not write",
    });
    expect(retain.status).toBe(403);
    const retainBody = (await retain.json()) as { code: string; capability?: string };
    expect(retainBody.code).toBe("MEMORY_GRANT_DENIED");
    expect(retainBody.capability).toBe("memory:write");

    const retire = await callTool(readerToken, readerSpace, "retire", { bank: "kb", id: "fact_1" });
    expect(retire.status).toBe(403);
    expect(((await retire.json()) as { code: string }).code).toBe("MEMORY_GRANT_DENIED");
  });

  test("revoke then deny", async () => {
    const { grant } = await grantRead(readerSpace);
    const readerToken = await mintFor(readerSpace, ["memory:read"]);
    const before = await callTool(readerToken, readerSpace, "recall", { bank: "kb", query: "catalog" });
    expect(before.status).toBe(200);

    const revoked = await fetch(
      `${baseUrl}/v1/spaces/${ownerSpace}/memory-bank-grants/${grant.grant_id}`,
      { method: "DELETE", headers: bootstrapAuth(bootstrapToken) },
    );
    expect(revoked.status).toBe(200);

    const after = await callTool(readerToken, readerSpace, "recall", { bank: "kb", query: "catalog" });
    expect(after.status).toBe(403);
    expect(((await after.json()) as { code: string }).code).toBe("MEMORY_GRANT_DENIED");
  });

  test("murrmure_list_memory_banks returns only own plus granted banks", async () => {
    await grantRead(readerSpace);
    const readerToken = await mintFor(readerSpace, ["memory:read"]);
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: authHeaders(readerToken),
      body: JSON.stringify({ name: "murrmure_list_memory_banks", space_id: readerSpace, arguments: {} }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { banks: Array<{ bank: string; origin: string }> };
    };
    const banks = body.result.banks.map((row) => row.bank).sort();
    expect(banks).toEqual(["kb", "print-business"]);
    expect(banks).not.toContain("doctrine");
    expect(body.result.banks.find((row) => row.bank === "kb")?.origin).toBe("granted");
    expect(body.result.banks.find((row) => row.bank === "print-business")?.origin).toBe("own");
  });
});
