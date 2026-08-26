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
