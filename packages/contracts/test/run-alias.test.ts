import { describe, expect, test } from "vitest";
import { V1InstanceSchema, RunSchema } from "../src/index.js";

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const v2Run = {
  run_id: `run_${ULID}`,
  session_id: `ses_${ULID}`,
  flow_id: `flw_${ULID}`,
  flow_digest: "sha256:abc",
  lifecycle: "working" as const,
  exec_context: { branch: "main" },
  reference_run_ids: [],
  started_at: "2026-06-30T12:00:00.000Z",
};

describe("Run / Instance alias", () => {
  test("RunSchema accepts instance_id alias for run_id", () => {
    const withAlias = {
      instance_id: `run_${ULID}`,
      session_id: `ses_${ULID}`,
      lifecycle: "working" as const,
      exec_context: {},
      reference_run_ids: [],
      started_at: "2026-06-30T12:00:00.000Z",
    };
    const parsed = RunSchema.parse(withAlias);
    expect(parsed.run_id).toBe(`run_${ULID}`);
  });

  test("RunSchema roundtrip is stable after alias normalization", () => {
    const parsed = RunSchema.parse(v2Run);
    expect(RunSchema.parse(parsed)).toEqual(parsed);
  });

  test("v1 V1InstanceSchema remains distinct from RunSchema", () => {
    const v1 = {
      instance_id: `ins_${ULID}`,
      space_id: `spc_${ULID}`,
      contract_ref_id: "contract:demo",
      state: "draft",
      revision: 1,
      metadata: {},
    };
    expect(V1InstanceSchema.parse(v1)).toEqual(v1);
    expect(RunSchema.safeParse(v1).success).toBe(false);
  });
});
