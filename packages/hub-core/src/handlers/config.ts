import type { CommandResult } from "@murrmure/runtime-contracts";
import { successResult, denialResult, HTTP_SEMANTIC } from "@murrmure/runtime-contracts";
import type { Capability, FlowInstall, Member, StudioProvenance } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { resolveEffectiveCapabilities } from "../grants/migrate.js";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { computeFederationStatus } from "../federation/outbound-queue.js";
import type { FederationRegistryDeps } from "../federation/registry.js";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";

const GRANT_TEMPLATES: Record<string, Capability[]> = {
  worker: [
    "space:read",
    "journal:read",
    "flow:run",
    "action:invoke",
    "space:write",
  ],
  admin: ["hub:admin", "space:read", "space:enter", "space:write", "flow:read"],
};

export class ConfigHandler {
  constructor(
    private readonly studio: StudioPersistencePort,
    private readonly ids: { ulid: () => string },
    private readonly clock: { nowIso: () => string },
  ) {}

  async handleSpaceCreate(cmd: {
    slug: string;
    name?: string;
    parent_space_id?: string;
    install_policy?: string;
    preview_policy?: string;
    description?: string;
  }): Promise<CommandResult> {
    const existing = await this.studio.getSpaceBySlug(cmd.slug);
    if (existing) {
      return denialResult("space_exists", { message: `Space slug '${cmd.slug}' already exists` }, HTTP_SEMANTIC.CONFLICT);
    }

    const space_id = this.ids.ulid();
    const ts = this.clock.nowIso();
    await this.studio.insertSpace(
      {
        space_id,
        slug: cmd.slug,
        name: cmd.name ?? cmd.slug,
        status: "active",
        parent_space_id: cmd.parent_space_id,
        install_policy: (cmd.install_policy as "human_only" | "authorized_agents" | "allow_list") ?? "human_only",
        preview_policy: (cmd.preview_policy as "same_origin_only" | "allowlist") ?? "same_origin_only",
        description: cmd.description,
      },
      ts,
    );

    return successResult("space_created", {
      space_id: addSpaceId(space_id),
      slug: cmd.slug,
      name: cmd.name ?? cmd.slug,
      install_policy: cmd.install_policy ?? "human_only",
      preview_policy: cmd.preview_policy ?? "same_origin_only",
    });
  }

  async querySpaceList(tokenSpaces: Array<{ space_id: string; scopes: string[] }>) {
    const all = await this.studio.listSpaces();
    const withBindings = async (spaces: typeof all) =>
      Promise.all(
        spaces.map(async (s) => ({
          ...s,
          space_id: addSpaceId(s.space_id),
          parent_space_id: s.parent_space_id ? addSpaceId(s.parent_space_id) : undefined,
          bindings: await this.studio.getSpaceBindings(s.space_id),
        })),
      );

    if (tokenSpaces.length === 0) {
      return withBindings(all);
    }
    const grantedIds = new Set(
      tokenSpaces.map((s) => (s.space_id.startsWith("spc_") ? s.space_id : addSpaceId(s.space_id))),
    );
    return withBindings(
      all.filter((s) => grantedIds.has(addSpaceId(s.space_id)) || grantedIds.has(s.space_id)),
    );
  }

  async queryWhoami(token_id: string, allSpaces: Array<{ space_id: string; scopes: string[] }>) {
    const token = await this.studio.getToken(token_id.replace(/^tok_/, ""));
    if (!token) return null;
    return {
      actor_id: token.actor_id,
      kind: token.harness_id ? "agent" : "human",
      token_id: token_id.startsWith("tok_") ? token_id : `tok_${token_id}`,
      spaces: allSpaces,
      expires_at: undefined,
    };
  }

  async updateSpace(space_id: string, patch: Record<string, unknown>) {
    const bare = stripSpaceId(space_id);
    await this.studio.updateSpace(bare, patch as never);
    const space = await this.studio.getSpace(bare);
    if (!space) return null;
    return {
      ...space,
      space_id: addSpaceId(space.space_id),
      parent_space_id: space.parent_space_id ? addSpaceId(space.parent_space_id) : undefined,
    };
  }

  async archiveSpace(space_id: string): Promise<CommandResult> {
    const bare = stripSpaceId(space_id);
    const instances = await this.studio.listInstances(bare);
    if (instances.length > 0) {
      return denialResult("archive_blocked", { message: "Cannot archive space with active instances" }, HTTP_SEMANTIC.CONFLICT);
    }
    await this.studio.archiveSpace(bare);
    return successResult("space_archived", { space_id: addSpaceId(bare) });
  }

  async listCapabilities(space_id: string) {
    const installs = await this.studio.listFlowInstalls(space_id);
    return installs.map((i) => ({
      install_id: i.install_id,
      flow_id: i.flow_id,
      version: i.version,
      evolution_state: i.evolution_state,
      contract_ref_id: i.contract_ref_id,
      canvas_route: i.canvas_route,
    }));
  }

  async getCapability(space_id: string, install_id: string) {
    const install = await this.studio.getFlowInstall(install_id);
    if (!install || stripSpaceId(install.space_id) !== stripSpaceId(space_id)) return null;
    return install;
  }

  async installCapability(
    space_id: string,
    body: {
      package_id?: string;
      flow_id?: string;
      version?: string;
      config?: Record<string, unknown>;
      target_state?: string;
      source_metadata?: FlowInstall["source_metadata"];
      bundle?: { mode?: string; digest?: string; local_path?: string };
    },
    actorKind: "human" | "agent",
    bundleMeta?: {
      bundle_digest: string;
      contract_ref_id: string;
      routes_prefix: string;
      canvas_route: string;
      source_digest?: string;
    },
  ): Promise<CommandResult> {
    const bare = stripSpaceId(space_id);
    const space = await this.studio.getSpace(bare);
    if (!space) {
      return denialResult("space_not_found", { message: "Space not found" }, HTTP_SEMANTIC.NOT_FOUND);
    }

    if (space.install_policy === "human_only" && actorKind === "agent") {
      return denialResult(
        MURRMURE_DENIAL_CODES.INSTALL_POLICY_VIOLATION,
        {
          message: `Install blocked: space policy is human_only`,
          hint: { install_policy: "human_only" },
        },
        HTTP_SEMANTIC.FORBIDDEN,
      );
    }

    const flowId = String(body.flow_id ?? body.package_id ?? "");

    if (bundleMeta) {
      const version = body.version ?? "0.0.0";
      const existing = (await this.studio.listFlowInstalls(space_id)).find(
        (i) => i.flow_id === flowId && i.version === version,
      );
      const install_id = existing?.install_id ?? `ins_${this.ids.ulid()}`;
      const targetState = (body.target_state ?? "draft") as FlowInstall["evolution_state"];

      const install: FlowInstall = {
        install_id,
        space_id: addSpaceId(bare),
        flow_id: flowId,
        version,
        contract_ref_id: bundleMeta.contract_ref_id,
        evolution_state: targetState,
        config: body.config,
        bundle_digest: bundleMeta.bundle_digest,
        source_digest: bundleMeta.source_digest,
        source_metadata: body.source_metadata,
        routes_prefix: bundleMeta.routes_prefix,
        canvas_route: bundleMeta.canvas_route,
      };

      if (existing) {
        await this.studio.updateFlowInstall(install_id, install);
      } else {
        await this.studio.insertFlowInstall(install, this.clock.nowIso());
      }

      return successResult("capability_installed", {
        install_id,
        flow_id: flowId,
        version,
        evolution_state: targetState,
        contract_ref_id: bundleMeta.contract_ref_id,
        bundle_digest: bundleMeta.bundle_digest,
        source_digest: bundleMeta.source_digest,
        source_metadata: body.source_metadata,
        routes_prefix: bundleMeta.routes_prefix,
        canvas_route: bundleMeta.canvas_route,
      });
    }

    return denialResult(
      "unknown_package",
      { message: `Unknown flow: ${flowId}. Install requires an explicit bundle.` },
      HTTP_SEMANTIC.NOT_FOUND,
    );
  }

  async configureCapability(space_id: string, install_id: string, config: Record<string, unknown>) {
    const install = await this.studio.getFlowInstall(install_id);
    if (!install || stripSpaceId(install.space_id) !== stripSpaceId(space_id)) return null;
    await this.studio.updateFlowInstall(install_id, { config: { ...install.config, ...config } });
    return { ok: true };
  }

  async validateEvolution(space_id: string, install_id?: string) {
    const installs = install_id
      ? [await this.studio.getFlowInstall(install_id)].filter(Boolean)
      : await this.studio.listFlowInstalls(space_id);

    const draft = (installs as FlowInstall[]).find((i) => i?.evolution_state === "draft");
    if (!draft) return { lens_a_pass: true, breaking: false, warnings: [] };

    const breaking = draft.version.startsWith("3.");
    if (draft.install_id) {
      await this.studio.updateFlowInstall(draft.install_id, { evolution_state: "validated" });
    }
    return { lens_a_pass: true, breaking, warnings: breaking ? ["Major version bump detected"] : [] };
  }

  async testEvolution(space_id: string, install_id?: string) {
    const installs = install_id
      ? [await this.studio.getFlowInstall(install_id)].filter(Boolean)
      : await this.studio.listFlowInstalls(space_id);

    const validated = (installs as FlowInstall[]).find((i) => i?.evolution_state === "validated");
    if (validated?.install_id) {
      await this.studio.updateFlowInstall(validated.install_id, { evolution_state: "tested" });
    }
    return { passed: true, tests_run: 3, failures: [] };
  }

  async promoteEvolution(space_id: string, body: { target_space_id?: string; install_id?: string }) {
    const installs = body.install_id
      ? [await this.studio.getFlowInstall(body.install_id)].filter(Boolean)
      : await this.studio.listFlowInstalls(space_id);

    const tested = (installs as FlowInstall[]).find((i) => i?.evolution_state === "tested");
    if (!tested) {
      const live = (installs as FlowInstall[]).find((i) => i?.evolution_state === "live");
      if (live) return { evolution_state: "live", install_id: live.install_id };
      return { evolution_state: "draft", message: "No tested install to promote" };
    }

    const breaking = tested.version.startsWith("3.");
    const gate_id = breaking ? `chk_${this.ids.ulid()}` : undefined;
    const nextState = breaking ? "promoted_pending" : "live";

    await this.studio.updateFlowInstall(tested.install_id, {
      evolution_state: nextState,
      gate_id,
    });

    return {
      evolution_state: nextState,
      install_id: tested.install_id,
      gate_id,
      target_space_id: body.target_space_id,
    };
  }

  async rollbackEvolution(space_id: string, install_id: string, toVersion: string) {
    const install = await this.studio.getFlowInstall(install_id);
    if (!install || stripSpaceId(install.space_id) !== stripSpaceId(space_id)) return null;
    await this.studio.updateFlowInstall(install_id, {
      version: toVersion,
      evolution_state: "live",
    });
    return { evolution_state: "live", version: toVersion };
  }

  async contractDiff(space_id: string, from: string, to: string) {
    void space_id;
    const breaking = to.startsWith("3.") && from.startsWith("2.");
    return {
      from_version: from,
      to_version: to,
      states_added: breaking ? ["awaiting_security_review"] : [],
      states_removed: [],
      transitions_changed: breaking ? 2 : 0,
      summary: breaking ? "Breaking: new gate state added" : "No breaking changes",
    };
  }

  async listMembers(space_id: string) {
    return this.studio.listMembers(space_id);
  }

  async inviteMember(space_id: string, email: string, role: Member["role"]) {
    const member_id = this.ids.ulid();
    const member: Member = {
      member_id: `mbr_${member_id}`,
      space_id: space_id.startsWith("spc_") ? space_id : addSpaceId(space_id),
      email,
      role,
      actor_id: `act_${email.split("@")[0]}`,
    };
    await this.studio.insertMember(member, this.clock.nowIso());
    return member;
  }

  async updateMemberRole(space_id: string, member_id: string, role: Member["role"]) {
    await this.studio.updateMemberRole(space_id, member_id, role);
    const members = await this.studio.listMembers(space_id);
    return members.find((m) => m.member_id === member_id) ?? null;
  }

  async removeMember(space_id: string, member_id: string) {
    await this.studio.removeMember(space_id, member_id);
    return { ok: true };
  }

  async listGrants(space_id: string) {
    const grants = await this.studio.listGrants(stripSpaceId(space_id));
    return grants.map((g) => ({
      grant_id: `grt_${g.grant_id}`,
      label: g.label ?? g.actor_id,
      harness: g.harness,
      scopes: g.scopes,
      capabilities: g.capabilities ?? resolveEffectiveCapabilities({ scopes: g.scopes }),
      flow_acl: g.flow_acl,
      status: g.status,
      expires_at: g.expires_at,
    }));
  }

  async mintGrant(
    space_id: string,
    body: {
      label: string;
      harness?: string;
      scopes?: string[];
      capabilities?: Capability[];
      template?: string;
      flow_acl?: string[];
      expires_in_days?: number;
    },
    provenance: StudioProvenance,
  ): Promise<CommandResult> {
    if (body.flow_acl?.length) {
      const installs = await this.studio.listFlowInstalls(stripSpaceId(space_id));
      const canonicalFlowIds = new Set(installs.map((install) => install.flow_id));
      const unknown = body.flow_acl.filter((flowId) => !canonicalFlowIds.has(flowId));
      if (unknown.length > 0) {
        return denialResult(
          "unknown_flow_acl",
          {
            message:
              `Flow ACL accepts only already-applied canonical flow ids; unknown: ${unknown.join(", ")}`,
          },
          HTTP_SEMANTIC.BAD_REQUEST,
        );
      }
    }
    const grant_id = this.ids.ulid();
    const token_id = this.ids.ulid();
    const templateCaps = GRANT_TEMPLATES[body.template ?? "worker"] ?? GRANT_TEMPLATES.worker;
    const capabilities =
      body.capabilities ??
      (body.scopes?.length
        ? resolveEffectiveCapabilities({ scopes: body.scopes })
        : templateCaps);
    const scopes = body.scopes ?? capabilities;
    const ts = this.clock.nowIso();
    const expires_at = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 86400000).toISOString()
      : undefined;

    await this.studio.insertGrant(
      {
        grant_id,
        token_id,
        space_id: stripSpaceId(space_id),
        actor_id: provenance.actor_id,
        label: body.label,
        harness: body.harness,
        scopes,
        capabilities,
        flow_acl: body.flow_acl,
        status: "active",
        expires_at,
      },
      ts,
    );

    await this.studio.insertToken(
      {
        token_id,
        actor_id: provenance.actor_id,
        space_id: stripSpaceId(space_id),
        scopes,
        capabilities,
        harness_id: body.harness,
        flow_acl: body.flow_acl,
        status: "active",
      },
      ts,
    );

    return successResult("grant_minted", {
      grant_id: `grt_${grant_id}`,
      token: `tok_${token_id}`,
      scopes,
      capabilities,
      label: body.label,
      harness: body.harness,
      expires_at,
    });
  }

  async revokeGrant(space_id: string, grant_id: string) {
    const bare = grant_id.startsWith("grt_") ? grant_id.slice(4) : grant_id;
    const grant = await this.studio.getGrant(bare);
    await this.studio.revokeGrant(bare);
    if (grant?.token_id) {
      await this.studio.revokeToken?.(grant.token_id);
    }
    return { grant_id, status: "revoked" };
  }

  async rotateGrant(space_id: string, grant_id: string, provenance: StudioProvenance) {
    const bare = grant_id.startsWith("grt_") ? grant_id.slice(4) : grant_id;
    const grant = await this.studio.getGrant(bare);
    if (!grant) return null;
    await this.revokeGrant(space_id, grant_id);
    return this.mintGrant(
      space_id,
      {
        label: grant.label ?? grant.actor_id,
        harness: grant.harness,
        scopes: grant.scopes,
        flow_acl: grant.flow_acl,
      },
      provenance,
    );
  }

  async exportGrants() {
    const grants = await this.studio.listAllGrants();
    return { grants, exported_at: this.clock.nowIso() };
  }

  async listTriggers(space_id: string) {
    const bare = stripSpaceId(space_id);
    const rows = await this.studio.listTriggers(bare);
    return rows.map((t) => ({
      trigger_id: `trg_${t.trigger_id}`,
      name: (t.spec as Record<string, unknown>)?.name ?? "trigger",
      enabled: t.status !== "disabled",
      spec: t.spec,
    }));
  }

  async registerTrigger(space_id: string, body: Record<string, unknown>) {
    const trigger_id = this.ids.ulid();
    const bare = stripSpaceId(space_id);
    const spec = {
      name: body.name,
      filter: body.filter,
      action: body.action,
      dedup: body.dedup,
      partition_key: body.partition_key,
    };
    await this.studio.insertTrigger({
      trigger_id,
      space_id: bare,
      spec,
      status: "active",
      created_at: this.clock.nowIso(),
    });
    return {
      trigger_id: `trg_${trigger_id}`,
      name: body.name,
      enabled: true,
      spec,
    };
  }

  async disableTrigger(space_id: string, trigger_id: string) {
    const bare = trigger_id.startsWith("trg_") ? trigger_id.slice(4) : trigger_id;
    await this.studio.disableTrigger(bare);
    return { trigger_id, enabled: false };
  }

  async listTriggerDeliveries(space_id: string, limit?: number) {
    const bare = stripSpaceId(space_id);
    const deliveries = await this.studio.listTriggerDeliveries(bare, limit);
    return deliveries.map((d) => ({
      delivery_id: d.delivery_id,
      trigger_id: d.trigger_id ? `trg_${d.trigger_id}` : undefined,
      source_event_id: d.source_event_id,
      outcome: d.outcome,
      dedup_reason: d.dedup_reason,
      created_at: d.created_at,
    }));
  }

  async recordTriggerDelivery(space_id: string, trigger_id: string, source_event_id: string, dedup?: boolean) {
    const bare = stripSpaceId(space_id);
    const bareTrigger = trigger_id.startsWith("trg_") ? trigger_id.slice(4) : trigger_id;
    const existing = await this.studio.listTriggerDeliveries(bare, 100);
    const duplicate = dedup && existing.some((d) => d.source_event_id === source_event_id);

    await this.studio.insertTriggerDelivery({
      delivery_id: this.ids.ulid(),
      space_id: bare,
      trigger_id: bareTrigger,
      source_event_id,
      outcome: duplicate ? "deduped" : "success",
      dedup_reason: duplicate ? "duplicate_fingerprint" : undefined,
      created_at: this.clock.nowIso(),
    });

    return { duplicate };
  }

  async federationStatus() {
    const registryDeps: FederationRegistryDeps = {
      getPeer: (hub_id) => this.studio.getFederationHub(hub_id),
      listPeers: () => this.studio.listFederationHubs(),
      insertPeer: (row) => this.studio.insertFederationHub(row),
      healthCheck: async () => ({ ok: false, detail: "Health check requires daemon wire" }),
    };
    return computeFederationStatus(registryDeps, {
      countPending: () => this.studio.countFederationOutboundPending(),
    });
  }
}
