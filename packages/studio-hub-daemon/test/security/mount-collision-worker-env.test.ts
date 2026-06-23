import { describe, expect, test } from "vitest";
import { STUDIO_DENIAL_CODES } from "@studio/contracts";
import { detectMountCollision } from "../../src/live-apply.js";
import { sanitizedWorkerEnv } from "../../src/capability-worker-pool.js";

type MountLike = { package_id: string; routes_prefix: string; mcp_tools: string[] };

const reviewLoop: MountLike = {
  package_id: "review-loop",
  routes_prefix: "/api/sessions",
  mcp_tools: ["create_review_session"],
};

describe("detectMountCollision", () => {
  test("passes when prefix and tools are disjoint", () => {
    const result = detectMountCollision([reviewLoop], {
      routes_prefix: "/api/specs",
      mcp_tools: ["transition_spec"],
    });
    expect(result).toBeNull();
  });

  test("denies a duplicate route prefix", () => {
    const result = detectMountCollision([reviewLoop], {
      routes_prefix: "/api/sessions",
      mcp_tools: ["something_else"],
    });
    expect(result?.code).toBe(STUDIO_DENIAL_CODES.ROUTE_PREFIX_COLLISION);
    expect(result?.http_status).toBe(409);
    expect(result?.hint).toMatchObject({ owner_package_id: "review-loop" });
  });

  test("denies an MCP tool already owned by another capability", () => {
    const result = detectMountCollision([reviewLoop], {
      routes_prefix: "/api/specs",
      mcp_tools: ["create_review_session"],
    });
    expect(result?.code).toBe(STUDIO_DENIAL_CODES.MCP_TOOL_COLLISION);
    expect(result?.http_status).toBe(409);
    expect(result?.hint).toMatchObject({ tool: "create_review_session", owner_package_id: "review-loop" });
  });
});

describe("sanitizedWorkerEnv", () => {
  test("forwards STUDIO_* identity vars", () => {
    const env = sanitizedWorkerEnv({ STUDIO_SPACE_ID: "spc_x", STUDIO_PACKAGE_ID: "feature-spec" });
    expect(env.STUDIO_SPACE_ID).toBe("spc_x");
    expect(env.STUDIO_PACKAGE_ID).toBe("feature-spec");
  });

  test("does not leak non-allowlisted host secrets", () => {
    const marker = `STUDIO_TEST_SECRET_${Date.now()}`;
    process.env[marker] = "do-not-leak";
    try {
      const env = sanitizedWorkerEnv({ STUDIO_SPACE_ID: "spc_x" });
      expect(env[marker]).toBeUndefined();
    } finally {
      delete process.env[marker];
    }
  });
});
