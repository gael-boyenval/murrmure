import { describe, expect, it } from "vitest";
import { formatSchemaLabel, humanizeSchemaKey } from "./schema-label.js";

describe("humanizeSchemaKey", () => {
  it("sentence-cases simple keys", () => {
    expect(humanizeSchemaKey("topic")).toBe("Topic");
    expect(humanizeSchemaKey("notes")).toBe("Notes");
  });

  it("handles snake_case and kebab-case", () => {
    expect(humanizeSchemaKey("review_topic")).toBe("Review topic");
    expect(humanizeSchemaKey("max-retries")).toBe("Max retries");
  });

  it("handles camelCase", () => {
    expect(humanizeSchemaKey("camelCaseField")).toBe("Camel case field");
  });
});

describe("formatSchemaLabel", () => {
  it("uses schema title when provided", () => {
    expect(formatSchemaLabel({ name: "topic", title: "Review topic", required: true })).toBe(
      "Review topic *",
    );
  });

  it("humanizes key when title is absent", () => {
    expect(formatSchemaLabel({ name: "topic", required: true })).toBe("Topic *");
    expect(formatSchemaLabel({ name: "notes", required: false })).toBe("Notes (optional)");
  });

  it("omits suffix when required is undefined", () => {
    expect(formatSchemaLabel({ name: "depth" })).toBe("Depth");
  });

  it("prefers trimmed title over key", () => {
    expect(formatSchemaLabel({ name: "notes", title: "  Comment  ", required: false })).toBe(
      "Comment (optional)",
    );
  });
});
