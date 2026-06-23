import type { ContractV2, Instance, Space, CapabilityInstall, Member } from "@studio/contracts";

export interface TokenRow {
  token_id: string;
  actor_id: string;
  space_id: string;
  scopes: string[];
  harness_id?: string;
  capability_acl?: string[];
  status: "active" | "revoked";
}

export interface GrantRow {
  grant_id: string;
  space_id: string;
  actor_id: string;
  label?: string;
  harness?: string;
  scopes: string[];
  capability_acl?: string[];
  status: "active" | "revoked";
  last_activity_at?: string;
  expires_at?: string;
}

export interface ContractRefRow {
  contract_ref_id: string;
  capability_id: string;
  semver: string;
  digest: string;
  contract: ContractV2;
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

  insertCapabilityInstall(row: CapabilityInstall, created_at: string): Promise<void>;
  getCapabilityInstall(install_id: string): Promise<CapabilityInstall | null>;
  listCapabilityInstalls(space_id: string): Promise<CapabilityInstall[]>;
  findCapabilityInstallByPackageVersion(package_id: string, version: string): Promise<CapabilityInstall | null>;
  updateCapabilityInstall(install_id: string, patch: Partial<CapabilityInstall>): Promise<void>;

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
}
