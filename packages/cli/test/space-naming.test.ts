import { describe, expect, test } from "vitest";
import {
  defaultSpaceName,
  normalizeSpaceSlug,
  resolveSpaceIdentity,
  validateSpaceSlug,
} from "../src/wizard/space-naming.js";

describe("setup space naming", () => {
  test("defaults the display name and slug from the project folder", () => {
    expect(defaultSpaceName("/tmp/My First Project")).toBe("My First Project");
    expect(resolveSpaceIdentity("/tmp/My First Project")).toEqual({
      name: "My First Project",
      slug: "my-first-project",
    });
  });

  test("normalizes punctuation and Unicode deterministically", () => {
    expect(normalizeSpaceSlug("  Crème brûlée & Déjà Vu!  ")).toBe(
      "creme-brulee-deja-vu",
    );
    expect(normalizeSpaceSlug("日本語")).toBe("space");
  });

  test("preserves a valid edited slug", () => {
    expect(resolveSpaceIdentity("/tmp/folder", {
      name: "Human Readable Name",
      slug: "edited-space-slug",
    })).toEqual({
      name: "Human Readable Name",
      slug: "edited-space-slug",
    });
  });

  test("rejects invalid edited slugs", () => {
    expect(validateSpaceSlug("Upper Case")).toBeDefined();
    expect(() => resolveSpaceIdentity("/tmp/folder", {
      name: "Name",
      slug: "Upper Case",
    })).toThrow(/lowercase/);
  });
});
