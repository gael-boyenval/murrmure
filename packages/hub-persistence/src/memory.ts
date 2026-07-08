import type { Instance, Space, FlowInstall, Member, FlowIndexEntry, IndexedAction, SpaceBinding, SpaceIndexSnapshot, RunLifecycle, RunStepMemo } from "@murrmure/contracts";
import type { ContractRefRow, GrantRow, StudioPersistencePort, TokenRow, ArtifactRow, SessionRow, RunRow, GateRow, NotificationRow, UserPrefsRow, JournalIndexRow, JournalQueryParams } from "./port.js";

export class MemoryStudioPersistence implements StudioPersistencePort {
  private spaces = new Map<string, Space>();
  private instances = new Map<string, Instance>();
  private contractRefs = new Map<string, ContractRefRow>();
  private tokens = new Map<string, TokenRow>();
  private grants = new Map<string, GrantRow>();
  private spaceSeq = new Map<string, number>();
  private instanceSeq = new Map<string, number>();
  private triggers: Record<string, unknown>[] = [];
  private triggerDeliveries: Record<string, unknown>[] = [];
  private capabilityInstalls = new Map<string, FlowInstall>();
  private members: Member[] = [];
  private blobs = new Map<string, Record<string, unknown>>();
  private queries = new Map<string, Record<string, unknown>>();
  private federationHubs = new Map<string, Record<string, unknown>>();
  private federationOutbound: Record<string, unknown>[] = [];
  private spaceBindings = new Map<string, SpaceBinding[]>();
  private spaceIndex = new Map<string, SpaceIndexSnapshot>();
  private flowIndexById = new Map<string, FlowIndexEntry>();
  private artifacts = new Map<string, ArtifactRow>();
  private sessions = new Map<string, SessionRow>();
  private runs = new Map<string, RunRow>();
  private stepMemos = new Map<string, RunStepMemo>();
  private gates = new Map<string, GateRow>();
  private notifications = new Map<string, NotificationRow>();
  private userPrefs = new Map<string, UserPrefsRow>();
  private journalIndex: JournalIndexRow[] = [];

  private flowIndexKey(origin_space_id: string, flow_id: string): string {
    return `${this.bareSpaceId(origin_space_id)}:${flow_id}`;
  }

  async insertSpace(space: Space, _created_at: string): Promise<void> {
    this.spaces.set(space.space_id, space);
  }

  async getSpace(space_id: string): Promise<Space | null> {
    return this.spaces.get(space_id) ?? null;
  }

  async getSpaceBySlug(slug: string): Promise<Space | null> {
    for (const s of this.spaces.values()) {
      if (s.slug === slug) return s;
    }
    return null;
  }

  async listSpaces(): Promise<Space[]> {
    return [...this.spaces.values()].filter((s) => s.status === "active");
  }

  async updateSpace(space_id: string, patch: Partial<Space>): Promise<void> {
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    const current = this.spaces.get(bare);
    if (current) this.spaces.set(bare, { ...current, ...patch });
  }

  async archiveSpace(space_id: string): Promise<void> {
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    const current = this.spaces.get(bare);
    if (current) this.spaces.set(bare, { ...current, status: "archived" });
  }

  async insertInstance(instance: Instance, _created_at: string): Promise<void> {
    this.instances.set(instance.instance_id, instance);
  }

  async getInstance(instance_id: string): Promise<Instance | null> {
    return this.instances.get(instance_id) ?? null;
  }

  async listInstances(space_id: string): Promise<Instance[]> {
    return [...this.instances.values()].filter((i) => i.space_id === space_id);
  }

  async updateInstanceState(instance_id: string, state: string, revision: number): Promise<void> {
    const inst = this.instances.get(instance_id);
    if (inst) this.instances.set(instance_id, { ...inst, state, revision });
  }

  async updateInstanceMetadata(
    instance_id: string,
    metadata: Record<string, unknown>,
    revision: number,
  ): Promise<void> {
    const inst = this.instances.get(instance_id);
    if (inst) this.instances.set(instance_id, { ...inst, metadata, revision });
  }

  async insertContractRef(row: ContractRefRow): Promise<void> {
    this.contractRefs.set(row.contract_ref_id, row);
  }

  async getContractRef(contract_ref_id: string): Promise<ContractRefRow | null> {
    return this.contractRefs.get(contract_ref_id) ?? null;
  }

  async getToken(token_id: string): Promise<TokenRow | null> {
    return this.tokens.get(token_id) ?? null;
  }

  async insertToken(row: TokenRow, _created_at: string): Promise<void> {
    this.tokens.set(row.token_id, row);
  }

  async insertGrant(row: GrantRow, _created_at: string): Promise<void> {
    this.grants.set(row.grant_id, row);
  }

  async getGrant(grant_id: string): Promise<GrantRow | null> {
    return this.grants.get(grant_id) ?? null;
  }

  async listGrants(space_id: string): Promise<GrantRow[]> {
    return [...this.grants.values()].filter((g) => g.space_id === space_id && g.status === "active");
  }

  async listAllGrants(): Promise<GrantRow[]> {
    return [...this.grants.values()].filter((g) => g.status === "active");
  }

  async revokeGrant(grant_id: string): Promise<void> {
    const g = this.grants.get(grant_id);
    if (g) this.grants.set(grant_id, { ...g, status: "revoked" });
  }

  async allocateSpaceSeq(space_id: string): Promise<number> {
    const next = (this.spaceSeq.get(space_id) ?? 0) + 1;
    this.spaceSeq.set(space_id, next);
    return next;
  }

  async allocateInstanceSeq(instance_id: string): Promise<number> {
    const next = (this.instanceSeq.get(instance_id) ?? 0) + 1;
    this.instanceSeq.set(instance_id, next);
    return next;
  }

  async insertTrigger(row: Record<string, unknown>): Promise<void> {
    this.triggers.push(row);
  }

  async listTriggers(space_id: string): Promise<Record<string, unknown>[]> {
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    return this.triggers.filter((t) => t.space_id === bare && t.status !== "disabled");
  }

  async disableTrigger(trigger_id: string): Promise<void> {
    const bare = trigger_id.startsWith("trg_") ? trigger_id.slice(4) : trigger_id;
    this.triggers = this.triggers.map((t) =>
      t.trigger_id === bare || t.trigger_id === trigger_id ? { ...t, status: "disabled" } : t,
    );
  }

  async insertTriggerDelivery(row: Record<string, unknown>): Promise<void> {
    this.triggerDeliveries.push(row);
  }

  async listTriggerDeliveries(space_id: string, limit = 50): Promise<Record<string, unknown>[]> {
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    return this.triggerDeliveries
      .filter((d) => d.space_id === bare)
      .slice(-limit)
      .reverse();
  }

  async listAllActiveTriggers(): Promise<Record<string, unknown>[]> {
    return this.triggers.filter((t) => (t.status ?? "active") === "active");
  }

  async findTriggerDeliveryByFingerprint(
    space_id: string,
    trigger_id: string,
    fingerprint: string,
    window_seconds: number,
  ): Promise<Record<string, unknown> | null> {
    const since = new Date(Date.now() - window_seconds * 1000).toISOString();
    const matches = this.triggerDeliveries
      .filter(
        (d) =>
          d.space_id === space_id &&
          d.trigger_id === trigger_id &&
          d.fingerprint === fingerprint &&
          d.outcome === "success" &&
          typeof d.created_at === "string" &&
          (d.created_at as string) >= since,
      )
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return matches[0] ?? null;
  }

  async insertFlowInstall(row: FlowInstall, _created_at: string): Promise<void> {
    const bare = row.install_id.startsWith("ins_")
      ? row.install_id.slice(4)
      : row.install_id.startsWith("ins_")
        ? row.install_id.slice(4)
        : row.install_id;
    this.capabilityInstalls.set(bare, row);
  }

  async getFlowInstall(install_id: string): Promise<FlowInstall | null> {
    const bare = install_id.startsWith("ins_")
      ? install_id.slice(4)
      : install_id.startsWith("ins_")
        ? install_id.slice(4)
        : install_id;
    return this.capabilityInstalls.get(bare) ?? null;
  }

  async listFlowInstalls(space_id: string): Promise<FlowInstall[]> {
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    return [...this.capabilityInstalls.values()].filter(
      (c) => (c.space_id.startsWith("spc_") ? c.space_id.slice(4) : c.space_id) === bare,
    );
  }

  async findFlowInstallByPackageVersion(
    flow_id: string,
    version: string,
  ): Promise<FlowInstall | null> {
    const matches = [...this.capabilityInstalls.values()].filter(
      (c) => c.flow_id === flow_id && c.version === version,
    );
    return matches.at(-1) ?? null;
  }

  async updateFlowInstall(install_id: string, patch: Partial<FlowInstall>): Promise<void> {
    const bare = install_id.startsWith("ins_")
      ? install_id.slice(4)
      : install_id.startsWith("ins_")
        ? install_id.slice(4)
        : install_id;
    const current = this.capabilityInstalls.get(bare);
    if (current) this.capabilityInstalls.set(bare, { ...current, ...patch });
  }

  async insertMember(member: Member, _created_at: string): Promise<void> {
    this.members = this.members.filter(
      (m) => !(m.space_id === member.space_id && m.email === member.email),
    );
    this.members.push(member);
  }

  async listMembers(space_id: string): Promise<Member[]> {
    return this.members.filter((m) => m.space_id === space_id);
  }

  async updateMemberRole(space_id: string, member_id: string, role: Member["role"]): Promise<void> {
    this.members = this.members.map((m) =>
      m.space_id === space_id && m.member_id === member_id ? { ...m, role } : m,
    );
  }

  async removeMember(space_id: string, member_id: string): Promise<void> {
    this.members = this.members.filter((m) => !(m.space_id === space_id && m.member_id === member_id));
  }

  async insertBlob(row: Record<string, unknown>): Promise<void> {
    this.blobs.set(row.blob_id as string, row);
  }

  async getBlob(blob_id: string): Promise<Record<string, unknown> | null> {
    return this.blobs.get(blob_id) ?? null;
  }

  async insertQuery(row: Record<string, unknown>): Promise<void> {
    this.queries.set(row.query_id as string, row);
  }

  async getQuery(query_id: string): Promise<Record<string, unknown> | null> {
    return this.queries.get(query_id) ?? null;
  }

  async answerQuery(query_id: string, payload: Record<string, unknown>): Promise<void> {
    const q = this.queries.get(query_id);
    if (q) this.queries.set(query_id, { ...q, status: "answered", answer_payload: payload });
  }

  async insertFederationHub(row: Record<string, unknown>): Promise<void> {
    this.federationHubs.set(row.hub_id as string, row);
  }

  async getFederationHub(hub_id: string): Promise<Record<string, unknown> | null> {
    return this.federationHubs.get(hub_id) ?? null;
  }

  async enqueueFederationOutbound(row: Record<string, unknown>): Promise<void> {
    this.federationOutbound.push(row);
  }

  async claimFederationOutbound(limit: number): Promise<Record<string, unknown>[]> {
    const pending = this.federationOutbound.filter((r) => r.status === "pending");
    return pending.slice(0, limit);
  }

  async completeFederationOutbound(outbound_id: string): Promise<void> {
    const idx = this.federationOutbound.findIndex((r) => r.outbound_id === outbound_id);
    if (idx >= 0) this.federationOutbound[idx] = { ...this.federationOutbound[idx], status: "sent" };
  }

  async countFederationOutboundPending(): Promise<number> {
    return this.federationOutbound.filter((r) => r.status === "pending").length;
  }

  async listFederationHubs(): Promise<Record<string, unknown>[]> {
    return [...this.federationHubs.values()];
  }

  private federationIngressDedup = new Set<string>();

  async hasFederationIngressDedup(source_hub_id: string, event_id: string): Promise<boolean> {
    return this.federationIngressDedup.has(`${source_hub_id}:${event_id}`);
  }

  async insertFederationIngressDedup(
    source_hub_id: string,
    event_id: string,
    _ingested_at: string,
  ): Promise<void> {
    this.federationIngressDedup.add(`${source_hub_id}:${event_id}`);
  }

  private bareSpaceId(space_id: string): string {
    return space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
  }

  async getSpaceBindings(space_id: string): Promise<SpaceBinding[]> {
    return this.spaceBindings.get(this.bareSpaceId(space_id)) ?? [];
  }

  async setSpaceBindings(space_id: string, bindings: SpaceBinding[]): Promise<void> {
    this.spaceBindings.set(this.bareSpaceId(space_id), bindings);
  }

  async getSpaceIndexSnapshot(space_id: string): Promise<SpaceIndexSnapshot> {
    return (
      this.spaceIndex.get(this.bareSpaceId(space_id)) ?? {
        actions: [],
        executors: [],
        hooks: [],
        events: [],
        flows: [],
      }
    );
  }

  async replaceSpaceIndex(space_id: string, snapshot: SpaceIndexSnapshot): Promise<void> {
    const bare = this.bareSpaceId(space_id);
    this.spaceIndex.set(bare, snapshot);
    for (const [key] of [...this.flowIndexById.entries()]) {
      const entry = this.flowIndexById.get(key);
      if (entry && this.bareSpaceId(entry.origin_space_id) === bare) {
        this.flowIndexById.delete(key);
      }
    }
    for (const flow of snapshot.flows) {
      this.flowIndexById.set(this.flowIndexKey(flow.origin_space_id, flow.flow_id), flow);
    }
  }

  async listIndexedActions(space_id: string): Promise<IndexedAction[]> {
    const snapshot = await this.getSpaceIndexSnapshot(space_id);
    return snapshot.actions.map((row) => JSON.parse(row.payload_json) as IndexedAction);
  }

  async listIndexedExecutors(space_id: string): Promise<Array<Record<string, unknown>>> {
    const snapshot = await this.getSpaceIndexSnapshot(space_id);
    return snapshot.executors.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>);
  }

  async listIndexedHooks(space_id: string): Promise<Array<Record<string, unknown>>> {
    const snapshot = await this.getSpaceIndexSnapshot(space_id);
    return snapshot.hooks.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>);
  }

  async listIndexedEvents(space_id: string): Promise<Array<Record<string, unknown>>> {
    const snapshot = await this.getSpaceIndexSnapshot(space_id);
    return (snapshot.events ?? []).map((row) => JSON.parse(row.payload_json) as Record<string, unknown>);
  }

  async listFlowIndex(space_id: string): Promise<FlowIndexEntry[]> {
    const snapshot = await this.getSpaceIndexSnapshot(space_id);
    return snapshot.flows.map((row) => {
      const { payload_json: _payload, ...entry } = row;
      return entry;
    });
  }

  async getFlowIndexEntry(flow_id: string, origin_space_id?: string): Promise<FlowIndexEntry | null> {
    if (origin_space_id) {
      return this.flowIndexById.get(this.flowIndexKey(origin_space_id, flow_id)) ?? null;
    }
    for (const entry of this.flowIndexById.values()) {
      if (entry.flow_id === flow_id) return entry;
    }
    return null;
  }

  async insertArtifact(row: ArtifactRow): Promise<void> {
    this.artifacts.set(row.transfer_id, row);
  }

  async getArtifact(transfer_id: string): Promise<ArtifactRow | null> {
    return this.artifacts.get(transfer_id) ?? null;
  }

  async findArtifactByDigest(source_space_id: string, digest: string): Promise<ArtifactRow | null> {
    const bare = this.bareSpaceId(source_space_id);
    for (const row of this.artifacts.values()) {
      if (this.bareSpaceId(row.source_space_id) === bare && row.digest === digest) {
        return row;
      }
    }
    return null;
  }

  async listArtifacts(): Promise<ArtifactRow[]> {
    return [...this.artifacts.values()];
  }

  async deleteArtifact(transfer_id: string): Promise<void> {
    this.artifacts.delete(transfer_id);
  }

  async insertSession(row: SessionRow, _created_at: string): Promise<void> {
    this.sessions.set(row.session_id, row);
  }

  async getSession(session_id: string): Promise<SessionRow | null> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    return this.sessions.get(bare) ?? null;
  }

  async listSessions(filter?: { space_id?: string; status?: SessionRow["status"] }): Promise<SessionRow[]> {
    return [...this.sessions.values()].filter((s) => {
      if (filter?.status && s.status !== filter.status) return false;
      if (filter?.space_id && !s.spaces_touched.includes(filter.space_id)) return false;
      return true;
    });
  }

  async updateSessionStatus(session_id: string, status: SessionRow["status"]): Promise<void> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    const s = this.sessions.get(bare);
    if (s) this.sessions.set(bare, { ...s, status });
  }

  async markSessionCancelRequested(session_id: string, at: string): Promise<void> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    const s = this.sessions.get(bare);
    if (s) this.sessions.set(bare, { ...s, cancel_requested_at: at, status: "cancelled" });
  }

  async updateSessionSpacesTouched(session_id: string, spaces: string[]): Promise<void> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    const s = this.sessions.get(bare);
    if (s) this.sessions.set(bare, { ...s, spaces_touched: spaces });
  }

  async insertRun(row: RunRow, _created_at: string): Promise<void> {
    this.runs.set(row.run_id, row);
  }

  async getRun(run_id: string): Promise<RunRow | null> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id.startsWith("ins_") ? run_id.slice(4) : run_id;
    return this.runs.get(bare) ?? null;
  }

  async listRunsBySession(session_id: string): Promise<RunRow[]> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    return [...this.runs.values()].filter((r) => r.session_id === bare);
  }

  async listRuns(filter?: {
    space_id?: string;
    flow_id?: string;
    lifecycles?: RunLifecycle[];
    limit?: number;
  }): Promise<RunRow[]> {
    let rows = [...this.runs.values()];
    if (filter?.space_id) {
      const bare = filter.space_id.startsWith("spc_") ? filter.space_id.slice(4) : filter.space_id;
      rows = rows.filter((r) => r.space_id === bare || r.space_id === filter.space_id);
    }
    if (filter?.flow_id) {
      rows = rows.filter((r) => r.flow_id === filter.flow_id);
    }
    if (filter?.lifecycles?.length) {
      rows = rows.filter((r) => filter.lifecycles!.includes(r.lifecycle));
    }
    rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
    if (filter?.limit) rows = rows.slice(0, filter.limit);
    return rows;
  }

  async findRunByFlowKey(flow_id: string, run_key: string): Promise<RunRow | null> {
    for (const run of this.runs.values()) {
      if (run.flow_id !== flow_id) continue;
      if (
        run.lifecycle !== "working" &&
        run.lifecycle !== "input-required" &&
        run.lifecycle !== "failed" &&
        run.lifecycle !== "completed"
      ) {
        continue;
      }
      const key = run.exec_context._run_key;
      if (key === run_key) return run;
    }
    return null;
  }

  async findRunByIdempotencyKey(idempotency_key: string): Promise<RunRow | null> {
    for (const run of this.runs.values()) {
      if (run.exec_context.idempotency_key === idempotency_key) return run;
    }
    return null;
  }

  async updateRunLifecycle(run_id: string, lifecycle: RunLifecycle, ended_at?: string): Promise<void> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id.startsWith("ins_") ? run_id.slice(4) : run_id;
    const r = this.runs.get(bare);
    if (r) this.runs.set(bare, { ...r, lifecycle, ended_at: ended_at ?? r.ended_at });
  }

  async updateRunFlowBinding(
    run_id: string,
    patch: {
      flow_id: string;
      flow_digest: string;
      exec_context?: Record<string, unknown>;
    },
  ): Promise<void> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id.startsWith("ins_") ? run_id.slice(4) : run_id;
    const r = this.runs.get(bare);
    if (!r) return;
    this.runs.set(bare, {
      ...r,
      flow_id: patch.flow_id,
      flow_digest: patch.flow_digest,
      exec_context: patch.exec_context ?? r.exec_context,
    });
  }

  async getRunByInstanceId(instance_id: string): Promise<RunRow | null> {
    const bare = instance_id.startsWith("ins_") ? instance_id.slice(4) : instance_id;
    return this.runs.get(bare) ?? [...this.runs.values()].find((r) => r.instance_id === bare) ?? null;
  }

  async upsertRunStepMemo(memo: RunStepMemo): Promise<void> {
    const bareRun = memo.run_id.startsWith("run_") ? memo.run_id.slice(4) : memo.run_id;
    this.stepMemos.set(`${bareRun}:${memo.step_id}`, memo);
  }

  async listRunStepMemos(run_id: string): Promise<RunStepMemo[]> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    return [...this.stepMemos.values()].filter((m) => m.run_id === `run_${bare}` || m.run_id.endsWith(bare));
  }

  async getRunStepMemoByIdempotencyKey(idempotency_key: string): Promise<RunStepMemo | null> {
    for (const memo of this.stepMemos.values()) {
      if (memo.idempotency_key === idempotency_key) return memo;
    }
    return null;
  }

  async deleteRunStepMemos(run_id: string): Promise<void> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    for (const key of [...this.stepMemos.keys()]) {
      if (key.startsWith(`${bare}:`)) this.stepMemos.delete(key);
    }
  }

  async insertGate(row: GateRow): Promise<void> {
    this.gates.set(row.gate_id, row);
  }

  async getGate(gate_id: string): Promise<GateRow | null> {
    const bare = gate_id.startsWith("gate_") ? gate_id.slice(5) : gate_id;
    return this.gates.get(bare) ?? null;
  }

  async listGatesByRun(run_id: string): Promise<GateRow[]> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    return [...this.gates.values()].filter((g) => g.run_id === bare);
  }

  async listPendingGates(filter?: { run_id?: string; session_id?: string }): Promise<GateRow[]> {
    return [...this.gates.values()].filter((g) => {
      if (g.status !== "pending") return false;
      if (filter?.run_id) {
        const bare = filter.run_id.startsWith("run_") ? filter.run_id.slice(4) : filter.run_id;
        if (g.run_id !== bare) return false;
      }
      if (filter?.session_id) {
        const bare = filter.session_id.startsWith("ses_") ? filter.session_id.slice(4) : filter.session_id;
        if (g.session_id !== bare) return false;
      }
      return true;
    });
  }

  async updateGateStatus(
    gate_id: string,
    status: GateRow["status"],
    meta?: { resolved_at?: string; resolved_by?: string; decision?: string },
  ): Promise<void> {
    const bare = gate_id.startsWith("gate_") ? gate_id.slice(5) : gate_id;
    const g = this.gates.get(bare);
    if (g) {
      this.gates.set(bare, {
        ...g,
        status,
        resolved_at: meta?.resolved_at,
        resolved_by: meta?.resolved_by,
        decision: meta?.decision,
      });
    }
  }

  async insertNotification(row: NotificationRow): Promise<void> {
    this.notifications.set(row.notification_id, row);
  }

  async listNotifications(
    actor_id: string,
    filter?: { status?: NotificationRow["status"] },
  ): Promise<NotificationRow[]> {
    return [...this.notifications.values()]
      .filter((n) => n.actor_id === actor_id && (!filter?.status || n.status === filter.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async dismissNotification(notification_id: string, actor_id: string, at: string): Promise<void> {
    const n = this.notifications.get(notification_id);
    if (n && n.actor_id === actor_id) {
      this.notifications.set(notification_id, { ...n, status: "dismissed", dismissed_at: at });
    }
  }

  async resolveNotificationsForRunStep(run_id: string, step_id: string, at: string): Promise<void> {
    const bareRun = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    for (const [id, n] of this.notifications) {
      if (n.run_id === bareRun && n.step_id === step_id && n.status === "pending") {
        this.notifications.set(id, { ...n, status: "resolved", resolved_at: at });
      }
    }
  }

  async resolveNotificationsForGate(gate_id: string, at: string): Promise<void> {
    const bare = gate_id.startsWith("gate_") ? gate_id.slice(5) : gate_id;
    for (const [id, n] of this.notifications) {
      if (n.gate_id === bare && n.status === "pending") {
        this.notifications.set(id, { ...n, status: "resolved", resolved_at: at });
      }
    }
  }

  async countPendingNotifications(actor_id: string): Promise<number> {
    return [...this.notifications.values()].filter(
      (n) => n.actor_id === actor_id && n.status === "pending",
    ).length;
  }

  async getUserPrefs(actor_id: string): Promise<UserPrefsRow | null> {
    return this.userPrefs.get(actor_id) ?? null;
  }

  async upsertUserPrefs(row: UserPrefsRow): Promise<void> {
    this.userPrefs.set(row.actor_id, row);
  }

  async insertJournalIndex(row: JournalIndexRow): Promise<void> {
    this.journalIndex.push(row);
  }

  async queryJournalIndex(params: JournalQueryParams): Promise<JournalIndexRow[]> {
    let rows = [...this.journalIndex];
    if (params.space_id) rows = rows.filter((r) => r.space_id === params.space_id);
    if (params.session_id) rows = rows.filter((r) => r.session_id === params.session_id);
    if (params.type) {
      const pattern = params.type.endsWith("*") ? params.type.slice(0, -1) : params.type;
      rows = rows.filter((r) => (params.type!.endsWith("*") ? r.type.startsWith(pattern) : r.type === params.type));
    }
    if (params.subject) {
      const pattern = params.subject.endsWith("*") ? params.subject.slice(0, -1) : params.subject;
      rows = rows.filter((r) =>
        params.subject!.endsWith("*") ? (r.subject ?? "").startsWith(pattern) : r.subject === params.subject,
      );
    }
    if (params.since) rows = rows.filter((r) => r.time >= params.since!);
    if (params.until) rows = rows.filter((r) => r.time <= params.until!);
    rows.sort((a, b) => b.time.localeCompare(a.time));
    return rows.slice(0, params.limit ?? 100);
  }
}
