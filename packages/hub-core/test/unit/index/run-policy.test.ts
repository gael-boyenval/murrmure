import { describe, expect, test } from "vitest";
import {
  HandlersFileSchema,
  RunPolicySchema,
  RUN_POLICY_UNKNOWN_FLOW,
  RUN_POLICY_AMBIGUOUS_FLOW,
  RUN_POLICY_DUPLICATE,
  type RunPolicy,
} from "@murrmure/contracts";
import {
  resolveRunPolicies,
  buildRunPolicyRows,
  type RunPolicyFlow,
} from "../../../src/index/run-policy.js";

function flow(name: string, opts: Partial<RunPolicyFlow> = {}): RunPolicyFlow {
  return {
    name,
    flow_id: `flw_${name}`,
    digest: `sha256:${name}`,
    origin_space_id: "spc_demo",
    ...opts,
  };
}

describe("RunPolicySchema", () => {
  test("accepts a valid policy with integer max_concurrent_runs >= 1", () => {
    expect(RunPolicySchema.parse({ flow: "my-dev-flow", max_concurrent_runs: 1 })).toEqual({
      flow: "my-dev-flow",
      max_concurrent_runs: 1,
    });
  });

  test("rejects max_concurrent_runs < 1", () => {
    expect(RunPolicySchema.safeParse({ flow: "f", max_concurrent_runs: 0 }).success).toBe(false);
    expect(RunPolicySchema.safeParse({ flow: "f", max_concurrent_runs: -1 }).success).toBe(false);
  });

  test("rejects non-integer max_concurrent_runs", () => {
    expect(RunPolicySchema.safeParse({ flow: "f", max_concurrent_runs: 1.5 }).success).toBe(false);
  });

  test("rejects empty flow alias", () => {
    expect(RunPolicySchema.safeParse({ flow: "", max_concurrent_runs: 1 }).success).toBe(false);
  });

  test("rejects unknown extra keys (strict)", () => {
    expect(
      RunPolicySchema.safeParse({ flow: "f", max_concurrent_runs: 1, queue: true }).success,
    ).toBe(false);
  });
});

describe("HandlersFileSchema run_policies", () => {
  test("absent run_policies defaults to []", () => {
    const parsed = HandlersFileSchema.parse({ version: 1, handlers: [] });
    expect(parsed.run_policies).toEqual([]);
  });

  test("accepts handlers with run_policies", () => {
    const parsed = HandlersFileSchema.parse({
      version: 1,
      run_policies: [{ flow: "my-dev-flow", max_concurrent_runs: 1 }],
      handlers: [],
    });
    expect(parsed.run_policies).toEqual([{ flow: "my-dev-flow", max_concurrent_runs: 1 }]);
  });
});

describe("resolveRunPolicies", () => {
  test("resolves authored alias to canonical {origin_space_id, flow_id, flow_digest}", () => {
    const res = resolveRunPolicies(
      [{ flow: "my-dev-flow", max_concurrent_runs: 1 }],
      [flow("my-dev-flow", { flow_id: "flw_abc", digest: "sha256:d1", origin_space_id: "spc_origin" })],
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toEqual([
        {
          flow: "my-dev-flow",
          max_concurrent_runs: 1,
          origin_space_id: "spc_origin",
          flow_id: "flw_abc",
          flow_digest: "sha256:d1",
        },
      ]);
    }
  });

  test("absent policy list resolves to [] (unlimited)", () => {
    expect(resolveRunPolicies([], [flow("a")])).toEqual({ ok: true, value: [] });
  });

  test("unknown / stale alias fails apply with RUN_POLICY_UNKNOWN_FLOW", () => {
    const res = resolveRunPolicies([{ flow: "ghost", max_concurrent_runs: 1 }], [flow("real")]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe(RUN_POLICY_UNKNOWN_FLOW);
      expect(res.flow).toBe("ghost");
    }
  });

  test("ambiguous alias (duplicate flow names) fails with RUN_POLICY_AMBIGUOUS_FLOW", () => {
    const res = resolveRunPolicies(
      [{ flow: "dup", max_concurrent_runs: 1 }],
      [flow("dup", { flow_id: "flw_a" }), flow("dup", { flow_id: "flw_b" })],
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(RUN_POLICY_AMBIGUOUS_FLOW);
  });

  test("duplicate entries for the same canonical flow fail with RUN_POLICY_DUPLICATE", () => {
    const res = resolveRunPolicies(
      [
        { flow: "a", max_concurrent_runs: 1 },
        { flow: "a", max_concurrent_runs: 2 },
      ],
      [flow("a")],
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(RUN_POLICY_DUPLICATE);
  });

  test("rename: alias resolves by authored name to the new flow_id", () => {
    const res = resolveRunPolicies(
      [{ flow: "renamed", max_concurrent_runs: 1 }],
      [flow("renamed", { flow_id: "flw_new", digest: "sha256:new" })],
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value[0]?.flow_id).toBe("flw_new");
      expect(res.value[0]?.flow_digest).toBe("sha256:new");
    }
  });

  test("origin separation: same name in two origins is ambiguous", () => {
    const res = resolveRunPolicies(
      [{ flow: "shared", max_concurrent_runs: 1 }],
      [
        flow("shared", { flow_id: "flw_a", origin_space_id: "spc_one" }),
        flow("shared", { flow_id: "flw_b", origin_space_id: "spc_two" }),
      ],
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(RUN_POLICY_AMBIGUOUS_FLOW);
  });

  test("digest change: resolved policy carries the new flow digest", () => {
    const res = resolveRunPolicies(
      [{ flow: "a", max_concurrent_runs: 1 }],
      [flow("a", { digest: "sha256:updated" })],
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]?.flow_digest).toBe("sha256:updated");
  });
});

describe("buildRunPolicyRows", () => {
  test("rows are keyed by flow_id with digest = flow_digest", () => {
    const rows = buildRunPolicyRows([
      {
        flow: "a",
        max_concurrent_runs: 1,
        origin_space_id: "spc_o",
        flow_id: "flw_a",
        flow_digest: "sha256:da",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("flw_a");
    expect(rows[0]?.digest).toBe("sha256:da");
    expect(JSON.parse(rows[0]?.payload_json ?? "{}")).toMatchObject({ flow_id: "flw_a" });
  });
});
