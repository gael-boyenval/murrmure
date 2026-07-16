import type {
  GateItem,
  RunDetailPayload,
  RunGraphPayload,
  SpaceHomeAttentionRow,
  SpaceHomeFlowRow,
  SpaceHomeRunRow,
} from "@murrmure/shell-client";

/** Federated flows granted via `flow:run` but not authored in this space. */
export const availableToRun: SpaceHomeFlowRow[] = [
  {
    flow_id: "flw_ops_digest",
    origin_space_id: "spc_ops",
    name: "Ops daily digest",
    digest: "sha256:ops001",
    can_run: true,
    can_preview: true,
    manual: true,
    authored_here: false,
    triggers: { manual: true },
  },
];

/** Flows from other spaces whose steps invoke this space. */
export const receivingFrom: SpaceHomeFlowRow[] = [
  {
    flow_id: "flw_platform_orchestrator",
    origin_space_id: "spc_platform",
    name: "Platform orchestrator",
    digest: "sha256:plat001",
    can_run: false,
    can_preview: true,
    manual: false,
    authored_here: false,
    triggers: {},
  },
];

export const demoFlows: SpaceHomeFlowRow[] = [
  {
    flow_id: "flw_review_loop",
    origin_space_id: "spc_demo",
    name: "Review loop",
    digest: "sha256:abc123",
    can_run: true,
    can_preview: true,
    manual: true,
    authored_here: true,
    triggers: { manual: true },
  },
  {
    flow_id: "flw_feature_spec",
    origin_space_id: "spc_demo",
    name: "Feature spec",
    digest: "sha256:def456",
    can_run: true,
    can_preview: true,
    manual: true,
    authored_here: true,
    triggers: { manual: true },
  },
  {
    flow_id: "flw_orchestrator",
    origin_space_id: "spc_demo",
    name: "Multi-agent orchestrator",
    digest: "sha256:ghi789",
    can_run: false,
    can_preview: true,
    manual: false,
    authored_here: true,
    triggers: {},
  },
];

export const activeRuns: SpaceHomeRunRow[] = [
  {
    run_id: "run_8f3a2b",
    session_id: "ses_daily_brief",
    lifecycle: "working",
    started_at: "2026-07-01T09:12:00Z",
    title: "Daily brief — July 1",
  },
  {
    run_id: "run_c1d4e5",
    session_id: "ses_review_loop",
    lifecycle: "waiting",
    started_at: "2026-07-01T08:45:00Z",
    title: "Review loop",
  },
];

export const completedRuns: SpaceHomeRunRow[] = Array.from({ length: 20 }, (_, index) => ({
  run_id: `run_prev${String(index + 1).padStart(2, "0")}`,
  session_id: `ses_prev${String(index + 1).padStart(2, "0")}`,
  lifecycle: index % 5 === 0 ? "failed" : "completed",
  started_at: `2026-06-${String(30 - Math.floor(index / 4)).padStart(2, "0")}T14:00:00Z`,
  ended_at: `2026-06-${String(30 - Math.floor(index / 4)).padStart(2, "0")}T14:22:00Z`,
  title: `Feature spec run ${index + 1}`,
}));

export const attentionItems: SpaceHomeAttentionRow[] = [
  {
    kind: "gate",
    gate_id: "gate_review_01",
    run_id: "run_c1d4e5",
    session_id: "ses_review_loop",
    title: "Review loop — human approval needed",
  },
  {
    kind: "run_failed",
    run_id: "run_fail99",
    session_id: "ses_fail99",
    title: "Orchestrator run failed at plan step",
  },
];

export const reviewGate: GateItem = {
  gate_id: "gate_review_01",
  run_id: "run_c1d4e5",
  session_id: "ses_review_loop",
  step_id: "gate:review",
  status: "pending",
  title: "Review loop — human approval needed",
  summary: "Agent completed draft, waiting for your decision.",
  created_at: "2026-07-01T09:30:00Z",
  space_label: "Demo space",
  space_link: "/spaces/spc_demo",
  form: {
    id: "review.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"] },
      { name: "notes", type: "string", required: false },
    ],
  },
};

export const orchestrationGate: GateItem = {
  gate_id: "gate_orch_01",
  run_id: "run_orch_new",
  session_id: "ses_orch_new",
  step_id: "orchestration:proposed",
  status: "pending",
  title: "Validate proposed orchestration",
  summary: "Agent proposed a new multi-step pipeline.",
  created_at: "2026-07-01T07:50:00Z",
  space_label: "Demo space",
  space_link: "/spaces/spc_demo",
  form: {
    id: "orchestration.validate.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"] },
      { name: "notes", type: "string", required: false },
    ],
  },
  orchestration_preview: {
    manifest_name: "agent-proposed pipeline",
    flow_digest: "sha256:preview",
    steps: [
      {
        step_id: "research",
        space: "spc_demo",
        action: "research",
        param_shape: { topic: "string", depth: "string" },
      },
      { step_id: "draft", space: "spc_demo", action: "draft" },
      { step_id: "review", action: "gate" },
    ],
  },
};

export type SessionRunFixture = {
  run_id: string;
  lifecycle: string;
  title: string;
  space_label?: string;
  error_summary?: string;
  last_step?: string;
  started_at?: string;
};

export const sessionRunsWorking: SessionRunFixture[] = [
  {
    run_id: "run_8f3a2b",
    lifecycle: "working",
    title: "Research",
    space_label: "Demo space",
    last_step: "parallel_dev",
    started_at: "2026-07-01T09:12:00Z",
  },
  {
    run_id: "run_c1d4e5",
    lifecycle: "waiting",
    title: "Draft",
    space_label: "Demo space",
    last_step: "invoke:agent",
    started_at: "2026-07-01T08:45:00Z",
  },
];

export const sessionRunsFailed: SessionRunFixture[] = [
  {
    run_id: "run_8f3a2b",
    lifecycle: "completed",
    title: "Research",
    space_label: "Demo space",
    last_step: "parallel_dev",
    started_at: "2026-07-01T09:12:00Z",
  },
  {
    run_id: "run_fail99",
    lifecycle: "failed",
    title: "Draft",
    space_label: "Demo space",
    last_step: "invoke:agent",
    error_summary: "invoke:agent returned exit code 1 after 3 retries.",
    started_at: "2026-07-01T08:45:00Z",
  },
  {
    run_id: "run_c1d4e5",
    lifecycle: "waiting",
    title: "Review loop",
    space_label: "Demo space",
    last_step: "gate:review",
    started_at: "2026-07-01T08:50:00Z",
  },
];

export const parallelGraphActive: RunGraphPayload = {
  run_id: "run_8f3a2b",
  flow_id: "flw_orchestrator",
  nodes: [
    { id: "fork:parallel", step_id: "parallel_dev", kind: "fork", status: "working" },
    { id: "lane:0", step_id: "parallel_dev", kind: "lane", run_id: "run_8f3a2b" },
    { id: "lane:1", step_id: "parallel_dev", kind: "lane", run_id: "run_c1d4e5" },
    { id: "join:parallel", step_id: "parallel_dev", kind: "join", status: "working" },
    { id: "step:plan", step_id: "plan", kind: "invoke", status: "completed" },
    { id: "step:review", step_id: "review", kind: "gate", status: "working" },
  ],
  edges: [
    { id: "fork->0", source: "fork:parallel", target: "lane:0" },
    { id: "fork->1", source: "fork:parallel", target: "lane:1" },
    { id: "plan->review", source: "step:plan", target: "step:review" },
  ],
  lanes: [
    { step_id: "parallel_dev", matrix_index: 0, run_id: "run_8f3a2b", lifecycle: "completed", label: "Research" },
    { step_id: "parallel_dev", matrix_index: 1, run_id: "run_c1d4e5", lifecycle: "working", label: "Draft" },
  ],
  step_memos: [],
};

/** Graph with one failed parallel lane — used by session-failed-lane snapshot. */
export const parallelGraph: RunGraphPayload = {
  run_id: "run_8f3a2b",
  flow_id: "flw_orchestrator",
  nodes: [
    { id: "fork:parallel", step_id: "parallel_dev", kind: "fork", status: "working" },
    { id: "lane:0", step_id: "parallel_dev", kind: "lane", run_id: "run_8f3a2b" },
    { id: "lane:1", step_id: "parallel_dev", kind: "lane", run_id: "run_fail99" },
    { id: "join:parallel", step_id: "parallel_dev", kind: "join", status: "working" },
    { id: "step:plan", step_id: "plan", kind: "invoke", status: "completed" },
    { id: "step:review", step_id: "review", kind: "gate", status: "working" },
  ],
  edges: [
    { id: "fork->0", source: "fork:parallel", target: "lane:0" },
    { id: "fork->1", source: "fork:parallel", target: "lane:1" },
    { id: "plan->review", source: "step:plan", target: "step:review" },
  ],
  lanes: [
    { step_id: "parallel_dev", matrix_index: 0, run_id: "run_8f3a2b", lifecycle: "completed", label: "Research" },
    { step_id: "parallel_dev", matrix_index: 1, run_id: "run_fail99", lifecycle: "failed", label: "Draft" },
  ],
  step_memos: [],
};

export const failedRun = {
  run_id: "run_fail99",
  session_id: "ses_fail99",
  lifecycle: "failed",
  journal_replay: [
    { step_id: "plan", status: "completed" },
    { step_id: "invoke:agent", status: "failed", error: "Upstream timeout after 120s." },
  ],
} as RunDetailPayload;

export const workingRun: RunDetailPayload = {
  run_id: "run_8f3a2b",
  session_id: "ses_daily_brief",
  lifecycle: "working",
  journal_replay: [
    { step_id: "fetch", status: "completed" },
    { step_id: "summarize", status: "working" },
  ],
};

export const notifications = [
  {
    notification_id: "ntf_01",
    kind: "gate" as const,
    status: "pending" as const,
    gate_id: "gate_review_01",
    run_id: "run_c1d4e5",
    session_id: "ses_review_loop",
    space_id: "spc_demo",
    space_hidden: false,
    title: "Review loop — human approval needed",
    summary: "Agent completed draft, waiting for your decision.",
    created_at: "2026-07-01T09:30:00Z",
  },
  {
    notification_id: "ntf_02",
    kind: "run_failed" as const,
    status: "pending" as const,
    run_id: "run_fail99",
    session_id: "ses_fail99",
    space_id: "spc_demo",
    space_hidden: false,
    title: "Orchestrator run failed",
    summary: "plan step returned an error after 3 retries.",
    created_at: "2026-07-01T08:15:00Z",
  },
  {
    notification_id: "ntf_03",
    kind: "gate" as const,
    status: "pending" as const,
    gate_id: "gate_orch_01",
    run_id: "run_orch_new",
    session_id: "ses_orch_new",
    space_id: "spc_ops",
    space_hidden: false,
    title: "Validate proposed orchestration",
    summary: "Agent proposed a new multi-step pipeline.",
    created_at: "2026-07-01T07:50:00Z",
  },
];

export const flowPreviewMeta = {
  name: "Review loop",
  digest: "sha256:abc123def456…",
  spaceName: "Demo space",
  description:
    "Research and draft in Demo space, human review gate, then federated publish to Ops.",
  start: {
    manual: true,
    view_binding: "review-params",
  },
} as const;

export const flowPreviewSteps = [
  { id: "start", kind: "start" },
  { id: "research", kind: "invoke", invoke: { space: "spc_demo", action: "research" } },
  { id: "draft", kind: "invoke", invoke: { space: "spc_demo", action: "draft" } },
  { id: "review", kind: "gate", gate: { form: "review.v1" } },
  { id: "publish", kind: "invoke", invoke: { space: "spc_ops", action: "publish" } },
];
