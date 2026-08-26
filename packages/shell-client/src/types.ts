import type {
  MeetingClosedData,
  MeetingSaidData,
  MeetingTranscript,
  MeetingTranscriptMessage,
} from "@murrmure/contracts";

export type { MeetingClosedData, MeetingTranscript, MeetingTranscriptMessage };

export interface MeetingCloseResult {
  ok: true;
  session_id: string;
  status: "closed";
  outcome: "completed" | "failed";
  close_meeting_seq: number;
}

export interface MeetingResumeResult {
  ok: true;
  session_id: string;
  status: "open";
  resume_meeting_seq: number;
  roster: Array<{ participant_id: string; space_id: string; persona?: string }>;
}

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

export interface SpacePersonaAd {
  id: string;
  summary: string;
  asks?: string[];
  requests?: string[];
}

export interface DirectiveEligibleSpace {
  space_id: string;
  name?: string;
  slug?: string;
  handler_id: string;
}

export interface MeetingStartInput {
  title: string;
  goal?: string;
  session_id?: string;
  participants: Array<{ space_id: string; persona?: string }>;
  chair: { human: true } | { space_id: string; persona?: string };
}

export interface MeetingStartResult {
  ok: true;
  session_id: string;
  status: "open";
  title: string;
  goal?: string;
  chair: { human: true } | { participant_id: string };
  roster: Array<{ participant_id: string; space_id: string; persona?: string }>;
  convene_meeting_seq: number;
}

export interface MeetingListRow {
  session_id: string;
  title: string;
  goal?: string;
  status: "open" | "closed";
  roster_count: number;
  roster: Array<{ space_id: string; persona?: string }>;
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

export interface SpaceHomeHandlerRow {
  handler_id: string;
  event_type: string;
  source?: string | string[];
  type: string;
  summary: string;
  description?: string;
}

export interface SpaceHomeActionRow {
  name: string;
  executor: string;
}

export interface SpaceHomeEventRow {
  event_type: string;
  kind: "handler_listener" | "flow_start";
  handler_id?: string;
  flow_id?: string;
  source?: string | string[];
}

export interface SpaceHomeIndexSection {
  counts: {
    actions: number;
    executors: number;
    handlers: number;
    events: number;
    flows: number;
    declared_events: number;
  };
  actions: SpaceHomeActionRow[];
  handlers: SpaceHomeHandlerRow[];
  events: SpaceHomeEventRow[];
}

export interface SpaceHomeEmittableEventListener {
  space_id: string;
  handler_id: string;
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
  origins: Array<"handler" | "declaration" | "flow_start">;
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
  /** Terminal step output — used by the New directive dialog. */
  result?: { step_id: string; status?: string; message?: string };
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
    /** Soft-delete: archive the space on the hub (local files are kept). */
    archive(space_id: string): Promise<{ space_id: string }>;
    /** Indexed persona ads (`GET /v1/spaces/{id}/personas`). */
    personas(space_id: string): Promise<{ personas: SpacePersonaAd[] }>;
  };
  directives: {
    /** Spaces that bind `step.opened::directive.execute` (`GET /v1/directives/eligible`). */
    eligible(): Promise<{ spaces: DirectiveEligibleSpace[] }>;
  };
  artifacts: {
    get(
      transfer_id: string,
      opts: { space_id: string; preview?: boolean },
    ): Promise<{
      artifact: {
        transfer_id: string;
        name: string;
        size_bytes: number;
        digest: string;
      };
      expires_at?: string;
      preview?: { text: string; truncated: boolean; name: string } | null;
    }>;
  };
  meetings: {
    /** Convene a room (`POST /v1/meetings`). Operator chair is `{ human: true }`. */
    start(body: MeetingStartInput): Promise<MeetingStartResult>;
    /** Open and closed rooms (`GET /v1/meetings`). Not space-scoped. */
    list(): Promise<{ meetings: MeetingListRow[] }>;
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
    viewSession(space_id: string): Promise<{ session: ViewDevSessionPayload | null }>;
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
    /** Meeting projection. `null` when the session has no meeting (HTTP 404). */
    transcript(session_id: string, opts?: { since_seq?: number }): Promise<MeetingTranscript | null>;
    /** Send one message as the authenticated human chair. */
    sayMeeting(
      session_id: string,
      body: Omit<MeetingSaidData, "as_participant_id">,
    ): Promise<{ ok: true; event_id: string; seq: number }>;
    /** Human / chair close. Not `gates.resolve` or `runs.cancel`. */
    closeMeeting(session_id: string, body?: MeetingClosedData): Promise<MeetingCloseResult>;
    /** Reopen the same room and re-wake the same seats. */
    resumeMeeting(session_id: string): Promise<MeetingResumeResult>;
    /** Transcript-authorized artifact metadata / capped preview. */
    getMeetingArtifact(
      session_id: string,
      transfer_id: string,
      opts?: { preview?: boolean },
    ): Promise<{
      artifact: {
        transfer_id: string;
        name: string;
        size_bytes: number;
        digest: string;
      };
      expires_at?: string;
      preview?: { text: string; truncated: boolean; name: string } | null;
    }>;
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
