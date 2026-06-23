import type { Instance, Space, FlowInstall, Member } from "@murrmure/contracts";
import type { ContractRefRow, GrantRow, StudioPersistencePort, TokenRow } from "./port.js";

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
}
