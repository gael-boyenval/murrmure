import type Database from "better-sqlite3";
import type { Instance, Space, CapabilityInstall, Member } from "@studio/contracts";
import { migrateStudio, ensureBootstrapToken } from "./migrate.js";
import type { ContractRefRow, GrantRow, StudioPersistencePort, TokenRow } from "./port.js";

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
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
      harness_id: row.harness_id ?? undefined,
      capability_acl: row.capability_acl_json ? parseJson(row.capability_acl_json) : undefined,
      status: row.status as TokenRow["status"],
    };
  }

  async insertToken(row: TokenRow, created_at: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO tokens (token_id, actor_id, space_id, scopes_json, harness_id, capability_acl_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.token_id,
        row.actor_id,
        row.space_id,
        JSON.stringify(row.scopes),
        row.harness_id ?? null,
        row.capability_acl ? JSON.stringify(row.capability_acl) : null,
        row.status,
        created_at,
      );
  }

  async insertGrant(row: GrantRow, created_at: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO grants (grant_id, space_id, actor_id, scopes_json, status, created_at, last_activity_at, label, harness, capability_acl_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.grant_id,
        row.space_id,
        row.actor_id,
        JSON.stringify(row.scopes),
        row.status,
        created_at,
        row.last_activity_at ?? null,
        row.label ?? null,
        row.harness ?? null,
        row.capability_acl ? JSON.stringify(row.capability_acl) : null,
        row.expires_at ?? null,
      );
  }

  async getGrant(grant_id: string): Promise<GrantRow | null> {
    const row = this.db.prepare("SELECT * FROM grants WHERE grant_id = ?").get(grant_id) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return {
      grant_id: row.grant_id,
      space_id: row.space_id,
      actor_id: row.actor_id,
      scopes: parseJson(row.scopes_json),
      status: row.status as GrantRow["status"],
      last_activity_at: row.last_activity_at ?? undefined,
      label: row.label ?? undefined,
      harness: row.harness ?? undefined,
      capability_acl: row.capability_acl_json ? parseJson(row.capability_acl_json) : undefined,
      expires_at: row.expires_at ?? undefined,
    };
  }

  async listGrants(space_id: string): Promise<GrantRow[]> {
    const rows = this.db
      .prepare("SELECT grant_id FROM grants WHERE space_id = ? AND status = 'active'")
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

  async insertCapabilityInstall(row: CapabilityInstall, created_at: string): Promise<void> {
    const bareInstall = row.install_id.startsWith("cap_") ? row.install_id.slice(4) : row.install_id;
    const bareSpace = row.space_id.startsWith("spc_") ? row.space_id.slice(4) : row.space_id;
    this.db
      .prepare(
        `INSERT INTO capability_installs (install_id, space_id, package_id, version, contract_ref_id, evolution_state, config_json, gate_id, bundle_digest, source_metadata_json, routes_prefix, canvas_route, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        bareInstall,
        bareSpace,
        row.package_id,
        row.version,
        row.contract_ref_id,
        row.evolution_state,
        JSON.stringify(row.config ?? {}),
        row.gate_id ?? null,
        row.bundle_digest ?? null,
        row.source_metadata ? JSON.stringify(row.source_metadata) : null,
        row.routes_prefix ?? null,
        row.canvas_route ?? null,
        created_at,
      );
  }

  private rowToCapabilityInstall(row: Record<string, string>): CapabilityInstall {
    return {
      install_id: `cap_${row.install_id}`,
      space_id: `spc_${row.space_id}`,
      package_id: row.package_id,
      version: row.version,
      contract_ref_id: row.contract_ref_id,
      evolution_state: row.evolution_state as CapabilityInstall["evolution_state"],
      config: parseJson(row.config_json),
      gate_id: row.gate_id ?? undefined,
      bundle_digest: row.bundle_digest ?? undefined,
      source_metadata: row.source_metadata_json ? parseJson(row.source_metadata_json) : undefined,
      routes_prefix: row.routes_prefix ?? undefined,
      canvas_route: row.canvas_route ?? undefined,
    };
  }

  async getCapabilityInstall(install_id: string): Promise<CapabilityInstall | null> {
    const bare = install_id.startsWith("cap_") ? install_id.slice(4) : install_id;
    const row = this.db
      .prepare("SELECT * FROM capability_installs WHERE install_id = ?")
      .get(bare) as Record<string, string> | undefined;
    if (!row) return null;
    return this.rowToCapabilityInstall(row);
  }

  async listCapabilityInstalls(space_id: string): Promise<CapabilityInstall[]> {
    const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
    const rows = this.db
      .prepare("SELECT * FROM capability_installs WHERE space_id = ? ORDER BY created_at")
      .all(bare) as Array<Record<string, string>>;
    return rows.map((r) => this.rowToCapabilityInstall(r));
  }

  async findCapabilityInstallByPackageVersion(
    package_id: string,
    version: string,
  ): Promise<CapabilityInstall | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM capability_installs WHERE package_id = ? AND version = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(package_id, version) as Record<string, string> | undefined;
    if (!row) return null;
    return this.rowToCapabilityInstall(row);
  }

  async updateCapabilityInstall(install_id: string, patch: Partial<CapabilityInstall>): Promise<void> {
    const bare = install_id.startsWith("cap_") ? install_id.slice(4) : install_id;
    const current = await this.getCapabilityInstall(install_id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE capability_installs SET evolution_state = ?, config_json = ?, gate_id = ?, version = ?, bundle_digest = ?, source_metadata_json = ?, routes_prefix = ?, canvas_route = ? WHERE install_id = ?`,
      )
      .run(
        next.evolution_state,
        JSON.stringify(next.config ?? {}),
        next.gate_id ?? null,
        next.version,
        next.bundle_digest ?? null,
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
}

export function createSqliteStudioPersistence(db: Database.Database): SqliteStudioPersistence {
  migrateStudio(db);
  return new SqliteStudioPersistence(db);
}
