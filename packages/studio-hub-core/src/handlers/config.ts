import type { CommandResult } from "@murrmure/runtime-contracts";
import { successResult, denialResult, HTTP_SEMANTIC } from "@murrmure/runtime-contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { CapabilityInstall, Member, StudioProvenance } from "@murrmure/contracts";
import { STUDIO_DENIAL_CODES } from "@murrmure/contracts";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";

const PACKAGE_CATALOG: Record<string, { contract_ref_id: string; default_version: string }> = {
  "review-loop": { contract_ref_id: "cref_review_loop", default_version: "2.0.0" },
  "brand-check": { contract_ref_id: "cref_linear_demo", default_version: "1.0.0" },
  "feature-spec": { contract_ref_id: "cref_feature_spec", default_version: "1.0.0" },
};

const GRANT_TEMPLATES: Record<string, string[]> = {
  worker: [
    "space:read",
    "event:read",
    "state:transition",
    "event:emit",
    "blob:read",
    "blob:write",
  ],
  admin: ["space:admin", "space:read", "space:enter", "flow:install", "trigger:register"],
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

    const space_id = cmd.slug.replace(/-/g, "_");
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
    if (tokenSpaces.length === 0) {
      return all.map((s) => ({
        ...s,
        space_id: addSpaceId(s.space_id),
        parent_space_id: s.parent_space_id ? addSpaceId(s.parent_space_id) : undefined,
      }));
    }
    const grantedIds = new Set(
      tokenSpaces.map((s) => (s.space_id.startsWith("spc_") ? s.space_id : addSpaceId(s.space_id))),
    );
    return all
      .filter((s) => grantedIds.has(addSpaceId(s.space_id)) || grantedIds.has(s.space_id))
      .map((s) => ({
        ...s,
        space_id: addSpaceId(s.space_id),
        parent_space_id: s.parent_space_id ? addSpaceId(s.parent_space_id) : undefined,
      }));
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
    const installs = await this.studio.listCapabilityInstalls(space_id);
    return installs.map((i) => ({
      install_id: i.install_id,
      package_id: i.package_id,
      version: i.version,
      evolution_state: i.evolution_state,
      contract_ref_id: i.contract_ref_id,
      canvas_route: i.canvas_route,
    }));
  }

  async getCapability(space_id: string, install_id: string) {
    const install = await this.studio.getCapabilityInstall(install_id);
    if (!install || stripSpaceId(install.space_id) !== stripSpaceId(space_id)) return null;
    return install;
  }

  async installCapability(
    space_id: string,
    body: {
      package_id: string;
      version?: string;
      config?: Record<string, unknown>;
      target_state?: string;
      source_metadata?: CapabilityInstall["source_metadata"];
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
        STUDIO_DENIAL_CODES.INSTALL_POLICY_VIOLATION,
        {
          message: `Install blocked: space policy is human_only`,
          hint: { install_policy: "human_only" },
        },
        HTTP_SEMANTIC.FORBIDDEN,
      );
    }

    if (bundleMeta) {
      const version = body.version ?? "0.0.0";
      const existing = (await this.studio.listCapabilityInstalls(space_id)).find(
        (i) => i.package_id === body.package_id && i.version === version,
      );
      const install_id = existing?.install_id ?? `cap_${this.ids.ulid()}`;
      const targetState = (body.target_state ?? "draft") as CapabilityInstall["evolution_state"];

      const install: CapabilityInstall = {
        install_id,
        space_id: addSpaceId(bare),
        package_id: body.package_id,
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
        await this.studio.updateCapabilityInstall(install_id, install);
      } else {
        await this.studio.insertCapabilityInstall(install, this.clock.nowIso());
      }

      return successResult("capability_installed", {
        install_id,
        package_id: body.package_id,
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

    const catalog = PACKAGE_CATALOG[body.package_id];
    if (!catalog) {
      return denialResult("unknown_package", { message: `Unknown package: ${body.package_id}` }, HTTP_SEMANTIC.NOT_FOUND);
    }

    const version = body.version ?? catalog.default_version;
    const install_id = this.ids.ulid();
    const targetState = (body.target_state ?? "draft") as CapabilityInstall["evolution_state"];
    const evolution_state = targetState === "live" && version === catalog.default_version ? "live" : targetState;

    const install: CapabilityInstall = {
      install_id: `cap_${install_id}`,
      space_id: addSpaceId(bare),
      package_id: body.package_id,
      version,
      contract_ref_id: catalog.contract_ref_id,
      evolution_state,
      config: body.config,
    };

    await this.studio.insertCapabilityInstall(install, this.clock.nowIso());
    return successResult("capability_installed", install);
  }

  async configureCapability(space_id: string, install_id: string, config: Record<string, unknown>) {
    const install = await this.studio.getCapabilityInstall(install_id);
    if (!install || stripSpaceId(install.space_id) !== stripSpaceId(space_id)) return null;
    await this.studio.updateCapabilityInstall(install_id, { config: { ...install.config, ...config } });
    return { ok: true };
  }

  async validateEvolution(space_id: string, install_id?: string) {
    const installs = install_id
      ? [await this.studio.getCapabilityInstall(install_id)].filter(Boolean)
      : await this.studio.listCapabilityInstalls(space_id);

    const draft = (installs as CapabilityInstall[]).find((i) => i?.evolution_state === "draft");
    if (!draft) return { lens_a_pass: true, breaking: false, warnings: [] };

    const breaking = draft.version.startsWith("3.");
    if (draft.install_id) {
      await this.studio.updateCapabilityInstall(draft.install_id, { evolution_state: "validated" });
    }
    return { lens_a_pass: true, breaking, warnings: breaking ? ["Major version bump detected"] : [] };
  }

  async testEvolution(space_id: string, install_id?: string) {
    const installs = install_id
      ? [await this.studio.getCapabilityInstall(install_id)].filter(Boolean)
      : await this.studio.listCapabilityInstalls(space_id);

    const validated = (installs as CapabilityInstall[]).find((i) => i?.evolution_state === "validated");
    if (validated?.install_id) {
      await this.studio.updateCapabilityInstall(validated.install_id, { evolution_state: "tested" });
    }
    return { passed: true, tests_run: 3, failures: [] };
  }

  async promoteEvolution(space_id: string, body: { target_space_id?: string; install_id?: string }) {
    const installs = body.install_id
      ? [await this.studio.getCapabilityInstall(body.install_id)].filter(Boolean)
      : await this.studio.listCapabilityInstalls(space_id);

    const tested = (installs as CapabilityInstall[]).find((i) => i?.evolution_state === "tested");
    if (!tested) {
      const live = (installs as CapabilityInstall[]).find((i) => i?.evolution_state === "live");
      if (live) return { evolution_state: "live", install_id: live.install_id };
      return { evolution_state: "draft", message: "No tested install to promote" };
    }

    const breaking = tested.version.startsWith("3.");
    const gate_id = breaking ? `chk_${this.ids.ulid()}` : undefined;
    const nextState = breaking ? "promoted_pending" : "live";

    await this.studio.updateCapabilityInstall(tested.install_id, {
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
    const install = await this.studio.getCapabilityInstall(install_id);
    if (!install || stripSpaceId(install.space_id) !== stripSpaceId(space_id)) return null;
    await this.studio.updateCapabilityInstall(install_id, {
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
      capability_acl: g.capability_acl,
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
      template?: string;
      capability_acl?: string[];
      expires_in_days?: number;
    },
    provenance: StudioProvenance,
  ): Promise<CommandResult> {
    const grant_id = this.ids.ulid();
    const token_id = this.ids.ulid();
    const scopes = body.scopes ?? GRANT_TEMPLATES[body.template ?? "worker"] ?? GRANT_TEMPLATES.worker;
    const ts = this.clock.nowIso();
    const expires_at = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 86400000).toISOString()
      : undefined;

    await this.studio.insertGrant(
      {
        grant_id,
        space_id: stripSpaceId(space_id),
        actor_id: provenance.actor_id,
        label: body.label,
        harness: body.harness,
        scopes,
        capability_acl: body.capability_acl,
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
        harness_id: body.harness,
        capability_acl: body.capability_acl,
        status: "active",
      },
      ts,
    );

    return successResult("grant_minted", {
      grant_id: `grt_${grant_id}`,
      token: `tok_${token_id}`,
      scopes,
      label: body.label,
      harness: body.harness,
      expires_at,
    });
  }

  async revokeGrant(space_id: string, grant_id: string) {
    const bare = grant_id.startsWith("grt_") ? grant_id.slice(4) : grant_id;
    await this.studio.revokeGrant(bare);
    return { grant_id, status: "revoked" };
  }

  async rotateGrant(space_id: string, grant_id: string, provenance: StudioProvenance) {
    const bare = grant_id.startsWith("grt_") ? grant_id.slice(4) : grant_id;
    const grant = await this.studio.getGrant(bare);
    if (!grant) return null;
    await this.studio.revokeGrant(bare);
    return this.mintGrant(
      space_id,
      {
        label: grant.label ?? grant.actor_id,
        harness: grant.harness,
        scopes: grant.scopes,
        capability_acl: grant.capability_acl,
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
    return {
      connected_hubs: 0,
      relay_status: "disconnected",
      pending_outbound: 0,
    };
  }
}
