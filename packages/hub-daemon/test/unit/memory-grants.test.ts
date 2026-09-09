import { describe, expect, test } from "vitest";
import { enforceReadTags, enforceRetainTags, tagGrantFromSpace } from "../../src/memory-grants.js";

describe("memory-grants", () => {
  test("omitted space tags are all scopes", () => {
    expect(tagGrantFromSpace(undefined)).toEqual({ tags: null });
  });

  test("retain omit tags is unscoped even with a grant", () => {
    expect(enforceRetainTags({ tags: ["project:atlas"] }, undefined)).toEqual({ ok: true });
  });

  test("retain rejects tags outside the grant", () => {
    const result = enforceRetainTags({ tags: ["project:atlas"] }, ["secret"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unknown).toEqual(["secret"]);
  });

  test("retain allows granted tags", () => {
    expect(enforceRetainTags({ tags: ["project:atlas"] }, ["project:atlas"])).toEqual({
      ok: true,
      tags: ["project:atlas"],
    });
  });

  test("read with a grant and no agent filter applies grant + untagged", () => {
    expect(enforceReadTags({ tags: ["project:atlas"] }, undefined)).toEqual({
      ok: true,
      filter: { tags: ["project:atlas"], match: "any", untagged: "include" },
    });
  });

  test("read all-scopes omits the filter when the agent omitted tags", () => {
    expect(enforceReadTags({ tags: null }, undefined)).toEqual({ ok: true });
  });

  test("read empty grant is unscoped only, not no-filter", () => {
    expect(enforceReadTags({ tags: [] }, undefined)).toEqual({
      ok: true,
      filter: { tags: [], match: "exact", untagged: "include" },
    });
  });

  test("read rejects agent tags outside the grant", () => {
    const result = enforceReadTags({ tags: ["project:atlas"] }, { tags: ["secret"], match: "any" });
    expect(result.ok).toBe(false);
  });

  test("read intersects by allowing a subset of the grant", () => {
    expect(
      enforceReadTags({ tags: ["project:atlas", "user:emily"] }, { tags: ["project:atlas"], match: "all" }),
    ).toEqual({
      ok: true,
      filter: { tags: ["project:atlas"], match: "all" },
    });
  });
});
