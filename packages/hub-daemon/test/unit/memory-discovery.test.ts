import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { memoryToolsForDiscovery } from "../../src/memory-tools.js";
import { readSubjectNames } from "../../src/memory-subjects.js";

describe("memory discovery schemas", () => {
  test("granted tags become enums on retain and read filters", () => {
    const tools = memoryToolsForDiscovery({
      grantedTags: ["project:atlas"],
      subjectNames: ["architecture"],
    });
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    const retainTags = byName.retain?.inputSchema.properties as {
      tags?: { items?: { enum?: string[] } };
      subjects?: { items?: { enum?: string[] } };
    };
    expect(retainTags.tags?.items?.enum).toEqual(["project:atlas"]);
    expect(retainTags.subjects?.items?.enum).toEqual(["architecture"]);
    expect(byName.retain?.inputSchema.required).toEqual(
      expect.arrayContaining(["content", "subjects"]),
    );
    const recallTags = (byName.recall?.inputSchema.properties as { tags?: { properties?: { tags?: { items?: { enum?: string[] } } } } })
      .tags;
    expect(recallTags?.properties?.tags?.items?.enum).toEqual(["project:atlas"]);
  });

  test("all-scopes grant leaves tags as free strings", () => {
    const tools = memoryToolsForDiscovery({ grantedTags: null, subjectNames: [] });
    const retain = tools.find((tool) => tool.name === "retain");
    const tags = (retain?.inputSchema.properties as { tags?: { items?: { enum?: string[] } } }).tags;
    expect(tags?.items?.enum).toBeUndefined();
    expect(retain?.description).toContain("all scopes");
  });

  test("readSubjectNames parses the handbook list", () => {
    const dir = mkdtempSync(join(tmpdir(), "memory-handbook-"));
    const path = join(dir, "subjects.yaml");
    writeFileSync(path, "- name: architecture\n  when: Shape.\n- name: harness\n  when: Tests.\n");
    expect(readSubjectNames(path)).toEqual(["architecture", "harness"]);
  });
});
