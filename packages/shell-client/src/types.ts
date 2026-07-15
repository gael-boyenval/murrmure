export interface ShellClientOptions {
  baseUrl: string;
  token: string;
}

export interface UploadIntentFileInput {
  slot: string;
  name: string;
  media_type: string;
  size_bytes: number;
}

export interface UploadIntentResponse {
  intent_id: string;
  expires_in_ms: number;
  files: Array<{ index: number; size_bytes: number }>;
}

export interface SpaceSummary {
  space_id: string;
  slug?: string;
  name?: string;
  description?: string;
}

export interface SseTicketResponse {
  ticket: string;
  expires_in: number;
}

export interface JournalSsePayload {
  event: string;
  data: Record<string, unknown>;
}

export interface UserProfile {
  actor_id: string;
  landing_space_id?: string;
  suggest_landing?: boolean;
  notify_email?: boolean;
  notify_desktop?: boolean;
}

export interface NotificationItem {
  notification_id: string;
  kind: "gate" | "run_failed" | "human_step";
  status: "pending" | "dismissed" | "resolved";
  gate_id?: string;
  step_id?: string;
  run_id?: string;
  session_id?: string;
  space_id: string;
  space_hidden: boolean;
  title: string;
  summary?: string;
  expires_at?: string;
  created_at: string;
}

export interface GateFormField {
  name: string;
  type: string;
  values?: string[];
  required?: boolean;
  title?: string;
  description?: string;
}

export interface GateForm {
  id: string;
  fields: GateFormField[];
}

export interface GateItem {
  gate_id: string;
  run_id: string;
  session_id: string;
  step_id: string;
  status: string;
  assignees?: string[];
  expires_at?: string;
  created_at?: string;
  action_name?: string;
  /** Human-readable gate title; falls back to step/action when omitted. */
  title?: string;
  /** Blocked-work one-liner shown under the title. */
  summary?: string;
  form?: GateForm;
  payload_ref?: string;
  view_ref?: {
    view_id: string;
    origin_space_id?: string;
    entry_url?: string;
    shell_route?: string;
    params_schema?: string;
  };
  space_label?: string;
  space_link?: string;
  space_hidden?: boolean;
  orchestration_preview?: {
    manifest_name: string;
    flow_digest: string;
    steps: Array<{
      step_id: string;
      space?: string;
      action?: string;
      param_shape?: Record<string, string>;
      expect?: string;
    }>;
  };
}

export interface JournalEntryItem {
  id: string;
  type: string;
  time: string;
  subject?: string;
  space_id: string;
  session_id?: string;
  run_id?: string;
  actor_id?: string;
  seq: number;
  data: Record<string, unknown>;
}

export interface FlowStartConditions {
  manual?: boolean;
  flow_call?: boolean;
  events?: Array<{ type: string; source?: string }>;
  schedule?: string | null;
  idempotency?: string;
}

export interface SpaceHomeFlowRow {
  flow_id: string;
  origin_space_id: string;
  name: string;
  digest: string;
  can_run: boolean;
  can_preview: boolean;
  manual: boolean;
  authored_here: boolean;
  triggers: FlowStartConditions;
}

export interface SpaceHomeRunRow {
  run_id: string;
  session_id: string;
  flow_id?: string | null;
  lifecycle: string;
  started_at: string;
  ended_at?: string;
  title?: string;
}

export interface SpaceHomeAttentionRow {
  kind: "gate" | "run_failed" | "human_step";
  gate_id?: string;
  step_id?: string;
  run_id?: string;
  session_id?: string;
  title: string;
}

export interface SpaceHomeHookActionRow {
  kind: "ensure_session" | "invoke" | "start_flow";
  label: string;
}

export interface SpaceHomeHookRow {
  hook_id: string;
  event_type: string;
  source?: string | string[];
  actions: SpaceHomeHookActionRow[];
}

export interface SpaceHomeActionRow {
  name: string;
  executor: string;
}

export interface SpaceHomeEventRow {
  event_type: string;
  kind: "hook_listener" | "flow_start";
  hook_id?: string;
  flow_id?: string;
  source?: string | string[];
}

export interface SpaceHomeIndexSection {
  counts: {
    actions: number;
    executors: number;
    hooks: number;
    events: number;
    flows: number;
    declared_events: number;
  };
  actions: SpaceHomeActionRow[];
  hooks: SpaceHomeHookRow[];
  events: SpaceHomeEventRow[];
}

export interface SpaceHomeEmittableEventListener {
  space_id: string;
  hook_id: string;
  action?: string;
  flow_id?: string;
}

export interface SpaceHomeEmittableEventRow {
  event_type: string;
  description?: string;
  listeners: SpaceHomeEmittableEventListener[];
  payload_hints: string[];
  payload_schema?: {
    required?: string[];
    properties?: Record<string, { type?: string; description?: string }>;
  };
  origins: Array<"hook" | "declaration" | "flow_start">;
}

export interface SpaceHomePayload {
  version: 2;
  space_id: string;
  needs_attention: SpaceHomeAttentionRow[];
  active_runs: SpaceHomeRunRow[];
  flows: SpaceHomeFlowRow[];
  receiving_from: SpaceHomeFlowRow[];
  recent_completed: SpaceHomeRunRow[];
  index: SpaceHomeIndexSection;
  emittable_events: SpaceHomeEmittableEventRow[];
}

export interface FlowPreviewPayload {
  version: 2;
  flow_id: string;
  origin_space_id: string;
  name: string;
  digest: string;
  can_run: boolean;
  manual: boolean;
  triggers: FlowStartConditions;
  graph: RunGraphPayload;
}

export interface RunGraphLane {
  step_id: string;
  matrix_index: number;
  run_id: string;
  lifecycle: string;
  label?: string;
}

export interface RunGraphNode {
  id: string;
  step_id: string;
  kind: string;
  status?: string;
  run_id?: string;
  federated?: boolean;
  remote_label?: string;
  parent_step_id?: string;
  metadata?: RunGraphStepMetadata;
}

export interface RunGraphResolver {
  handler_id: string;
  type: string;
  view_id?: string;
  config_digest: string;
}

export interface RunGraphBranchMetadata {
  branch: string;
  schema_ref?: string;
  schema?: Record<string, unknown>;
  payload_required: string[];
  artifact_required: string[];
  artifact_slots: Record<string, Record<string, unknown>>;
  routes: Array<{
    engine?: "open" | "advance" | "fail_run" | "resume";
    step_id?: string;
  }>;
}

export interface RunGraphStepMetadata {
  description?: string;
  branches: RunGraphBranchMetadata[];
  resolver: RunGraphResolver | null;
  resolver_source: "current" | "dispatch";
}

export interface RunGraphPayload {
  run_id: string;
  flow_id?: string | null;
  flow_digest?: string;
  origin_space_id?: string;
  flow_name?: string;
  mode?: "preview" | "live" | "history";
  nodes: RunGraphNode[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    tone?: "default" | "failure";
    route_kind?: "open" | "advance" | "fail_run" | "resume";
  }>;
  lanes: RunGraphLane[];
  step_memos: Array<{
    step_id: string;
    status: string;
    started_at?: string;
    completed_at?: string;
    error_code?: string;
    executor_type?: string;
  }>;
}

export interface RunDetailPayload {
  run_id: string;
  session_id: string;
  space_id?: string;
  flow_id?: string | null;
  lifecycle: string;
  exec_context?: Record<string, unknown>;
  journal_replay?: Array<{ step_id: string; status: string }>;
  steps?: Array<{ step_id: string; status: string }>;
  open_steps?: Array<{
    step_id: string;
    parent_id?: string | null;
    description?: string;
    reason?: "opened" | "resumed";
    declared_children?: string[];
    returned_child?: {
      step_id: string;
      branch: string;
      iteration: number;
      payload: Record<string, unknown>;
      artifacts_out: Array<Record<string, unknown>>;
    };
    /** Sanitized resolver descriptor; `null` means no space handler is bound. */
    resolver: {
      handler_id: string;
      type: string;
      view_id?: string;
    } | null;
    /** Inline View reference, present only when a `view_resolver` is bound. */
    view?: {
      view_id: string;
      origin_space_id: string;
      entry?: string;
      shell_route?: string;
    } | null;
    branches: Array<{
      branch: string;
      schema_ref?: string;
      schema?: Record<string, unknown>;
      payload_required: string[];
      artifact_required: string[];
      artifact_slots: Record<string, Record<string, unknown>>;
    }>;
  }>;
}

export interface SessionDetailPayload {
  session_id: string;
  title: string;
  status: string;
  subject?: string;
}

export interface ViewDevSessionPayload {
  view_id: string;
  dev_url?: string;
  fixtures: Array<{ name: string; path?: string }>;
  initial_fixture?: string;
  started_at: string;
}

export interface ShellClient {
  spaces: {
    list(): Promise<SpaceSummary[]>;
    home(space_id: string): Promise<SpaceHomePayload>;
    runs(space_id: string): Promise<{ space_id: string; runs: SpaceHomeRunRow[] }>;
    flowPreview(space_id: string, flow_id: string): Promise<FlowPreviewPayload>;
    runFlow(flow_id: string, body: { space_id?: string; input?: Record<string, unknown> }): Promise<{
      session: { session_id: string; title: string };
      run_id: string;
      flow_digest: string;
    }>;
  };
  me: {
    get(): Promise<UserProfile>;
    patch(body: { landing_space_id?: string | null; notify_email?: boolean; notify_desktop?: boolean }): Promise<UserProfile>;
  };
  notifications: {
    list(status?: "pending" | "dismissed" | "resolved"): Promise<{ notifications: NotificationItem[]; pending_count: number }>;
    dismiss(notification_id: string): Promise<void>;
  };
  gates: {
    listForRun(run_id: string): Promise<GateItem[]>;
    resolve(
      gate_id: string,
      body:
        | { disposition: "continue" | "cancel"; output?: Record<string, unknown> }
        | { decision: "approved" | "rejected"; form_values?: Record<string, unknown> },
    ): Promise<GateItem>;
  };
  dev: {
    viewSession(space_id: string): Promise<{ session: ViewDevSessionPayload }>;
    viewFixture(
      space_id: string,
      view_id: string,
      fixture_name: string,
    ): Promise<{ context: Record<string, unknown> }>;
  };
  journal: {
    subscribe(onEvent: (payload: JournalSsePayload) => void): () => void;
    query(params: Record<string, string | undefined>): Promise<JournalEntryItem[]>;
  };
  auth: {
    mintSseTicket(): Promise<SseTicketResponse>;
  };
  sessions: {
    get(session_id: string): Promise<SessionDetailPayload>;
    listRuns(session_id: string): Promise<{ runs: Array<{ run_id: string; lifecycle: string; flow_id?: string | null }> }>;
  };
  runs: {
    get(run_id: string): Promise<RunDetailPayload>;
    graph(run_id: string): Promise<RunGraphPayload>;
    resolveStep(
      run_id: string,
      step_id: string,
      body: {
        branch: string;
        payload?: Record<string, unknown>;
        artifacts_out?: Array<{ slot: string; path: string }>;
        upload_intent_id?: string;
        idempotency_key?: string;
      },
    ): Promise<{ ok: boolean; run_id: string; step_id: string; branch: string; status: string }>;
    openChild(
      run_id: string,
      parent_step_id: string,
      body: { child_step_id: string; idempotency_key: string },
    ): Promise<{
      ok: boolean;
      run_id: string;
      parent_step_id: string;
      child_step_id: string;
      iteration: number;
      deduplicated: boolean;
    }>;
    createUploadIntent(
      run_id: string,
      step_id: string,
      body: {
        branch: string;
        payload?: Record<string, unknown>;
        files: UploadIntentFileInput[];
        idempotency_key: string;
      },
    ): Promise<UploadIntentResponse>;
    uploadIntentFile(
      intent_id: string,
      index: number,
      file: Blob,
      options?: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void },
    ): Promise<{ received_bytes: number }>;
    cancelUploadIntent(intent_id: string): Promise<void>;
    retry(run_id: string, body?: { from_step_id?: string; space_id?: string }): Promise<{ run: { run_id: string } }>;
    cancel(run_id: string, body?: { space_id?: string }): Promise<{ run: { run_id: string; lifecycle: string } }>;
  };
}
