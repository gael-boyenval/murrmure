import { describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findDefaultSubjectsPath, resolveMemorySubjectsPath } from "../../src/memory-subjects.js";

describe("memory-subjects", () => {
  test("finds the skill default under the space root", () => {
    const root = mkdtempSync(join(tmpdir(), "memory-subjects-"));
    mkdirSync(join(root, "skills", "memory-use"), { recursive: true });
    const handbook = join(root, "skills", "memory-use", "subjects.yaml");
    writeFileSync(handbook, "- name: architecture\n  when: Shape.\n");
    expect(findDefaultSubjectsPath(root)).toBe(handbook);
  });

  test("env wins over space declaration", async () => {
    const path = await resolveMemorySubjectsPath({
      env: { MURRMURE_MEMORY_SUBJECTS: "/tmp/handbook.yaml" },
      spaces: [],
      bindingsFor: async () => [],
    });
    expect(path).toBe("/tmp/handbook.yaml");
  });

  test("uses declared memory_subjects on the first space with a local binding", async () => {
    const root = mkdtempSync(join(tmpdir(), "memory-subjects-decl-"));
    mkdirSync(join(root, "skills", "memory-use"), { recursive: true });
    const handbook = join(root, "skills", "memory-use", "subjects.yaml");
    writeFileSync(handbook, "- name: architecture\n  when: Shape.\n");
    const path = await resolveMemorySubjectsPath({
      env: {},
      spaces: [
        {
          space_id: "spc_demo",
          slug: "demo",
          status: "active",
          memory_subjects: "skills/memory-use/subjects.yaml",
        },
      ],
      bindingsFor: async () => [{ host: "local", path: root, primary: true }],
    });
    expect(path).toBe(handbook);
  });
});
