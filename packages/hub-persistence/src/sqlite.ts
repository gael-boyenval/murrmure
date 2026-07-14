import type Database from "better-sqlite3";
import type { Instance, Space, FlowInstall, Member, FlowIndexEntry, IndexedAction, SpaceBinding, SpaceIndexSnapshot, IndexedResourceRow, RunLifecycle, RunStepMemo, ResolvedRunPolicy } from "@murrmure/contracts";
import { migrateStudio, ensureBootstrapToken } from "./migrate.js";
import type { ContractRefRow, GrantRow, StudioPersistencePort, TokenRow, ArtifactRow, GateRow, NotificationRow, UserPrefsRow, JournalIndexRow, JournalQueryParams, SessionRow, RunRow } from "./port.js";

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function barePrefixedId(id: string): string {
  const idx = id.indexOf("_");
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function parseFlowAclJson(row: Record<string, string>): string[] | undefined {
  const raw = row.flow_acl_json ?? row.flow_acl_json;
  return raw ? parseJson(raw) : undefined;
}

function stripInstallBareId(install_id: string): string {
  if (install_id.startsWith("ins_")) return install_id.slice(4);
  if (install_id.startsWith("ins_")) return install_id.slice(4);
  return install_id;
}

function prefixedInstallId(bare: string): string {
  return `ins_${bare}`;
}

export class SqliteStudioPersistence implements StudioPersistencePort {
  constructor(private readonly db: Database.Database) {}

  async insertSpace(space: Space, created_at: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO spaces (space_id, slug, status, parent_space_id, created_at, name, install_policy, preview_policy, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        space.space_id,
        space.slug,
        space.status,
        space.parent_space_id ?? null,
        created_at,
        space.name ?? space.slug,
        space.install_policy ?? "human_only",
        space.preview_policy ?? "same_origin_only",
        space.description ?? null,
      );
  }

  private rowToSpace(row: Record<string, string>): Space {
    const query_policy = row.query_policy_json
      ? (JSON.parse(row.query_policy_json) as Space["query_policy"])
      : undefined;
    const bindings = row.bindings_json
      ? (JSON.parse(row.bindings_json) as SpaceBinding[])
      : undefined;
    return {
      space_id: row.space_id,
      slug: row.slug,
      name: row.name ?? row.slug,
      status: row.status as Space["status"],
      parent_space_id: row.parent_space_id ?? undefined,
      install_policy: (row.install_policy as Space["install_policy"]) ?? "human_only",
      preview_policy: (row.preview_policy as Space["preview_policy"]) ?? "same_origin_only",
      description: row.description ?? undefined,
      query_policy,
      ...(bindings ? { bindings } : {}),
    };
  }

  async getSpace(space_id: string): Promise<Space | null> {
    const row = this.db.prepare("SELECT * FROM spaces WHERE space_id = ?").get(space_id) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return this.rowToSpace(row);
  }

  async getSpaceBySlug(slug: string): Promise<Space | null> {
    const row = this.db.prepare("SELECT * FROM spaces WHERE slug = ?").get(slug) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return this.rowToSpace(row);
  }

  async listSpaces(): Promise<Space[]> {
    const rows = this.db.prepare("SELECT * FROM spaces WHERE status = 'active' ORDER BY created_at").all() as Array<
      Record<string, string>
    >;
    return rows.map((r) => this.rowToSpace(r));
  }

  async updateSpace(space_id: string, patch: Partial<Space>): Promise<void> {
    const current = await this.getSpace(space_id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE spaces SET name = ?, install_policy = ?, preview_policy = ?, description = ?, parent_space_id = ?, query_policy_json = ? WHERE space_id = ?`,
      )
      .run(
        next.name ?? next.slug,
        next.install_policy ?? "human_only",
        next.preview_policy ?? "same_origin_only",
        next.description ?? null,
        next.parent_space_id
          ? next.parent_space_id.startsWith("spc_")
            ? next.parent_space_id.slice(4)
            : next.parent_space_id
          : null,
        next.query_policy ? JSON.stringify(next.query_policy) : null,
        space_id,
      );
  }

  async archiveSpace(space_id: string): Promise<void> {
    this.db.prepare("UPDATE spaces SET status = 'archived' WHERE space_id = ?").run(space_id);
  }

  async insertInstance(instance: Instance, created_at: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO instances (instance_id, space_id, contract_ref_id, state, revision, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        instance.instance_id,
        instance.space_id,
        instance.contract_ref_id,
        instance.state,
        instance.revision,
        JSON.stringify(instance.metadata),
        created_at,
      );
  }

  async getInstance(instance_id: string): Promise<Instance | null> {
    const row = this.db.prepare("SELECT * FROM instances WHERE instance_id = ?").get(instance_id) as
      | Record<string, string | number>
      | undefined;
    if (!row) return null;
    return {
      instance_id: row.instance_id as string,
      space_id: row.space_id as string,
      contract_ref_id: row.contract_ref_id as string,
      state: row.state as string,
      revision: row.revision as number,
      metadata: parseJson(row.metadata_json as string),
    };
  }

  async listInstances(space_id: string): Promise<Instance[]> {
    const rows = this.db.prepare("SELECT instance_id FROM instances WHERE space_id = ?").all(space_id) as Array<{
      instance_id: string;
    }>;
    const out: Instance[] = [];
    for (const r of rows) {
      const inst = await this.getInstance(r.instance_id);
      if (inst) out.push(inst);
    }
    return out;
  }

  async updateInstanceState(instance_id: string, state: string, revision: number): Promise<void> {
    this.db
      .prepare("UPDATE instances SET state = ?, revision = ? WHERE instance_id = ?")
      .run(state, revision, instance_id);
  }

  async updateInstanceMetadata(
    instance_id: string,
    metadata: Record<string, unknown>,
    revision: number,
  ): Promise<void> {
    this.db
      .prepare("UPDATE instances SET metadata_json = ?, revision = ? WHERE instance_id = ?")
      .run(JSON.stringify(metadata), revision, instance_id);
  }

  async insertContractRef(row: ContractRefRow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO contract_refs (contract_ref_id, capability_id, semver, digest, contract_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(row.contract_ref_id, row.capability_id, row.semver, row.digest, JSON.stringify(row.contract));
  }

  async getContractRef(contract_ref_id: string): Promise<ContractRefRow | null> {
    const row = this.db
      .prepare("SELECT * FROM contract_refs WHERE contract_ref_id = ?")
      .get(contract_ref_id) as Record<string, string> | undefined;
    if (!row) return null;
    return {
      contract_ref_id: row.contract_ref_id,
      capability_id: row.capability_id,
      semver: row.semver,
      digest: row.digest,
      contract: parseJson(row.contract_json),
    };
  }

  async getToken(token_id: string): Promise<TokenRow | null> {
    const row = this.db.prepare("SELECT * FROM tokens WHERE token_id = ?").get(token_id) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return {
      token_id: row.token_id,
      actor_id: row.actor_id,
      space_id: row.space_id,
      scopes: parseJson(row.scopes_json),
      capabilities: row.capabilities_json ? parseJson(row.capabilities_json) : undefined,
      harness_id: row.harness_id ?? undefined,
      flow_acl: parseFlowAclJson(row),
      status: row.status as TokenRow["status"],
    };
  }

  async insertToken(row: TokenRow, created_at: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO tokens (token_id, actor_id, space_id, scopes_json, harness_id, flow_acl_json, capabilities_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.token_id,
        row.actor_id,
        row.space_id,
        JSON.stringify(row.scopes),
        row.harness_id ?? null,
        row.flow_acl ? JSON.stringify(row.flow_acl) : null,
        row.capabilities ? JSON.stringify(row.capabilities) : null,
        row.status,
        created_at,
      );
  }

  async revokeToken(token_id: string): Promise<void> {
    this.db
      .prepare("UPDATE tokens SET status = 'revoked' WHERE token_id = ?")
      .run(token_id);
  }

  async insertGrant(row: GrantRow, created_at: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO grants (grant_id, token_id, space_id, actor_id, scopes_json, status, created_at, last_activity_at, label, harness, flow_acl_json, expires_at, capabilities_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.grant_id,
        row.token_id ?? null,
        row.space_id,
        row.actor_id,
        JSON.stringify(row.scopes),
        row.status,
        created_at,
        row.last_activity_at ?? null,
        row.label ?? null,
        row.harness ?? null,
        row.flow_acl ? JSON.stringify(row.flow_acl) : null,
        row.expires_at ?? null,
        row.capabilities ? JSON.stringify(row.capabilities) : null,
      );
  }

  async getGrant(grant_id: string): Promise<GrantRow | null> {
    const row = this.db.prepare("SELECT * FROM grants WHERE grant_id = ?").get(grant_id) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return {
      grant_id: row.grant_id,
      token_id: row.token_id ?? undefined,
      space_id: row.space_id,
      actor_id: row.actor_id,
      scopes: parseJson(row.scopes_json),
      capabilities: row.capabilities_json ? parseJson(row.capabilities_json) : undefined,
      status: row.status as GrantRow["status"],
      last_activity_at: row.last_activity_at ?? undefined,
      label: row.label ?? undefined,
      harness: row.harness ?? undefined,
      flow_acl: parseFlowAclJson(row),
      expires_at: row.expires_at ?? undefined,
    };
  }

  async listGrants(space_id: string): Promise<GrantRow[]> {
    const rows = this.db
      .prepare("SELECT grant_id FROM grants WHERE space_id = ? ORDER BY created_at DESC")
      .all(space_id) as Array<{ grant_id: string }>;
    const out: GrantRow[] = [];
    for (const r of rows) {
      const g = await this.getGrant(r.grant_id);
      if (g) out.push(g);
    }
    return out;
  }

  async listAllGrants(): Promise<GrantRow[]> {
    const rows = this.db
      .prepare("SELECT grant_id FROM grants WHERE status = 'active'")
      .all() as Array<{ grant_id: string }>;
    const out: GrantRow[] = [];
    for (const r of rows) {
      const g = await this.getGrant(r.grant_id);
      if (g) out.push(g);
    }
    return out;
  }

  async revokeGrant(grant_id: string): Promise<void> {
    this.db.prepare("UPDATE grants SET status = 'revoked' WHERE grant_id = ?").run(grant_id);
  }

  async allocateSpaceSeq(space_id: string): Promise<number> {
    const row = this.db.prepare("SELECT next_seq FROM space_seq_counters WHERE space_id = ?").get(space_id) as
      | { next_seq: number }
      | undefined;
    if (!row) {
      this.db
        .prepare("INSERT INTO space_seq_counters (space_id, next_seq) VALUES (?, 1)")
        .run(space_id);
      return 1;
    }
    const next = row.next_seq + 1;
    this.db.prepare("UPDATE space_seq_counters SET next_seq = ? WHERE space_id = ?").run(next, space_id);
    return next;
  }

  async allocateInstanceSeq(instance_id: string): Promise<number> {
    const row = this.db
      .prepare("SELECT next_seq FROM instance_seq_counters WHERE instance_id = ?")
      .get(instance_id) as { next_seq: number } | undefined;
    if (!row) {
      this.db
        .prepare("INSERT INTO instance_seq_counters (instance_id, next_seq) VALUES (?, 1)")
        .run(instance_id);
      return 1;
    }
    const next = row.next_seq + 1;
    this.db
      .prepare("UPDATE instance_seq_counters SET next_seq = ? WHERE instance_id = ?")
      .run(next, instance_id);
    return next;
  }

  async insertTrigger(row: Record<string, unknown>): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO triggers (trigger_id, space_id, instance_id, spec_json, cron, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.trigger_id,
        row.space_id,
        row.instance_id ?? null,
        JSON.stringify(row.spec),
        row.cron ?? null,
        row.status ?? "active",
        row.created_at,
      );
  }

  async listTriggers(space_id: string): Promise<Record<string, unknown>[]> {
    const rows = this.db
      .prepare("SELECT * FROM triggers WHERE space_id = ? AND status = 'active'")
      .all(space_id) as Record<string, unknown>[];
    return rows.map((r) => ({
      ...r,
      spec: typeof r.spec_json === "string" ? JSON.parse(r.spec_json as string) : r.spec_json,
    }));
  }

  async listAllActiveTriggers(): Promise<Record<string, unknown>[]> {
    const rows = this.db
      .prepare("SELECT * FROM triggers WHERE status = 'active'")
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      ...r,
      spec: typeof r.spec_json === "string" ? JSON.parse(r.spec_json as string) : r.spec_json,
    }));
  }

  async disableTrigger(trigger_id: string): Promise<void> {
    this.db.prepare("UPDATE triggers SET status = 'disabled' WHERE trigger_id = ?").run(trigger_id);
  }

  async insertTriggerDelivery(row: Record<string, unknown>): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO trigger_deliveries (delivery_id, space_id, trigger_id, source_event_id, outcome, dedup_reason, fingerprint, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.delivery_id,
        row.space_id,
        row.trigger_id,
        row.source_event_id ?? null,
        row.outcome,
        row.dedup_reason ?? null,
        row.fingerprint ?? null,
        row.created_at,
      );
  }

  async findTriggerDeliveryByFingerprint(
    space_id: string,
    trigger_id: string,
    fingerprint: string,
    window_seconds: number,
  ): Promise<Record<string, unknown> | null> {
    const since = new Date(Date.now() - window_seconds * 1000).toISOString();
    const row = this.db
      .prepare(
        `SELECT * FROM trigger_deliveries
         WHERE space_id = ? AND trigger_id = ? AND fingerprint = ? AND outcome = 'success' AND created_at >= ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(space_id, trigger_id, fingerprint, since) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  async listTriggerDeliveries(space_id: string, limit = 50): Promise<Record<string, unknown>[]> {
    return this.db
      .prepare(
        `SELECT * FROM trigger_deliveries WHERE space_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(space_id, limit) as Record<string, unknown>[];
  }

  async insertFlowInstall(row: FlowInstall, created_at: string): Promise<void> {
    const bareInstall = stripInstallBareId(row.install_id);
    const bareSpace = row.space_id.startsWith("spc_") ? row.space_id.slice(4) : row.space_id;
    this.db
      .prepare(
        `INSERT INTO capability_installs (install_id, space_id, package_id, version, contract_ref_id, evolution_state, config_json, gate_id, bundle_digest, source_digest, source_metadata_json, routes_prefix, canvas_route, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        bareInstall,
        bareSpace,
        row.flow_id,
        row.version,
        row.contract_ref_id,
        row.evolution_state,
        JSON.stringify(row.config ?? {}),
        row.gate_id ?? null,
        row.bundle_digest ?? null,
        row.source_digest ?? null,
        row.source_metadata ? JSON.stringify(row.source_metadata) : null,
        row.routes_prefix ?? null,
        row.canvas_route ?? null,
        created_at,
      );
  }

  private rowToFlowInstall(row: Record<string, string>): FlowInstall {
    return {
      install_id: prefixedInstallId(row.install_id),
      space_id: `spc_${row.space_id}`,
      flow_id: row.package_id,
      version: row.version,
      contract_ref_id: row.contract_ref_id,
      evolution_state: row.evolution_state as FlowInstall["evolution_state"],
      config: parseJson(row.config_json),
      gate_id: row.gate_id ?? undefined,
      bundle_digest: row.bundle_digest ?? undefined,
      source_digest: row.source_digest ?? undefined,
      source_metadata: row.source_metadata_json ? parseJson(row.source_metadata_json) : undefined,
      routes_prefix: row.routes_prefix ?? undefined,
      canvas_route: row.canvas_route ?? undefined,
    };
  }

  async getFlowInstall(install_id: string): Promise<FlowInstall | null> {
    const bare = stripInstallBareId(install_id);
    const row = this.db
      .prepare("SELECT * FROM capability_installs WHERE install_id = ?")
      .get(bare) as Record<string, string> | undefined;
    if (!row) return null;
    return this.rowToFlowInstall(row);
  }

  async listFlowInstalls(space_id: string): Promise<FlowInstall[]> {
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    const rows = this.db
      .prepare("SELECT * FROM capability_installs WHERE space_id = ? ORDER BY created_at")
      .all(bare) as Array<Record<string, string>>;
    return rows.map((r) => this.rowToFlowInstall(r));
  }

  async findFlowInstallByPackageVersion(
    flow_id: string,
    version: string,
  ): Promise<FlowInstall | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM capability_installs WHERE package_id = ? AND version = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(flow_id, version) as Record<string, string> | undefined;
    if (!row) return null;
    return this.rowToFlowInstall(row);
  }

  async updateFlowInstall(install_id: string, patch: Partial<FlowInstall>): Promise<void> {
    const bare = stripInstallBareId(install_id);
    const current = await this.getFlowInstall(install_id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE capability_installs SET evolution_state = ?, config_json = ?, gate_id = ?, version = ?, bundle_digest = ?, source_digest = ?, source_metadata_json = ?, routes_prefix = ?, canvas_route = ? WHERE install_id = ?`,
      )
      .run(
        next.evolution_state,
        JSON.stringify(next.config ?? {}),
        next.gate_id ?? null,
        next.version,
        next.bundle_digest ?? null,
        next.source_digest ?? null,
        next.source_metadata ? JSON.stringify(next.source_metadata) : null,
        next.routes_prefix ?? null,
        next.canvas_route ?? null,
        bare,
      );
  }

  async insertMember(member: Member, created_at: string): Promise<void> {
    const bareSpace = member.space_id.startsWith("spc_") ? member.space_id.slice(4) : member.space_id;
    const bareMember = member.member_id.startsWith("mbr_") ? member.member_id.slice(4) : member.member_id;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO members (space_id, actor_id, role, member_id, email, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(bareSpace, member.actor_id ?? bareMember, member.role, bareMember, member.email, created_at);
  }

  async listMembers(space_id: string): Promise<Member[]> {
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    const rows = this.db.prepare("SELECT * FROM members WHERE space_id = ?").all(bare) as Array<
      Record<string, string>
    >;
    return rows.map((r) => ({
      member_id: `mbr_${r.member_id ?? r.actor_id}`,
      space_id: `spc_${r.space_id}`,
      email: r.email ?? `${r.actor_id}@local`,
      role: r.role as Member["role"],
      actor_id: r.actor_id,
    }));
  }

  async updateMemberRole(space_id: string, member_id: string, role: Member["role"]): Promise<void> {
    const bareSpace = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    const bareMember = member_id.startsWith("mbr_") ? member_id.slice(4) : member_id;
    this.db
      .prepare("UPDATE members SET role = ? WHERE space_id = ? AND member_id = ?")
      .run(role, bareSpace, bareMember);
  }

  async removeMember(space_id: string, member_id: string): Promise<void> {
    const bareSpace = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    const bareMember = member_id.startsWith("mbr_") ? member_id.slice(4) : member_id;
    this.db.prepare("DELETE FROM members WHERE space_id = ? AND member_id = ?").run(bareSpace, bareMember);
  }

  async insertBlob(row: Record<string, unknown>): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO blobs (blob_id, space_id, media_type, digest, path, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(row.blob_id, row.space_id, row.media_type, row.digest, row.path, row.created_at);
  }

  async getBlob(blob_id: string): Promise<Record<string, unknown> | null> {
    return (this.db.prepare("SELECT * FROM blobs WHERE blob_id = ?").get(blob_id) as Record<
      string,
      unknown
    >) ?? null;
  }

  async insertQuery(row: Record<string, unknown>): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO queries (query_id, space_id, asker_actor_id, schema_json, status, ask_payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.query_id,
        row.space_id,
        row.asker_actor_id,
        JSON.stringify(row.schema),
        row.status ?? "pending",
        row.ask_payload ? JSON.stringify(row.ask_payload) : null,
        row.created_at,
      );
  }

  async getQuery(query_id: string): Promise<Record<string, unknown> | null> {
    return (this.db.prepare("SELECT * FROM queries WHERE query_id = ?").get(query_id) as Record<
      string,
      unknown
    >) ?? null;
  }

  async answerQuery(query_id: string, payload: Record<string, unknown>): Promise<void> {
    this.db
      .prepare(
        `UPDATE queries SET status = 'answered', answer_payload_json = ?, answered_at = ? WHERE query_id = ?`,
      )
      .run(JSON.stringify(payload), new Date().toISOString(), query_id);
  }

  async insertFederationHub(row: Record<string, unknown>): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO federation_hubs (hub_id, endpoint, status, routing_json) VALUES (?, ?, ?, ?)`,
      )
      .run(row.hub_id, row.endpoint, row.status ?? "active", JSON.stringify(row.routing ?? {}));
  }

  async getFederationHub(hub_id: string): Promise<Record<string, unknown> | null> {
    return (this.db.prepare("SELECT * FROM federation_hubs WHERE hub_id = ?").get(hub_id) as Record<
      string,
      unknown
    >) ?? null;
  }

  async enqueueFederationOutbound(row: Record<string, unknown>): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO federation_outbound (outbound_id, target_hub_id, payload_json, status, created_at)
         VALUES (?, ?, ?, 'pending', ?)`,
      )
      .run(row.outbound_id, row.target_hub_id, JSON.stringify(row.payload), row.created_at);
  }

  async claimFederationOutbound(limit: number): Promise<Record<string, unknown>[]> {
    return this.db
      .prepare(
        `SELECT * FROM federation_outbound WHERE status = 'pending' ORDER BY created_at LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];
  }

  async completeFederationOutbound(outbound_id: string): Promise<void> {
    this.db
      .prepare(`UPDATE federation_outbound SET status = 'sent', sent_at = ? WHERE outbound_id = ?`)
      .run(new Date().toISOString(), outbound_id);
  }

  async countFederationOutboundPending(): Promise<number> {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM federation_outbound WHERE status = 'pending'`)
      .get() as { count: number };
    return row.count;
  }

  async listFederationHubs(): Promise<Record<string, unknown>[]> {
    return this.db.prepare("SELECT * FROM federation_hubs").all() as Record<string, unknown>[];
  }

  async hasFederationIngressDedup(source_hub_id: string, event_id: string): Promise<boolean> {
    const row = this.db
      .prepare(
        "SELECT 1 FROM federation_ingress_dedup WHERE source_hub_id = ? AND event_id = ? LIMIT 1",
      )
      .get(source_hub_id, event_id);
    return row != null;
  }

  async insertFederationIngressDedup(
    source_hub_id: string,
    event_id: string,
    ingested_at: string,
  ): Promise<void> {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO federation_ingress_dedup (source_hub_id, event_id, ingested_at) VALUES (?, ?, ?)",
      )
      .run(source_hub_id, event_id, ingested_at);
  }

  private bareSpaceId(space_id: string): string {
    return space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
  }

  async getSpaceBindings(space_id: string): Promise<SpaceBinding[]> {
    const row = this.db
      .prepare("SELECT bindings_json FROM spaces WHERE space_id = ?")
      .get(this.bareSpaceId(space_id)) as { bindings_json?: string } | undefined;
    if (!row?.bindings_json) return [];
    return JSON.parse(row.bindings_json) as SpaceBinding[];
  }

  async setSpaceBindings(space_id: string, bindings: SpaceBinding[]): Promise<void> {
    this.db
      .prepare("UPDATE spaces SET bindings_json = ? WHERE space_id = ?")
      .run(JSON.stringify(bindings), this.bareSpaceId(space_id));
  }

  async getSpaceIndexSnapshot(space_id: string): Promise<SpaceIndexSnapshot> {
    const bare = this.bareSpaceId(space_id);
    const actions = this.db
      .prepare("SELECT name AS key, digest, payload_json FROM space_actions WHERE space_id = ?")
      .all(bare) as IndexedResourceRow[];
    const executors = this.db
      .prepare("SELECT name AS key, digest, payload_json FROM space_executors WHERE space_id = ?")
      .all(bare) as IndexedResourceRow[];
    const hooks = this.db
      .prepare("SELECT name AS key, digest, payload_json FROM space_hooks WHERE space_id = ?")
      .all(bare) as IndexedResourceRow[];
    const events = this.db
      .prepare("SELECT name AS key, digest, payload_json FROM space_events WHERE space_id = ?")
      .all(bare) as IndexedResourceRow[];
    const views = this.db
      .prepare("SELECT name AS key, digest, payload_json FROM space_views WHERE space_id = ?")
      .all(bare) as IndexedResourceRow[];
    const runPolicies = this.db
      .prepare("SELECT flow_id AS key, flow_digest AS digest, payload_json FROM space_run_policies WHERE space_id = ?")
      .all(bare) as IndexedResourceRow[];
    const flowRows = this.db
      .prepare("SELECT payload_json FROM flow_index WHERE origin_space_id = ?")
      .all(bare) as Array<{ payload_json: string }>;
    const flows = flowRows.map((row) => JSON.parse(row.payload_json) as SpaceIndexSnapshot["flows"][number]);
    return { actions, executors, hooks, events, flows, views, run_policies: runPolicies };
  }

  async replaceSpaceIndex(space_id: string, snapshot: SpaceIndexSnapshot): Promise<void> {
    const bare = this.bareSpaceId(space_id);
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM space_actions WHERE space_id = ?").run(bare);
      this.db.prepare("DELETE FROM space_executors WHERE space_id = ?").run(bare);
      this.db.prepare("DELETE FROM space_hooks WHERE space_id = ?").run(bare);
      this.db.prepare("DELETE FROM space_events WHERE space_id = ?").run(bare);
      this.db.prepare("DELETE FROM space_views WHERE space_id = ?").run(bare);
      this.db.prepare("DELETE FROM space_run_policies WHERE space_id = ?").run(bare);
      this.db.prepare("DELETE FROM flow_index WHERE origin_space_id = ?").run(bare);

      const insertAction = this.db.prepare(
        "INSERT INTO space_actions (space_id, name, digest, payload_json) VALUES (?, ?, ?, ?)",
      );
      for (const row of snapshot.actions) {
        insertAction.run(bare, row.key, row.digest, row.payload_json);
      }

      const insertExecutor = this.db.prepare(
        "INSERT INTO space_executors (space_id, name, digest, payload_json) VALUES (?, ?, ?, ?)",
      );
      for (const row of snapshot.executors) {
        insertExecutor.run(bare, row.key, row.digest, row.payload_json);
      }

      const insertHook = this.db.prepare(
        "INSERT INTO space_hooks (space_id, name, digest, payload_json) VALUES (?, ?, ?, ?)",
      );
      for (const row of snapshot.hooks) {
        insertHook.run(bare, row.key, row.digest, row.payload_json);
      }

      const insertEvent = this.db.prepare(
        "INSERT INTO space_events (space_id, name, digest, payload_json) VALUES (?, ?, ?, ?)",
      );
      for (const row of snapshot.events ?? []) {
        insertEvent.run(bare, row.key, row.digest, row.payload_json);
      }

      const insertView = this.db.prepare(
        "INSERT INTO space_views (space_id, name, digest, payload_json) VALUES (?, ?, ?, ?)",
      );
      for (const row of snapshot.views ?? []) {
        insertView.run(bare, row.key, row.digest, row.payload_json);
      }

      const insertFlow = this.db.prepare(
        "INSERT INTO flow_index (flow_id, origin_space_id, digest, payload_json) VALUES (?, ?, ?, ?)",
      );
      for (const row of snapshot.flows) {
        insertFlow.run(
          row.flow_id,
          bare,
          row.digest,
          row.payload_json,
        );
      }

      const insertRunPolicy = this.db.prepare(
        "INSERT INTO space_run_policies (space_id, flow_id, flow_digest, payload_json) VALUES (?, ?, ?, ?)",
      );
      for (const row of snapshot.run_policies ?? []) {
        insertRunPolicy.run(bare, row.key, row.digest, row.payload_json);
      }
    });
    tx();
  }

  async listIndexedActions(space_id: string): Promise<IndexedAction[]> {
    const bare = this.bareSpaceId(space_id);
    const rows = this.db
      .prepare("SELECT payload_json FROM space_actions WHERE space_id = ? ORDER BY name")
      .all(bare) as Array<{ payload_json: string }>;
    return rows.map((r) => JSON.parse(r.payload_json) as IndexedAction);
  }

  async listIndexedExecutors(space_id: string): Promise<Array<Record<string, unknown>>> {
    const bare = this.bareSpaceId(space_id);
    const rows = this.db
      .prepare("SELECT payload_json FROM space_executors WHERE space_id = ? ORDER BY name")
      .all(bare) as Array<{ payload_json: string }>;
    return rows.map((r) => JSON.parse(r.payload_json) as Record<string, unknown>);
  }

  async listIndexedHooks(space_id: string): Promise<Array<Record<string, unknown>>> {
    const bare = this.bareSpaceId(space_id);
    const rows = this.db
      .prepare("SELECT payload_json FROM space_hooks WHERE space_id = ? ORDER BY name")
      .all(bare) as Array<{ payload_json: string }>;
    return rows.map((r) => JSON.parse(r.payload_json) as Record<string, unknown>);
  }

  async listIndexedEvents(space_id: string): Promise<Array<Record<string, unknown>>> {
    const bare = this.bareSpaceId(space_id);
    const rows = this.db
      .prepare("SELECT payload_json FROM space_events WHERE space_id = ? ORDER BY name")
      .all(bare) as Array<{ payload_json: string }>;
    return rows.map((r) => JSON.parse(r.payload_json) as Record<string, unknown>);
  }

  async listIndexedViews(space_id: string): Promise<Array<Record<string, unknown>>> {
    const bare = this.bareSpaceId(space_id);
    const rows = this.db
      .prepare("SELECT payload_json FROM space_views WHERE space_id = ? ORDER BY name")
      .all(bare) as Array<{ payload_json: string }>;
    return rows.map((r) => JSON.parse(r.payload_json) as Record<string, unknown>);
  }

  async listIndexedRunPolicies(space_id: string): Promise<ResolvedRunPolicy[]> {
    const bare = this.bareSpaceId(space_id);
    const rows = this.db
      .prepare("SELECT payload_json FROM space_run_policies WHERE space_id = ? ORDER BY flow_id")
      .all(bare) as Array<{ payload_json: string }>;
    return rows.map((r) => JSON.parse(r.payload_json) as ResolvedRunPolicy);
  }

  async listFlowIndex(space_id: string): Promise<FlowIndexEntry[]> {
    const bare = this.bareSpaceId(space_id);
    const rows = this.db
      .prepare("SELECT payload_json FROM flow_index WHERE origin_space_id = ? ORDER BY flow_id")
      .all(bare) as Array<{ payload_json: string }>;
    return rows.map((r) => JSON.parse(r.payload_json) as FlowIndexEntry);
  }

  async getFlowIndexEntry(flow_id: string, origin_space_id?: string): Promise<FlowIndexEntry | null> {
    const row = origin_space_id
      ? (this.db
          .prepare("SELECT payload_json FROM flow_index WHERE origin_space_id = ? AND flow_id = ?")
          .get(this.bareSpaceId(origin_space_id), flow_id) as { payload_json?: string } | undefined)
      : (this.db
          .prepare("SELECT payload_json FROM flow_index WHERE flow_id = ? LIMIT 1")
          .get(flow_id) as { payload_json?: string } | undefined);
    if (!row?.payload_json) return null;
    return JSON.parse(row.payload_json) as FlowIndexEntry;
  }

  private rowToArtifact(row: Record<string, string | number>): ArtifactRow {
    return {
      transfer_id: row.transfer_id as string,
      source_space_id: row.source_space_id as string,
      name: row.name as string,
      digest: row.digest as string,
      size_bytes: row.size_bytes as number,
      hold: Boolean(row.hold),
      authorized_readers: parseJson(row.authorized_readers_json as string) as string[],
      expires_at: row.expires_at as string,
      created_at: row.created_at as string,
    };
  }

  async insertArtifact(row: ArtifactRow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO artifacts (transfer_id, source_space_id, name, digest, size_bytes, hold, authorized_readers_json, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.transfer_id,
        this.bareSpaceId(row.source_space_id),
        row.name,
        row.digest,
        row.size_bytes,
        row.hold ? 1 : 0,
        JSON.stringify(row.authorized_readers),
        row.expires_at,
        row.created_at,
      );
  }

  async getArtifact(transfer_id: string): Promise<ArtifactRow | null> {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE transfer_id = ?").get(transfer_id) as
      | Record<string, string | number>
      | undefined;
    if (!row) return null;
    return this.rowToArtifact(row);
  }

  async findArtifactByDigest(source_space_id: string, digest: string): Promise<ArtifactRow | null> {
    const row = this.db
      .prepare("SELECT * FROM artifacts WHERE source_space_id = ? AND digest = ? ORDER BY created_at DESC LIMIT 1")
      .get(this.bareSpaceId(source_space_id), digest) as Record<string, string | number> | undefined;
    if (!row) return null;
    return this.rowToArtifact(row);
  }

  async listArtifacts(): Promise<ArtifactRow[]> {
    const rows = this.db.prepare("SELECT * FROM artifacts ORDER BY created_at").all() as Array<
      Record<string, string | number>
    >;
    return rows.map((row) => this.rowToArtifact(row));
  }

  async deleteArtifact(transfer_id: string): Promise<void> {
    this.db.prepare("DELETE FROM artifacts WHERE transfer_id = ?").run(transfer_id);
  }

  private rowToSession(row: Record<string, string>): SessionRow {
    return {
      session_id: row.session_id,
      title: row.title,
      subject: row.subject ?? undefined,
      status: row.status as SessionRow["status"],
      created_by: parseJson(row.created_by_json),
      spaces_touched: parseJson(row.spaces_touched_json),
      actor_id: row.actor_id,
      cancel_requested_at: row.cancel_requested_at ?? undefined,
    };
  }

  async insertSession(row: SessionRow, created_at: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (session_id, title, subject, status, created_by_json, spaces_touched_json, actor_id, cancel_requested_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.session_id,
        row.title,
        row.subject ?? null,
        row.status,
        JSON.stringify(row.created_by),
        JSON.stringify(row.spaces_touched),
        row.actor_id,
        row.cancel_requested_at ?? null,
        created_at,
      );
  }

  async getSession(session_id: string): Promise<SessionRow | null> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    const row = this.db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(bare) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return this.rowToSession(row);
  }

  async listSessions(filter?: { space_id?: string; status?: SessionRow["status"] }): Promise<SessionRow[]> {
    let sql = "SELECT * FROM sessions";
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (filter?.status) {
      clauses.push("status = ?");
      params.push(filter.status);
    }
    if (filter?.space_id) {
      clauses.push("spaces_touched_json LIKE ?");
      params.push(`%"${filter.space_id}"%`);
    }
    if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
    sql += " ORDER BY created_at DESC";
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, string>>;
    return rows.map((r) => this.rowToSession(r));
  }

  async updateSessionStatus(session_id: string, status: SessionRow["status"]): Promise<void> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    this.db.prepare("UPDATE sessions SET status = ? WHERE session_id = ?").run(status, bare);
  }

  async markSessionCancelRequested(session_id: string, at: string): Promise<void> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    this.db
      .prepare("UPDATE sessions SET cancel_requested_at = ?, status = 'cancelled' WHERE session_id = ?")
      .run(at, bare);
  }

  async updateSessionSpacesTouched(session_id: string, spaces: string[]): Promise<void> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    this.db
      .prepare("UPDATE sessions SET spaces_touched_json = ? WHERE session_id = ?")
      .run(JSON.stringify(spaces), bare);
  }

  private rowToRun(row: Record<string, string>): RunRow {
    return {
      run_id: row.run_id,
      session_id: row.session_id,
      space_id: row.space_id ?? undefined,
      flow_id: row.flow_id ?? null,
      flow_digest: row.flow_digest ?? undefined,
      lifecycle: row.lifecycle as RunLifecycle,
      exec_context: parseJson(row.exec_context_json),
      reference_run_ids: parseJson(row.reference_run_ids_json),
      instance_id: row.instance_id ?? undefined,
      started_at: row.started_at,
      ended_at: row.ended_at ?? undefined,
    };
  }

  async insertRun(row: RunRow, created_at: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO runs (run_id, session_id, space_id, flow_id, flow_digest, lifecycle, exec_context_json, reference_run_ids_json, instance_id, started_at, ended_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.run_id,
        row.session_id,
        row.space_id ?? null,
        row.flow_id ?? null,
        row.flow_digest ?? null,
        row.lifecycle,
        JSON.stringify(row.exec_context),
        JSON.stringify(row.reference_run_ids),
        row.instance_id ?? null,
        row.started_at,
        row.ended_at ?? null,
        created_at,
      );
  }

  async getRun(run_id: string): Promise<RunRow | null> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id.startsWith("ins_") ? run_id.slice(4) : run_id;
    const row = this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(bare) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return this.rowToRun(row);
  }

  async listRunsBySession(session_id: string): Promise<RunRow[]> {
    const bare = session_id.startsWith("ses_") ? session_id.slice(4) : session_id;
    const rows = this.db
      .prepare("SELECT * FROM runs WHERE session_id = ? ORDER BY started_at")
      .all(bare) as Array<Record<string, string>>;
    return rows.map((r) => this.rowToRun(r));
  }

  async listRuns(filter?: {
    space_id?: string;
    flow_id?: string;
    lifecycles?: RunLifecycle[];
    limit?: number;
  }): Promise<RunRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.space_id) {
      const bare = filter.space_id.startsWith("spc_") ? filter.space_id.slice(4) : filter.space_id;
      conditions.push("(space_id = ? OR space_id = ?)");
      params.push(bare, filter.space_id);
    }
    if (filter?.flow_id) {
      conditions.push("flow_id = ?");
      params.push(filter.flow_id);
    }
    if (filter?.lifecycles?.length) {
      conditions.push(`lifecycle IN (${filter.lifecycles.map(() => "?").join(", ")})`);
      params.push(...filter.lifecycles);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter?.limit ? ` LIMIT ${Math.max(1, filter.limit)}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM runs ${where} ORDER BY started_at DESC${limit}`)
      .all(...params) as Array<Record<string, string>>;
    return rows.map((r) => this.rowToRun(r));
  }

  async findRunByFlowKey(flow_id: string, run_key: string): Promise<RunRow | null> {
    const rows = this.db
      .prepare(
        `SELECT * FROM runs WHERE flow_id = ? AND lifecycle IN ('working', 'input-required', 'failed', 'completed')`,
      )
      .all(flow_id) as Array<Record<string, string>>;
    for (const row of rows) {
      const run = this.rowToRun(row);
      if (run.exec_context._run_key === run_key) return run;
    }
    return null;
  }

  async findRunByIdempotencyKey(idempotency_key: string): Promise<RunRow | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM runs WHERE json_extract(exec_context_json, '$.idempotency_key') = ? LIMIT 1`,
      )
      .get(idempotency_key) as Record<string, string> | undefined;
    if (!row) return null;
    return this.rowToRun(row);
  }

  async updateRunLifecycle(run_id: string, lifecycle: RunLifecycle, ended_at?: string): Promise<void> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id.startsWith("ins_") ? run_id.slice(4) : run_id;
    if (ended_at) {
      this.db
        .prepare("UPDATE runs SET lifecycle = ?, ended_at = ? WHERE run_id = ?")
        .run(lifecycle, ended_at, bare);
    } else {
      this.db.prepare("UPDATE runs SET lifecycle = ? WHERE run_id = ?").run(lifecycle, bare);
    }
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
    if (patch.exec_context) {
      this.db
        .prepare("UPDATE runs SET flow_id = ?, flow_digest = ?, exec_context_json = ? WHERE run_id = ?")
        .run(patch.flow_id, patch.flow_digest, JSON.stringify(patch.exec_context), bare);
    } else {
      this.db
        .prepare("UPDATE runs SET flow_id = ?, flow_digest = ? WHERE run_id = ?")
        .run(patch.flow_id, patch.flow_digest, bare);
    }
  }

  async getRunByInstanceId(instance_id: string): Promise<RunRow | null> {
    const bare = instance_id.startsWith("ins_") ? instance_id.slice(4) : instance_id;
    const row = this.db.prepare("SELECT * FROM runs WHERE instance_id = ? OR run_id = ?").get(bare, bare) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return this.rowToRun(row);
  }

  async upsertRunStepMemo(memo: RunStepMemo): Promise<void> {
    const bareRun = memo.run_id.startsWith("run_") ? memo.run_id.slice(4) : memo.run_id;
    this.db
      .prepare(
        `INSERT INTO run_step_memo (run_id, step_id, status, idempotency_key, result_hash, started_at, completed_at, error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, step_id) DO UPDATE SET
           status = excluded.status,
           idempotency_key = excluded.idempotency_key,
           result_hash = excluded.result_hash,
           started_at = excluded.started_at,
           completed_at = excluded.completed_at,
           error_code = excluded.error_code`,
      )
      .run(
        bareRun,
        memo.step_id,
        memo.status,
        memo.idempotency_key ?? null,
        memo.result_hash ?? null,
        memo.started_at ?? null,
        memo.completed_at ?? null,
        memo.error_code ?? null,
      );
  }

  async listRunStepMemos(run_id: string): Promise<RunStepMemo[]> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const rows = this.db
      .prepare("SELECT * FROM run_step_memo WHERE run_id = ? ORDER BY step_id")
      .all(bare) as Array<Record<string, string>>;
    return rows.map((r) => ({
      run_id: `run_${r.run_id}` as RunStepMemo["run_id"],
      step_id: r.step_id,
      status: r.status as RunStepMemo["status"],
      idempotency_key: r.idempotency_key ?? undefined,
      result_hash: r.result_hash ?? undefined,
      started_at: r.started_at ?? undefined,
      completed_at: r.completed_at ?? undefined,
      error_code: r.error_code ?? undefined,
    }));
  }

  async getRunStepMemoByIdempotencyKey(idempotency_key: string): Promise<RunStepMemo | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM run_step_memo WHERE idempotency_key = ? ORDER BY completed_at DESC LIMIT 1",
      )
      .get(idempotency_key) as Record<string, string> | undefined;
    if (!row) return null;
    return {
      run_id: `run_${row.run_id}` as RunStepMemo["run_id"],
      step_id: row.step_id,
      status: row.status as RunStepMemo["status"],
      idempotency_key: row.idempotency_key ?? undefined,
      result_hash: row.result_hash ?? undefined,
      started_at: row.started_at ?? undefined,
      completed_at: row.completed_at ?? undefined,
      error_code: row.error_code ?? undefined,
    };
  }

  async deleteRunStepMemos(run_id: string): Promise<void> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    this.db.prepare("DELETE FROM run_step_memo WHERE run_id = ?").run(bare);
  }

  private rowToGate(row: Record<string, string>): GateRow {
    return {
      gate_id: row.gate_id,
      run_id: row.run_id,
      session_id: row.session_id,
      space_id: row.space_id,
      step_id: row.step_id,
      status: row.status as GateRow["status"],
      assignees: row.assignees_json ? parseJson(row.assignees_json) : undefined,
      resolve_mode: "any_one",
      expires_at: row.expires_at ?? undefined,
      form: row.form_json ? parseJson(row.form_json) : undefined,
      payload_ref: row.payload_ref ?? undefined,
      action_name: row.action_name ?? undefined,
      created_at: row.created_at,
      resolved_at: row.resolved_at ?? undefined,
      resolved_by: row.resolved_by ?? undefined,
      decision: row.decision ?? undefined,
    };
  }

  async insertGate(row: GateRow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO gates (gate_id, run_id, session_id, space_id, step_id, status, assignees_json, resolve_mode, expires_at, form_json, payload_ref, action_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.gate_id,
        row.run_id,
        row.session_id,
        row.space_id,
        row.step_id,
        row.status,
        row.assignees ? JSON.stringify(row.assignees) : null,
        row.resolve_mode,
        row.expires_at ?? null,
        row.form ? JSON.stringify(row.form) : null,
        row.payload_ref ?? null,
        row.action_name ?? null,
        row.created_at,
      );
  }

  async getGate(gate_id: string): Promise<GateRow | null> {
    const bare = barePrefixedId(gate_id);
    const row = this.db.prepare("SELECT * FROM gates WHERE gate_id = ?").get(bare) as
      | Record<string, string>
      | undefined;
    return row ? this.rowToGate(row) : null;
  }

  async listGatesByRun(run_id: string): Promise<GateRow[]> {
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const rows = this.db.prepare("SELECT * FROM gates WHERE run_id = ? ORDER BY created_at").all(bare) as Array<
      Record<string, string>
    >;
    return rows.map((r) => this.rowToGate(r));
  }

  async listPendingGates(filter?: { run_id?: string; session_id?: string }): Promise<GateRow[]> {
    let sql = "SELECT * FROM gates WHERE status = 'pending'";
    const params: string[] = [];
    if (filter?.run_id) {
      sql += " AND run_id = ?";
      params.push(filter.run_id.startsWith("run_") ? filter.run_id.slice(4) : filter.run_id);
    }
    if (filter?.session_id) {
      sql += " AND session_id = ?";
      params.push(filter.session_id.startsWith("ses_") ? filter.session_id.slice(4) : filter.session_id);
    }
    sql += " ORDER BY created_at";
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, string>>;
    return rows.map((r) => this.rowToGate(r));
  }

  async updateGateStatus(
    gate_id: string,
    status: GateRow["status"],
    meta?: { resolved_at?: string; resolved_by?: string; decision?: string },
  ): Promise<void> {
    const bare = barePrefixedId(gate_id);
    this.db
      .prepare(
        `UPDATE gates SET status = ?, resolved_at = ?, resolved_by = ?, decision = ? WHERE gate_id = ?`,
      )
      .run(status, meta?.resolved_at ?? null, meta?.resolved_by ?? null, meta?.decision ?? null, bare);
  }

  async insertNotification(row: NotificationRow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO notifications (notification_id, actor_id, kind, status, gate_id, step_id, run_id, session_id, space_id, space_hidden, title, summary, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.notification_id,
        row.actor_id,
        row.kind,
        row.status,
        row.gate_id ?? null,
        row.step_id ?? null,
        row.run_id ?? null,
        row.session_id ?? null,
        row.space_id,
        row.space_hidden,
        row.title,
        row.summary ?? null,
        row.expires_at ?? null,
        row.created_at,
      );
  }

  async listNotifications(
    actor_id: string,
    filter?: { status?: NotificationRow["status"] },
  ): Promise<NotificationRow[]> {
    let sql = "SELECT * FROM notifications WHERE actor_id = ?";
    const params: Array<string> = [actor_id];
    if (filter?.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    sql += " ORDER BY created_at DESC";
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, string>>;
    return rows.map((r) => ({
      notification_id: r.notification_id,
      actor_id: r.actor_id,
      kind: r.kind as NotificationRow["kind"],
      status: r.status as NotificationRow["status"],
      gate_id: r.gate_id ?? undefined,
      step_id: r.step_id ?? undefined,
      run_id: r.run_id ?? undefined,
      session_id: r.session_id ?? undefined,
      space_id: r.space_id,
      space_hidden: Number(r.space_hidden),
      title: r.title,
      summary: r.summary ?? undefined,
      expires_at: r.expires_at ?? undefined,
      created_at: r.created_at,
      dismissed_at: r.dismissed_at ?? undefined,
      resolved_at: r.resolved_at ?? undefined,
    }));
  }

  async dismissNotification(notification_id: string, actor_id: string, at: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE notifications SET status = 'dismissed', dismissed_at = ? WHERE notification_id = ? AND actor_id = ?`,
      )
      .run(at, notification_id, actor_id);
  }

  async resolveNotificationsForRunStep(run_id: string, step_id: string, at: string): Promise<void> {
    const bareRun = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    this.db
      .prepare(
        `UPDATE notifications SET status = 'resolved', resolved_at = ? WHERE run_id = ? AND step_id = ? AND status = 'pending'`,
      )
      .run(at, bareRun, step_id);
  }

  async resolveNotificationsForGate(gate_id: string, at: string): Promise<void> {
    const bare = barePrefixedId(gate_id);
    this.db
      .prepare(
        `UPDATE notifications SET status = 'resolved', resolved_at = ? WHERE gate_id = ? AND status = 'pending'`,
      )
      .run(at, bare);
  }

  async countPendingNotifications(actor_id: string): Promise<number> {
    const row = this.db
      .prepare(`SELECT COUNT(*) as c FROM notifications WHERE actor_id = ? AND status = 'pending'`)
      .get(actor_id) as { c: number };
    return row.c;
  }

  async getUserPrefs(actor_id: string): Promise<UserPrefsRow | null> {
    const row = this.db.prepare("SELECT * FROM user_prefs WHERE actor_id = ?").get(actor_id) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return {
      actor_id: row.actor_id,
      landing_space_id: row.landing_space_id ?? undefined,
      landing_suggest_shown: Boolean(Number(row.landing_suggest_shown)),
      notify_email: row.notify_email === undefined ? true : Boolean(Number(row.notify_email)),
      notify_desktop: row.notify_desktop === undefined ? true : Boolean(Number(row.notify_desktop)),
    };
  }

  async upsertUserPrefs(row: UserPrefsRow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO user_prefs (actor_id, landing_space_id, landing_suggest_shown, notify_email, notify_desktop)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(actor_id) DO UPDATE SET
           landing_space_id = excluded.landing_space_id,
           landing_suggest_shown = excluded.landing_suggest_shown,
           notify_email = excluded.notify_email,
           notify_desktop = excluded.notify_desktop`,
      )
      .run(
        row.actor_id,
        row.landing_space_id ?? null,
        row.landing_suggest_shown ? 1 : 0,
        row.notify_email === false ? 0 : 1,
        row.notify_desktop === false ? 0 : 1,
      );
  }

  async insertJournalIndex(row: JournalIndexRow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO journal_index (entry_id, seq, space_id, type, subject, session_id, run_id, actor_id, time, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.entry_id,
        row.seq,
        row.space_id,
        row.type,
        row.subject ?? null,
        row.session_id ?? null,
        row.run_id ?? null,
        row.actor_id ?? null,
        row.time,
        row.payload_json,
      );
  }

  async queryJournalIndex(params: JournalQueryParams): Promise<JournalIndexRow[]> {
    let sql = "SELECT * FROM journal_index WHERE 1=1";
    const args: Array<string | number> = [];

    if (params.space_id) {
      sql += " AND space_id = ?";
      args.push(params.space_id);
    }
    if (params.session_id) {
      sql += " AND session_id = ?";
      args.push(params.session_id);
    }
    if (params.type) {
      if (params.type.endsWith("*")) {
        sql += " AND type LIKE ?";
        args.push(params.type.replace("*", "%"));
      } else {
        sql += " AND type = ?";
        args.push(params.type);
      }
    }
    if (params.subject) {
      if (params.subject.endsWith("*")) {
        sql += " AND subject LIKE ?";
        args.push(params.subject.replace("*", "%"));
      } else {
        sql += " AND subject = ?";
        args.push(params.subject);
      }
    }
    if (params.since) {
      sql += " AND time >= ?";
      args.push(params.since);
    }
    if (params.until) {
      sql += " AND time <= ?";
      args.push(params.until);
    }

    sql += " ORDER BY time DESC LIMIT ?";
    args.push(params.limit ?? 100);

    const rows = this.db.prepare(sql).all(...args) as Array<Record<string, string>>;
    return rows.map((r) => ({
      entry_id: r.entry_id,
      seq: Number(r.seq),
      space_id: r.space_id,
      type: r.type,
      subject: r.subject ?? undefined,
      session_id: r.session_id ?? undefined,
      run_id: r.run_id ?? undefined,
      actor_id: r.actor_id ?? undefined,
      time: r.time,
      payload_json: r.payload_json,
    }));
  }
}

export function createSqliteStudioPersistence(db: Database.Database): SqliteStudioPersistence {
  migrateStudio(db);
  return new SqliteStudioPersistence(db);
}
