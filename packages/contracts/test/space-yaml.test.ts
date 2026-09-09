import { describe, expect, test } from "vitest";
import {
  SPACE_YAML_DESCRIPTION_MAX,
  SpaceApplyBundleSchema,
  SpaceYamlFileSchema,
} from "../src/index.js";

describe("space.yaml schema", () => {
  test("accepts slug, name, description, and link", () => {
    const parsed = SpaceYamlFileSchema.parse({
      apiVersion: "murrmure.space/v1",
      slug: "meetings-app",
      name: "Meetings app",
      description: "Convenes product seats and chairs the room.",
      link: { space_id: "spc_demo", host: "local" },
    });
    expect(parsed.description).toBe("Convenes product seats and chairs the room.");
    expect(parsed.name).toBe("Meetings app");
  });

  test("description is optional", () => {
    const parsed = SpaceYamlFileSchema.parse({
      apiVersion: "murrmure.space/v1",
      slug: "demo",
    });
    expect(parsed.description).toBeUndefined();
  });

  test("accepts optional memory_bank", () => {
    const parsed = SpaceYamlFileSchema.parse({
      apiVersion: "murrmure.space/v1",
      slug: "demo",
      memory_bank: "doctrine",
    });
    expect(parsed.memory_bank).toBe("doctrine");
  });

  test("accepts optional memory_tags and memory_subjects", () => {
    const parsed = SpaceYamlFileSchema.parse({
      apiVersion: "murrmure.space/v1",
      slug: "demo",
      memory_bank: "doctrine",
      memory_tags: ["project:atlas"],
      memory_subjects: "skills/memory-use/subjects.yaml",
    });
    expect(parsed.memory_tags).toEqual(["project:atlas"]);
    expect(parsed.memory_subjects).toBe("skills/memory-use/subjects.yaml");
  });

  test("rejects invalid memory_tags and memory_subjects", () => {
    expect(
      SpaceYamlFileSchema.safeParse({
        apiVersion: "murrmure.space/v1",
        slug: "demo",
        memory_tags: [""],
      }).success,
    ).toBe(false);
    expect(
      SpaceYamlFileSchema.safeParse({
        apiVersion: "murrmure.space/v1",
        slug: "demo",
        memory_subjects: "../etc/passwd.yaml",
      }).success,
    ).toBe(false);
    expect(
      SpaceYamlFileSchema.safeParse({
        apiVersion: "murrmure.space/v1",
        slug: "demo",
        memory_subjects: "/abs/subjects.yaml",
      }).success,
    ).toBe(false);
  });

  test("rejects invalid memory_bank", () => {
    for (const memory_bank of ["KB", "kb_foo", "", "a".repeat(33)]) {
      const parsed = SpaceYamlFileSchema.safeParse({
        apiVersion: "murrmure.space/v1",
        slug: "demo",
        memory_bank,
      });
      expect(parsed.success, memory_bank).toBe(false);
    }
  });

  test("rejects description longer than 500 characters", () => {
    const parsed = SpaceYamlFileSchema.safeParse({
      apiVersion: "murrmure.space/v1",
      slug: "demo",
      description: "x".repeat(SPACE_YAML_DESCRIPTION_MAX + 1),
    });
    expect(parsed.success).toBe(false);
  });

  test("apply bundle accepts optional space section", () => {
    const parsed = SpaceApplyBundleSchema.parse({
      space: {
        digest: "sha256:space",
        file: {
          apiVersion: "murrmure.space/v1",
          slug: "demo",
          name: "Demo",
          description: "Purpose text",
        },
      },
      flows: [],
      views: [],
    });
    expect(parsed.space?.file.description).toBe("Purpose text");
  });
});
