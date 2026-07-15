import type {
  Capability,
  ContractV2,
  Instance,
  Space,
  FlowInstall,
  Member,
  FlowIndexEntry,
  IndexedAction,
  SpaceBinding,
  SpaceIndexSnapshot,
  RunLifecycle,
  RunStepMemo,
  SessionCreatedBy,
  SessionStatus,
  ResolvedRunPolicy,
} from "@murrmure/contracts";

export interface TokenRow {
  token_id: string;
  actor_id: string;
  space_id: string;
  scopes: string[];
  capabilities?: Capability[];
  harness_id?: string;
  flow_acl?: string[];
  status: "active" | "revoked";
  /** ISO timestamp after which an active token is treated as denied. */
  expires_at?: string;
  /** Assignment scope reference (`{run_id}:{step_id}`) for resolve tokens. */
  scope_ref?: string;
  /**
   * Consumer space a federated resolve token is bound to. Set when the token
   * is minted for a `remote_hub` dispatch so the producer bytes endpoint can
   * bind the artifact ACL principal to the credential instead of trusting an
   * arbitrary `?space_id=` claim (parity with the `artifacts_in` path).
   */
  consumer_space_id?: string;
}

export interface GrantRow {
  grant_id: string;
  token_id?: string;
  space_id: string;
  actor_id: string;
  label?: string;
  harness?: string;
  scopes: string[];
  capabilities?: Capability[];
  flow_acl?: string[];
  status: "active" | "revoked";
  last_activity_at?: string;
  expires_at?: string;
}

export interface SessionRow {
  session_id: string;
  title: string;
  subject?: string;
  status: SessionStatus;
  created_by: SessionCreatedBy;
  spaces_touched: string[];
  actor_id: string;
  cancel_requested_at?: string;
}

export interface RunRow {
  run_id: string;
  session_id: string;
  space_id?: string;
  flow_id?: string | null;
  flow_digest?: string;
  lifecycle: RunLifecycle;
  exec_context: Record<string, unknown>;
  reference_run_ids: string[];
  instance_id?: string;
  started_at: string;
  ended_at?: string;
}

export interface GateRow {
  gate_id: string;
  run_id: string;
  session_id: string;
  space_id: string;
  step_id: string;
  status: "pending" | "approved" | "rejected" | "expired";
  assignees?: string[];
  resolve_mode: "any_one";
  expires_at?: string;
  form?: import("@murrmure/contracts").GateForm;
  payload_ref?: string;
  action_name?: string;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  decision?: string;
}

export interface NotificationRow {
  notification_id: string;
  actor_id: string;
  kind: "gate" | "run_failed" | "human_step";
  status: "pending" | "dismissed" | "resolved";
  gate_id?: string;
  step_id?: string;
  run_id?: string;
  session_id?: string;
  space_id: string;
  space_hidden: number;
  title: string;
  summary?: string;
  expires_at?: string;
  created_at: string;
  dismissed_at?: string;
  resolved_at?: string;
}

export interface UserPrefsRow {
  actor_id: string;
  landing_space_id?: string;
  landing_suggest_shown: boolean;
  notify_email?: boolean;
  notify_desktop?: boolean;
}

export interface JournalIndexRow {
  entry_id: string;
  seq: number;
  space_id: string;
  type: string;
  subject?: string;
  session_id?: string;
  run_id?: string;
  actor_id?: string;
  time: string;
  payload_json: string;
}

export interface JournalQueryParams {
  subject?: string;
  type?: string;
  session_id?: string;
  space_id?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface ContractRefRow {
  contract_ref_id: string;
  capability_id: string;
  semver: string;
  digest: string;
  contract: ContractV2;
}

export interface ArtifactRow {
  transfer_id: string;
  source_space_id: string;
  name: string;
  digest: string;
  size_bytes: number;
  hold: boolean;
  authorized_readers: string[];
  expires_at: string;
  created_at: string;
}

export interface StudioPersistencePort {
  insertSpace(space: Space, created_at: string): Promise<void>;
  getSpace(space_id: string): Promise<Space | null>;
  getSpaceBySlug(slug: string): Promise<Space | null>;
  listSpaces(): Promise<Space[]>;
  updateSpace(space_id: string, patch: Partial<Space>): Promise<void>;
  archiveSpace(space_id: string): Promise<void>;

  insertInstance(instance: Instance, created_at: string): Promise<void>;
  getInstance(instance_id: string): Promise<Instance | null>;
  listInstances(space_id: string): Promise<Instance[]>;
  updateInstanceState(instance_id: string, state: string, revision: number): Promise<void>;
  updateInstanceMetadata(
    instance_id: string,
    metadata: Record<string, unknown>,
    revision: number,
  ): Promise<void>;

  insertContractRef(row: ContractRefRow): Promise<void>;
  getContractRef(contract_ref_id: string): Promise<ContractRefRow | null>;

  getToken(token_id: string): Promise<TokenRow | null>;
  insertToken(row: TokenRow, created_at: string): Promise<void>;
  revokeToken?(token_id: string): Promise<void>;

  insertGrant(row: GrantRow, created_at: string): Promise<void>;
  getGrant(grant_id: string): Promise<GrantRow | null>;
  listGrants(space_id: string): Promise<GrantRow[]>;
  revokeGrant(grant_id: string): Promise<void>;

  allocateSpaceSeq(space_id: string): Promise<number>;
  allocateInstanceSeq(instance_id: string): Promise<number>;

  insertTrigger(row: Record<string, unknown>): Promise<void>;
  listTriggers(space_id: string): Promise<Record<string, unknown>[]>;
  disableTrigger(trigger_id: string): Promise<void>;
  insertTriggerDelivery(row: Record<string, unknown>): Promise<void>;
  listTriggerDeliveries(space_id: string, limit?: number): Promise<Record<string, unknown>[]>;
  listAllActiveTriggers(): Promise<Record<string, unknown>[]>;
  findTriggerDeliveryByFingerprint(
    space_id: string,
    trigger_id: string,
    fingerprint: string,
    window_seconds: number,
  ): Promise<Record<string, unknown> | null>;

  insertFlowInstall(row: FlowInstall, created_at: string): Promise<void>;
  getFlowInstall(install_id: string): Promise<FlowInstall | null>;
  listFlowInstalls(space_id: string): Promise<FlowInstall[]>;
  findFlowInstallByPackageVersion(flow_id: string, version: string): Promise<FlowInstall | null>;
  updateFlowInstall(install_id: string, patch: Partial<FlowInstall>): Promise<void>;

  insertMember(member: Member, created_at: string): Promise<void>;
  listMembers(space_id: string): Promise<Member[]>;
  updateMemberRole(space_id: string, member_id: string, role: Member["role"]): Promise<void>;
  removeMember(space_id: string, member_id: string): Promise<void>;

  listAllGrants(): Promise<GrantRow[]>;

  insertBlob(row: Record<string, unknown>): Promise<void>;
  getBlob(blob_id: string): Promise<Record<string, unknown> | null>;

  insertQuery(row: Record<string, unknown>): Promise<void>;
  getQuery(query_id: string): Promise<Record<string, unknown> | null>;
  answerQuery(query_id: string, payload: Record<string, unknown>): Promise<void>;

  insertFederationHub(row: Record<string, unknown>): Promise<void>;
  getFederationHub(hub_id: string): Promise<Record<string, unknown> | null>;
  enqueueFederationOutbound(row: Record<string, unknown>): Promise<void>;
  claimFederationOutbound(limit: number): Promise<Record<string, unknown>[]>;
  completeFederationOutbound(outbound_id: string): Promise<void>;
  countFederationOutboundPending(): Promise<number>;
  listFederationHubs(): Promise<Record<string, unknown>[]>;
  hasFederationIngressDedup(source_hub_id: string, event_id: string): Promise<boolean>;
  insertFederationIngressDedup(source_hub_id: string, event_id: string, ingested_at: string): Promise<void>;

  getSpaceBindings(space_id: string): Promise<SpaceBinding[]>;
  setSpaceBindings(space_id: string, bindings: SpaceBinding[]): Promise<void>;

  getSpaceIndexSnapshot(space_id: string): Promise<SpaceIndexSnapshot>;
  replaceSpaceIndex(space_id: string, snapshot: SpaceIndexSnapshot): Promise<void>;

  listIndexedActions(space_id: string): Promise<IndexedAction[]>;
  listIndexedExecutors(space_id: string): Promise<Array<Record<string, unknown>>>;
  listIndexedHooks(space_id: string): Promise<Array<Record<string, unknown>>>;
  listIndexedEvents(space_id: string): Promise<Array<Record<string, unknown>>>;
  listIndexedViews(space_id: string): Promise<Array<Record<string, unknown>>>;
  listIndexedRunPolicies(space_id: string): Promise<ResolvedRunPolicy[]>;
  listFlowIndex(space_id: string): Promise<FlowIndexEntry[]>;
  getFlowIndexEntry(flow_id: string, origin_space_id?: string): Promise<FlowIndexEntry | null>;

  insertArtifact(row: ArtifactRow): Promise<void>;
  getArtifact(transfer_id: string): Promise<ArtifactRow | null>;
  findArtifactByDigest(source_space_id: string, digest: string): Promise<ArtifactRow | null>;
  listArtifacts(): Promise<ArtifactRow[]>;
  deleteArtifact(transfer_id: string): Promise<void>;

  insertSession(row: SessionRow, created_at: string): Promise<void>;
  getSession(session_id: string): Promise<SessionRow | null>;
  listSessions(filter?: { space_id?: string; status?: SessionStatus }): Promise<SessionRow[]>;
  updateSessionStatus(session_id: string, status: SessionStatus): Promise<void>;
  markSessionCancelRequested(session_id: string, at: string): Promise<void>;
  updateSessionSpacesTouched(session_id: string, spaces: string[]): Promise<void>;

  insertRun(row: RunRow, created_at: string): Promise<void>;
  getRun(run_id: string): Promise<RunRow | null>;
  listRunsBySession(session_id: string): Promise<RunRow[]>;
  listRuns(filter?: {
    space_id?: string;
    flow_id?: string;
    lifecycles?: RunLifecycle[];
    limit?: number;
  }): Promise<RunRow[]>;
  findRunByFlowKey(flow_id: string, run_key: string): Promise<RunRow | null>;
  findRunByIdempotencyKey(idempotency_key: string): Promise<RunRow | null>;
  updateRunLifecycle(run_id: string, lifecycle: RunLifecycle, ended_at?: string): Promise<void>;
  updateRunFlowBinding(
    run_id: string,
    patch: {
      flow_id: string;
      flow_digest: string;
      exec_context?: Record<string, unknown>;
    },
  ): Promise<void>;
  getRunByInstanceId(instance_id: string): Promise<RunRow | null>;

  upsertRunStepMemo(memo: RunStepMemo): Promise<void>;
  transitionNestedChild(input: {
    run_id: string;
    exec_context: Record<string, unknown>;
    parent_memo: RunStepMemo;
    child_memo: RunStepMemo;
    declared_child_step_ids: string[];
  }): Promise<boolean>;
  listRunStepMemos(run_id: string): Promise<RunStepMemo[]>;
  getRunStepMemoByIdempotencyKey(idempotency_key: string): Promise<RunStepMemo | null>;
  deleteRunStepMemos(run_id: string): Promise<void>;

  insertGate(row: GateRow): Promise<void>;
  getGate(gate_id: string): Promise<GateRow | null>;
  listGatesByRun(run_id: string): Promise<GateRow[]>;
  listPendingGates(filter?: { run_id?: string; session_id?: string }): Promise<GateRow[]>;
  updateGateStatus(
    gate_id: string,
    status: GateRow["status"],
    meta?: { resolved_at?: string; resolved_by?: string; decision?: string },
  ): Promise<void>;

  insertNotification(row: NotificationRow): Promise<void>;
  listNotifications(actor_id: string, filter?: { status?: NotificationRow["status"] }): Promise<NotificationRow[]>;
  dismissNotification(notification_id: string, actor_id: string, at: string): Promise<void>;
  resolveNotificationsForGate(gate_id: string, at: string): Promise<void>;
  resolveNotificationsForRunStep(run_id: string, step_id: string, at: string): Promise<void>;
  countPendingNotifications(actor_id: string): Promise<number>;

  getUserPrefs(actor_id: string): Promise<UserPrefsRow | null>;
  upsertUserPrefs(row: UserPrefsRow): Promise<void>;

  insertJournalIndex(row: JournalIndexRow): Promise<void>;
  queryJournalIndex(params: JournalQueryParams): Promise<JournalIndexRow[]>;
}
