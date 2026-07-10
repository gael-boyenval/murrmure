import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ArtifactV1Schema,
  ContractV2Schema,
  ExecutorBindingSchema,
  FlowAttachPayloadSchema,
  FlowIndexEntrySchema,
  FlowManifestSchema,
  GateSchema,
  HooksFileSchema,
  HubEventSchema,
  IndexedActionSchema,
  V1InstanceSchema,
  JournalEntrySchema,
  PrefixedIdSchema,
  RunSchema,
  RunStepMemoSchema,
  SessionSchema,
  SpaceCreateCommandSchema,
  WaitConditionSchema,
  hubEventToJournalEntry,
  JOURNAL_EVENT_TYPES,
} from "../src/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, "../../../fixtures/hub");
const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("ids/prefixed", () => {
  const validUlid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

  test("accepts valid prefixed ULID", () => {
    const schema = PrefixedIdSchema("spc");
    expect(schema.safeParse(`spc_${validUlid}`).success).toBe(true);
  });

  test("rejects bare ULID", () => {
    const schema = PrefixedIdSchema("spc");
    expect(schema.safeParse(validUlid).success).toBe(false);
  });

  test("rejects wrong prefix", () => {
    const schema = PrefixedIdSchema("spc");
    expect(schema.safeParse(`ins_${validUlid}`).success).toBe(false);
  });
});

describe("contract-v2", () => {
  test("parses linear-demo-v2 fixture", () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES, "contracts/linear-demo-v2.json"), "utf-8"),
    );
    const parsed = ContractV2Schema.parse(raw);
    expect(parsed.schemaVersion).toBe("2.0");
    expect(parsed.transitions[0]?.gate?.mode).toBe("any");
  });
});

describe("entities/hub-event", () => {
  test("roundtrips envelope", () => {
    const event = {
      seq: 1,
      space_seq: 1,
      event_id: `evt_${ULID}`,
      type: "state.transitioned",
      outcome: "success" as const,
      space_id: `spc_${ULID}`,
      actor_id: "actor_dev",
      token_id: `tok_${ULID}`,
      ts: "2026-06-20T12:00:00.000Z",
      payload: { event: "submit" },
      blob_refs: [],
    };
    const parsed = HubEventSchema.parse(event);
    expect(HubEventSchema.safeParse(parsed).success).toBe(true);
  });

  test("hubEventToJournalEntry maps to CloudEvents shape", () => {
    const event = HubEventSchema.parse({
      seq: 1,
      space_seq: 1,
      event_id: `evt_${ULID}`,
      type: JOURNAL_EVENT_TYPES.ACTION_COMPLETED,
      outcome: "success",
      space_id: `spc_${ULID}`,
      run_id: `run_${ULID}`,
      session_id: `ses_${ULID}`,
      actor_id: "actor_dev",
      token_id: `tok_${ULID}`,
      ts: "2026-06-30T12:00:00.000Z",
      payload: { step_id: "review" },
      blob_refs: [],
    });
    const journal = hubEventToJournalEntry(event);
    expect(journal.specversion).toBe("1.0");
    expect(journal.subject).toBe(`sessions/ses_${ULID}/runs/run_${ULID}`);
  });

  test("hubEventToJournalEntry maps v1 instance_id ins_* to run_id", () => {
    const event = HubEventSchema.parse({
      seq: 2,
      space_seq: 1,
      instance_seq: 1,
      event_id: `evt_${ULID}`,
      type: "state.transitioned",
      outcome: "success",
      space_id: `spc_${ULID}`,
      instance_id: `ins_${ULID}`,
      session_id: `ses_${ULID}`,
      actor_id: "actor_dev",
      token_id: `tok_${ULID}`,
      ts: "2026-06-30T12:00:00.000Z",
      payload: { event: "submit" },
      blob_refs: [],
    });
    const journal = hubEventToJournalEntry(event);
    expect(journal.run_id).toBe(`run_${ULID}`);
    expect(journal.subject).toBe(`sessions/ses_${ULID}/runs/run_${ULID}`);
    expect(JournalEntrySchema.safeParse(journal).success).toBe(true);
  });
});

describe("rev-1 entity schemas", () => {
  test("SessionSchema roundtrip", () => {
    const session = {
      session_id: `ses_${ULID}`,
      title: "Feature Y",
      subject: "feature-Y",
      status: "active" as const,
      created_by: { type: "actor" as const, actor_id: "actor_dev" },
      spaces_touched: [`spc_${ULID}`],
    };
    expect(SessionSchema.parse(session)).toEqual(session);
  });

  test("RunSchema roundtrip", () => {
    const run = {
      run_id: `run_${ULID}`,
      session_id: `ses_${ULID}`,
      flow_id: `flw_${ULID}`,
      flow_digest: "sha256:abc",
      lifecycle: "working" as const,
      exec_context: {},
      reference_run_ids: [],
      started_at: "2026-06-30T12:00:00.000Z",
    };
    expect(RunSchema.parse(run)).toEqual(run);
  });

  test("RunStepMemoSchema roundtrip", () => {
    const memo = {
      run_id: `run_${ULID}`,
      step_id: "research",
      status: "completed" as const,
      idempotency_key: `${ULID}:research:0`,
    };
    expect(RunStepMemoSchema.parse(memo)).toEqual(memo);
  });

  test("GateSchema rev-1 shape", () => {
    const gate = {
      gate_id: `chk_${ULID}`,
      run_id: `run_${ULID}`,
      session_id: `ses_${ULID}`,
      step_id: "review",
      status: "pending" as const,
      resolve_mode: "any_one" as const,
      assignees: ["actor_reviewer"],
    };
    expect(GateSchema.parse(gate)).toMatchObject(gate);
  });

  test("IndexedActionSchema roundtrip", () => {
    const action = {
      name: "review_url",
      space_id: `spc_${ULID}`,
      executor: "cursor-mcp",
      timeout_ms: 600_000,
      response_schema: "murrmure.schemas/review_url.v1.json",
    };
    expect(IndexedActionSchema.parse(action)).toEqual(action);
  });

  test("ExecutorBindingSchema discriminated union", () => {
    expect(
      ExecutorBindingSchema.parse({ type: "mcp_session", executor_id: "cursor-mcp" }).type,
    ).toBe("mcp_session");
    expect(
      ExecutorBindingSchema.parse({ type: "queue_poll", executor_id: "worker-1" }).type,
    ).toBe("queue_poll");
  });

  test("ArtifactV1Schema roundtrip", () => {
    const artifact = {
      kind: "mrmr.artifact/v1" as const,
      transfer_id: `xfr_${ULID}`,
      digest: "sha256:deadbeef",
      name: "openapi.diff",
      size_bytes: 100,
      authorized_readers: [`spc_${ULID}`],
      hold: true,
    };
    expect(ArtifactV1Schema.parse(artifact)).toEqual(artifact);
  });

  test("FlowManifestSchema roundtrip", () => {
    const manifest = {
      apiVersion: "murrmure.flow/v1" as const,
      name: "feature-delivery",
      start: { manual: true },
      steps: [
        {
          id: "research",
          role: "agent" as const,
          branches: {
            completed: { schema: { type: "object" }, next: null },
          },
        },
      ],
    };
    expect(FlowManifestSchema.parse(manifest)).toEqual(manifest);
  });

  test("FlowIndexEntrySchema roundtrip", () => {
    const entry = {
      flow_id: `flw_${ULID}`,
      origin_space_id: `spc_${ULID}`,
      digest: "sha256:manifest",
      name: "feature-delivery",
      start: { manual: true },
      step_spaces: [`spc_${ULID}`],
      grants_required: ["flow:run" as const],
    };
    expect(FlowIndexEntrySchema.parse(entry)).toEqual(entry);
  });

  test("HooksFileSchema roundtrip", () => {
    const hooks = {
      version: 1 as const,
      hooks: {
        "on-spec-published": {
          on: { event: { type: "mrmr.spec.published" } },
          do: [{ invoke: { action: "wake_review" } }],
        },
        "on-dev-failure": {
          on: {
            event: {
              type: "murrmure.feedback.failure",
              source: ["/spaces/spc_my_space", "/spaces/spc_dev"],
            },
          },
          do: [{ ensure_session: { title: "Feedback" } }],
        },
      },
    };
    expect(HooksFileSchema.parse(hooks)).toEqual(hooks);
  });

  test("FlowAttachPayloadSchema roundtrip", () => {
    const attach = {
      kind: "murrmure.flow.attach/v1" as const,
      manifest: {
        apiVersion: "murrmure.flow/v1" as const,
        name: "agent-proposed",
        start: { manual: true },
        steps: [
          {
            id: "step1",
            role: "agent" as const,
            branches: {
              completed: { schema: { type: "object" }, next: null },
            },
          },
        ],
      },
    };
    expect(FlowAttachPayloadSchema.parse(attach)).toEqual(attach);
  });

  test("JournalEntrySchema roundtrip", () => {
    const entry = {
      specversion: "1.0" as const,
      id: `evt_${ULID}`,
      source: `/spaces/spc_${ULID}`,
      type: JOURNAL_EVENT_TYPES.SESSION_CREATED,
      time: "2026-06-30T12:00:00.000Z",
      seq: 1,
      space_id: `spc_${ULID}`,
      session_id: `ses_${ULID}`,
    };
    expect(JournalEntrySchema.parse(entry)).toEqual(entry);
  });
});

describe("wait-condition", () => {
  test("parses all union arms", () => {
    const arms = [
      { type: "state", state: "review" },
      { type: "gate", resolution: "approved" },
      { type: "event", event_type: "submitted" },
      { type: "contract", capability_id: "linear-demo" },
      { type: "compound", all_of: [{ type: "state", state: "done" }] },
    ];
    for (const arm of arms) {
      expect(WaitConditionSchema.safeParse(arm).success).toBe(true);
    }
  });
});

describe("commands/roundtrip", () => {
  test("space.create golden roundtrip", () => {
    const cmd = {
      kind: "space.create" as const,
      provenance: {
        space_id: `spc_${ULID}`,
        actor_id: "actor_bootstrap",
        token_id: `tok_${ULID}`,
      },
      slug: "review-alpha",
    };
    const parsed = SpaceCreateCommandSchema.parse(cmd);
    expect(SpaceCreateCommandSchema.safeParse(parsed).success).toBe(true);
  });
});
