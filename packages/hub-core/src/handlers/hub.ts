import type { CommandResult, Provenance } from "@murrmure/runtime-contracts";
import { successResult, denialResult, HTTP_SEMANTIC } from "@murrmure/runtime-contracts";
import { matchesWaitCondition } from "@murrmure/runtime-kernel";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type {
  EventAppendCommand,
  GateResolveCommand,
  InstanceCreateCommand,
  SpaceCreateCommand,
  StateTransitionCommand,
  StudioProvenance,
  WaitCancelCommand,
  WaitRegisterCommand,
  WaitPollResult,
  GrantMintCommand,
  GrantRevokeCommand,
  QueryAskCommand,
  QueryAnswerCommand,
  FederationEmitCommand,
  TriggerRegisterCommand,
  TriggerScheduleCommand,
  BlobWriteCommand,
  InstanceMetadataPatchCommand,
} from "@murrmure/contracts";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { deriveJournalSubject } from "@murrmure/contracts";
import type { HubKernel } from "../kernel.js";
import { mapKernelResult, scopeEnforcementDenial } from "../bridge/errors.js";
import { mapWaitCondition } from "../bridge/wait-condition.js";
import {
  addGateId,
  addInstanceId,
  addSpaceId,
  stripInstanceId,
  stripSpaceId,
  stripTokenId,
  stripPrefix,
} from "../bridge/ids.js";
import { buildSpaceJournalEnvelope, validateJournalInlinePayload } from "../journal/append.js";
import { journalEntryToHubEvent } from "../bridge/journal.js";
import { enforceSpacePath } from "../ports/policy.js";
import { resolveGate } from "../gates/service.js";
import { resolveEffectiveCapabilities, hasCapability } from "../grants/migrate.js";
import { ConfigHandler } from "./config.js";

export type StudioCommand =
  | SpaceCreateCommand
  | InstanceCreateCommand
  | StateTransitionCommand
  | GateResolveCommand
  | EventAppendCommand
  | WaitRegisterCommand
  | WaitCancelCommand
  | GrantMintCommand
  | GrantRevokeCommand
  | QueryAskCommand
  | QueryAnswerCommand
  | FederationEmitCommand
  | TriggerRegisterCommand
  | TriggerScheduleCommand
  | BlobWriteCommand
  | InstanceMetadataPatchCommand;

export class HubHandler {
  private lastWaitId?: string;
  readonly config: ConfigHandler;

  constructor(
    private readonly kernel: HubKernel,
    private readonly studio: StudioPersistencePort,
    private readonly ids: { ulid: () => string },
    private readonly clock: { nowIso: () => string },
  ) {
    this.config = new ConfigHandler(studio, ids, clock);
  }

  async execute(command: StudioCommand): Promise<CommandResult> {
    const pathCheck = await enforceSpacePath(
      this.studio,
      command.provenance.space_id,
      command.provenance.token_id,
    );
    if (!pathCheck.allowed) {
      return scopeEnforcementDenial();
    }

    switch (command.kind) {
      case "space.create":
        return this.handleSpaceCreate(command);
      case "instance.create":
        return this.handleInstanceCreate(command);
      case "state.transition":
        return this.handleStateTransition(command);
      case "gate.resolve":
        return this.handleGateResolve(command);
      case "event.append":
        return this.handleEventAppend(command);
      case "wait.register":
        return this.handleWaitRegister(command);
      case "wait.cancel":
        return this.handleWaitCancel(command);
      case "grant.mint":
        return this.handleGrantMint(command);
      case "grant.revoke":
        return this.handleGrantRevoke(command);
      case "query.ask":
        return this.handleQueryAsk(command);
      case "query.answer":
        return this.handleQueryAnswer(command);
      case "federation.emit":
        return this.handleFederationEmit(command);
      case "trigger.register":
        return this.handleTriggerRegister(command);
      case "trigger.schedule":
        return this.handleTriggerSchedule(command);
      case "blob.write":
        return this.handleBlobWrite(command);
      case "instance.metadata.patch":
        return this.handleInstanceMetadataPatch(command);
      default:
        return denialResult("unknown_command", { message: "Unknown command" }, HTTP_SEMANTIC.FORBIDDEN);
    }
  }

  async query(kind: string, params: Record<string, unknown>): Promise<unknown> {
    switch (kind) {
      case "wait.poll":
        return this.handleWaitPoll(params as { space_id: string; wait_id: string });
      case "instance.get":
        return this.handleInstanceGet(params as { space_id: string; instance_id: string });
      case "aggregate.get":
        return this.handleAggregateGet(params as { instance_id: string });
      case "gate.list":
        return this.handleGateList(params as { space_id: string; instance_id?: string });
      case "event.tail":
        return this.handleEventTail(params as { space_id: string; from_seq?: number; limit?: number });
      case "grant.list":
        return this.handleGrantList(params as { space_id: string });
      case "auth.whoami":
        return this.handleAuthWhoami(params as { space_id: string; token_id: string });
      case "space.get":
        return this.handleSpaceGet(params as { space_id: string });
      case "instance.list":
        return this.handleInstanceList(params as { space_id: string });
      case "audit.export":
        return this.handleAuditExport(
          params as {
            space_id: string;
            from_seq?: number;
            limit?: number;
            filter?: { instance_id?: string; event_type?: string };
          },
        );
      case "space.list":
        return this.config.querySpaceList((params.spaces as Array<{ space_id: string; scopes: string[] }>) ?? []);
      case "capability.list":
        return this.config.listCapabilities(params.space_id as string);
      case "capability.get":
        return this.config.getCapability(params.space_id as string, params.install_id as string);
      case "member.list":
        return this.config.listMembers(params.space_id as string);
      case "projection.grants":
        return this.config.listGrants(params.space_id as string);
      case "trigger.list":
        return this.config.listTriggers(params.space_id as string);
      case "trigger.delivery.log":
        return this.config.listTriggerDeliveries(params.space_id as string, params.limit as number | undefined);
      case "contract.diff.get":
        return this.config.contractDiff(
          params.space_id as string,
          params.from as string,
          params.to as string,
        );
      case "grants.export":
        return this.config.exportGrants();
      case "federation.status":
        return this.config.federationStatus();
      default:
        return { error: "unknown_query" };
    }
  }

  getLastWaitId(): string | undefined {
    return this.lastWaitId;
  }

  /** Direct space journal persistence for invoke lifecycle (bypasses instance_id + path token gate). */
  async appendSpaceJournal(input: {
    space_id: string;
    type: string;
    actor_id: string;
    token_id: string;
    session_id?: string;
    run_id?: string;
    data: Record<string, unknown>;
  }): Promise<{ seq: number; entry_id: string }> {
    const bare = stripSpaceId(input.space_id);
    const eventId = `evt_${this.ids.ulid()}`;
    const ts = this.clock.nowIso();
    const payload = buildSpaceJournalEnvelope({
      space_id: input.space_id,
      type: input.type,
      actor_id: input.actor_id,
      session_id: input.session_id,
      run_id: input.run_id,
      data: input.data,
      eventId,
      ts,
    });
    validateJournalInlinePayload(payload);

    const result = await this.kernel.appendSpaceJournal({
      scope_id: bare,
      type: input.type,
      payload,
      actor_id: input.actor_id,
      credential_id: stripTokenId(input.token_id),
    });

    const sessionBare = input.session_id ? stripPrefix(input.session_id) : undefined;
    const runBare = input.run_id ? stripPrefix(input.run_id) : undefined;
    const subject =
      typeof payload.subject === "string"
        ? payload.subject
        : deriveJournalSubject({ session_id: input.session_id, run_id: input.run_id });

    await this.studio.insertJournalIndex({
      entry_id: eventId,
      seq: result.seq,
      space_id: bare,
      type: input.type,
      subject,
      session_id: sessionBare,
      run_id: runBare,
      actor_id: input.actor_id,
      time: ts,
      payload_json: JSON.stringify(payload),
    });

    return result;
  }

  private toProvenance(p: StudioProvenance, instance_id?: string): Provenance {
    return {
      scope_id: stripSpaceId(p.space_id),
      actor_id: p.actor_id,
      credential_id: stripTokenId(p.token_id),
      aggregate_id: instance_id ? stripInstanceId(instance_id) : p.instance_id ? stripInstanceId(p.instance_id) : undefined,
      command_id: p.command_id,
      actor_kind: p.actor_id.includes("maya") || p.actor_id.includes("human") ? "human" : "agent",
    };
  }

  private async handleSpaceCreate(cmd: SpaceCreateCommand): Promise<CommandResult> {
    return this.config.handleSpaceCreate({
      slug: cmd.slug,
      name: (cmd as SpaceCreateCommand & { name?: string }).name,
      parent_space_id: cmd.parent_space_id,
      install_policy: (cmd as SpaceCreateCommand & { install_policy?: string }).install_policy,
      preview_policy: (cmd as SpaceCreateCommand & { preview_policy?: string }).preview_policy,
      description: (cmd as SpaceCreateCommand & { description?: string }).description,
    });
  }

  private async handleInstanceCreate(cmd: InstanceCreateCommand): Promise<CommandResult> {
    const cref = await this.studio.getContractRef(cmd.contract_ref_id);
    if (!cref) {
      return denialResult(MURRMURE_DENIAL_CODES.CONTRACT_VALIDATION_DENIED, { message: "Unknown contract ref" }, HTTP_SEMANTIC.FORBIDDEN);
    }

    const p = this.toProvenance(cmd.provenance);
    const result = await this.kernel.execute({
      kind: "aggregate.create",
      provenance: p,
      rule_ref: { rule_ref_id: cmd.contract_ref_id, digest: cref.digest, version: cref.semver },
      metadata: cmd.metadata,
    });

    if (result.outcome === "success") {
      const bareInstanceId = result.body.aggregate_id as string;
      const ts = this.clock.nowIso();
      await this.studio.insertInstance(
        {
          instance_id: bareInstanceId,
          space_id: stripSpaceId(cmd.provenance.space_id),
          contract_ref_id: cmd.contract_ref_id,
          state: result.body.state as string,
          revision: result.body.revision as number,
          metadata: cmd.metadata ?? {},
        },
        ts,
      );
      return mapKernelResult({
        ...result,
        body: { ...result.body, instance_id: addInstanceId(bareInstanceId) },
      });
    }

    return mapKernelResult(result);
  }

  private async handleStateTransition(cmd: StateTransitionCommand): Promise<CommandResult> {
    if (!cmd.provenance.instance_id) {
      return denialResult("missing_instance", { message: "instance_id required" }, 400);
    }

    const p = this.toProvenance(cmd.provenance, cmd.provenance.instance_id);
    const result = await this.kernel.execute({
      kind: "state.transition",
      provenance: p,
      aggregate_id: stripInstanceId(cmd.provenance.instance_id),
      event: cmd.event,
      payload: cmd.payload,
      expected_revision: cmd.expected_revision,
    });

    if (result.outcome === "success" && result.body.state) {
      await this.studio.updateInstanceState(
        stripInstanceId(cmd.provenance.instance_id),
        result.body.state as string,
        result.body.revision as number,
      );
    }

    if (result.body.checkpoint_id) {
      result.body.gate_id = addGateId(result.body.checkpoint_id as string);
    }

    return mapKernelResult(result);
  }

  private async handleGateResolve(cmd: GateResolveCommand): Promise<CommandResult> {
    // Gate resolution is owned by the orchestration gate service (gates/service),
    // the same path used by POST /v1/gates/:gate_id/resolve. The legacy kernel
    // checkpoint resolve bridge has been removed; gate state lives in the gates
    // table, not the kernel checkpoint mini-FSM.
    const token = await this.studio.getToken(stripTokenId(cmd.provenance.token_id));
    const effective = token
      ? resolveEffectiveCapabilities({ scopes: token.scopes, capabilities: token.capabilities })
      : [];

    const result = await resolveGate(
      {
        studio: this.studio,
        handler: this,
        ids: this.ids,
        clock: this.clock,
      },
      {
        gate_id: cmd.gate_id,
        actor_id: cmd.provenance.actor_id,
        token_id: cmd.provenance.token_id,
        space_id: cmd.provenance.space_id,
        decision: cmd.decision,
        resume_data: cmd.resume_data,
        can_resolve: hasCapability(effective, "flow:run"),
        capabilities: effective,
      },
    );

    if (result.error) {
      const code = result.error.code;
      const http =
        code === "gate_not_found"
          ? HTTP_SEMANTIC.NOT_FOUND
          : code === "SCOPE_ENFORCEMENT_FAILURE"
            ? HTTP_SEMANTIC.FORBIDDEN
            : HTTP_SEMANTIC.CONFLICT;
      return denialResult(code, { message: result.error.message }, http);
    }

    return successResult("gate_resolved", { gate: result.gate });
  }

  private async handleEventAppend(cmd: EventAppendCommand): Promise<CommandResult> {
    if (!cmd.provenance.instance_id) {
      return denialResult("missing_instance", {}, 400);
    }
    const p = this.toProvenance(cmd.provenance, cmd.provenance.instance_id);
    const result = await this.kernel.execute({
      kind: "event.append",
      provenance: p,
      aggregate_id: stripInstanceId(cmd.provenance.instance_id),
      event_type: cmd.event_type,
      payload: cmd.payload,
    });
    return mapKernelResult(result);
  }

  private async handleWaitRegister(cmd: WaitRegisterCommand): Promise<CommandResult> {
    const p = this.toProvenance(cmd.provenance, cmd.provenance.instance_id);
    const result = await this.kernel.execute({
      kind: "wait.register",
      provenance: p,
      condition: mapWaitCondition(cmd.condition),
      delivery_mode: "in_process",
      bound_command_id: cmd.bound_command_id,
      aggregate_id: cmd.provenance.instance_id ? stripInstanceId(cmd.provenance.instance_id) : undefined,
    });
    if (result.outcome === "success") {
      this.lastWaitId = result.body.wait_id as string;
    }
    return mapKernelResult(result);
  }

  private async handleWaitCancel(cmd: WaitCancelCommand): Promise<CommandResult> {
    const p = this.toProvenance(cmd.provenance);
    const result = await this.kernel.execute({
      kind: "wait.cancel",
      provenance: p,
      wait_id: cmd.wait_id,
    });
    return mapKernelResult(result);
  }

  private async handleWaitPoll(params: { space_id: string; wait_id: string }): Promise<WaitPollResult> {
    const wait = await this.kernel.getWait(params.wait_id);
    if (!wait) {
      return { status: "denied", wait_id: params.wait_id };
    }
    if (wait.status === "resolved") return { status: "matched", wait_id: params.wait_id };
    if (wait.status === "cancelled") return { status: "cancelled", wait_id: params.wait_id };
    if (wait.status === "timed_out") return { status: "timed_out", wait_id: params.wait_id };

    const entries = await this.kernel.tailJournal(0);
    for (const entry of entries) {
      if (matchesWaitCondition(wait.condition, entry).matched) {
        return { status: "matched", wait_id: params.wait_id, entry: entry as unknown as Record<string, unknown> };
      }
    }

    return { status: "pending", wait_id: params.wait_id };
  }

  private async handleInstanceGet(params: { space_id: string; instance_id: string }) {
    const inst = await this.studio.getInstance(stripInstanceId(params.instance_id));
    if (!inst) return null;
    return {
      ...inst,
      instance_id: addInstanceId(inst.instance_id),
      space_id: addSpaceId(inst.space_id),
    };
  }

  private async handleAggregateGet(params: { instance_id: string }) {
    const aggregate = await this.kernel.getAggregate(stripInstanceId(params.instance_id));
    if (!aggregate) return null;
    return {
      aggregate_id: addInstanceId(aggregate.aggregate_id),
      state: aggregate.state,
      revision: aggregate.revision,
      metadata: aggregate.metadata,
    };
  }

  private async handleGateList(params: { space_id: string; instance_id?: string }) {
    const scope = stripSpaceId(params.space_id);

    if (params.instance_id) {
      const agg = stripInstanceId(params.instance_id);
      const state = await this.kernel.getProjection("gate_queue", scope, agg);
      const pending = (state?.pending as Array<Record<string, string>>) ?? [];
      return pending.map((g) => ({
        gate_id: addGateId(g.gate_id),
        instance_id: addInstanceId(g.instance_id),
        transition_id: g.transition_id,
        status: g.status,
      }));
    }

    const instances = await this.studio.listInstances(scope);
    const allPending: Array<Record<string, string>> = [];
    for (const inst of instances) {
      const state = await this.kernel.getProjection("gate_queue", scope, inst.instance_id);
      const pending = (state?.pending as Array<Record<string, string>>) ?? [];
      allPending.push(...pending);
    }
    return allPending.map((g) => ({
      gate_id: addGateId(g.gate_id),
      instance_id: addInstanceId(g.instance_id),
      transition_id: g.transition_id,
      status: g.status,
    }));
  }

  private async handleEventTail(params: { space_id: string; from_seq?: number; limit?: number }) {
    const scope = stripSpaceId(params.space_id);
    const entries = await this.kernel.tailJournal(params.from_seq ?? 0, params.limit);
    const scoped = entries.filter((e) => e.scope_id === scope);
    const events = [];
    for (const e of scoped) {
      const space_seq = await this.studio.allocateSpaceSeq(scope);
      const instance_seq = e.aggregate_id
        ? await this.studio.allocateInstanceSeq(e.aggregate_id)
        : undefined;
      events.push(journalEntryToHubEvent(e, space_seq, instance_seq));
    }
    return events;
  }

  private async handleGrantMint(cmd: GrantMintCommand): Promise<CommandResult> {
    const grant_id = this.ids.ulid();
    const ts = this.clock.nowIso();
    await this.studio.insertGrant(
      {
        grant_id,
        space_id: stripSpaceId(cmd.provenance.space_id),
        actor_id: cmd.actor_id,
        scopes: cmd.scopes,
        status: "active",
      },
      ts,
    );
    return successResult("grant_minted", { grant_id: `grt_${grant_id}` });
  }

  private async handleGrantRevoke(cmd: GrantRevokeCommand): Promise<CommandResult> {
    const bare = cmd.grant_id.startsWith("grt_") ? cmd.grant_id.slice(4) : cmd.grant_id;
    await this.studio.revokeGrant(bare);
    return successResult("grant_revoked", { grant_id: cmd.grant_id });
  }

  private async handleGrantList(params: { space_id: string }) {
    const grants = await this.studio.listGrants(stripSpaceId(params.space_id));
    return grants.map((g) => ({
      ...g,
      grant_id: `grt_${g.grant_id}`,
      space_id: addSpaceId(g.space_id),
    }));
  }

  private async handleAuthWhoami(params: { space_id: string; token_id: string }) {
    const token = await this.studio.getToken(stripTokenId(params.token_id));
    if (!token) return null;
    const spaces =
      token.space_id === "bootstrap"
        ? (await this.studio.listSpaces()).map((s) => ({
            space_id: addSpaceId(s.space_id),
            scopes: token.scopes,
          }))
        : [{ space_id: addSpaceId(token.space_id), scopes: token.scopes }];
    return this.config.queryWhoami(params.token_id, spaces);
  }

  private async handleSpaceGet(params: { space_id: string }) {
    const space = await this.studio.getSpace(stripSpaceId(params.space_id));
    if (!space) return null;
    return {
      ...space,
      space_id: addSpaceId(space.space_id),
      parent_space_id: space.parent_space_id ? addSpaceId(space.parent_space_id) : undefined,
    };
  }

  private async handleQueryAsk(cmd: QueryAskCommand): Promise<CommandResult> {
    const ts = this.clock.nowIso();
    await this.studio.insertQuery({
      query_id: cmd.query_id,
      space_id: stripSpaceId(cmd.provenance.space_id),
      asker_actor_id: cmd.provenance.actor_id,
      schema: cmd.schema,
      ask_payload: cmd.payload,
      status: "pending",
      created_at: ts,
    });
    return successResult("query_asked", { query_id: cmd.query_id });
  }

  private async handleQueryAnswer(cmd: QueryAnswerCommand): Promise<CommandResult> {
    const query = await this.studio.getQuery(cmd.query_id);
    if (!query) {
      return denialResult(MURRMURE_DENIAL_CODES.QUERY_FAILED, { reason: "NOT_FOUND" }, HTTP_SEMANTIC.NOT_FOUND);
    }
    const schemaRaw = (query.schema_json ?? query.schema) as string | Record<string, unknown>;
    const schema =
      typeof schemaRaw === "string" ? (JSON.parse(schemaRaw) as Record<string, unknown>) : schemaRaw;
    const required = (schema.required as string[]) ?? [];
    for (const field of required) {
      if (!(field in cmd.payload)) {
        return denialResult(MURRMURE_DENIAL_CODES.QUERY_FAILED, { reason: "SCHEMA_MISMATCH", field }, HTTP_SEMANTIC.CONFLICT);
      }
    }
    await this.studio.answerQuery(cmd.query_id, cmd.payload);
    return successResult("query_answered", { query_id: cmd.query_id });
  }

  private async handleFederationEmit(cmd: FederationEmitCommand): Promise<CommandResult> {
    const hub = await this.studio.getFederationHub(cmd.target_hub_id);
    if (!hub) {
      return denialResult(MURRMURE_DENIAL_CODES.FEDERATION_DENIED, { message: "Unknown hub" }, HTTP_SEMANTIC.FORBIDDEN);
    }
    const outbound_id = this.ids.ulid();
    await this.studio.enqueueFederationOutbound({
      outbound_id,
      target_hub_id: cmd.target_hub_id,
      payload: { event_type: cmd.event_type, payload: cmd.payload },
      status: "pending",
      created_at: this.clock.nowIso(),
    });
    return successResult("federation_enqueued", { outbound_id });
  }

  private async handleTriggerRegister(cmd: TriggerRegisterCommand): Promise<CommandResult> {
    const trigger_id = this.ids.ulid();
    const p = this.toProvenance(cmd.provenance, cmd.provenance.instance_id);
    const result = await this.kernel.execute({
      kind: "reaction.register",
      provenance: p,
      spec: cmd.spec as import("@murrmure/runtime-contracts").ReactionSpecInput,
    });
    if (result.outcome === "success") {
      await this.studio.insertTrigger({
        trigger_id,
        space_id: stripSpaceId(cmd.provenance.space_id),
        instance_id: cmd.provenance.instance_id ? stripInstanceId(cmd.provenance.instance_id) : undefined,
        spec: cmd.spec,
        created_at: this.clock.nowIso(),
      });
    }
    return mapKernelResult({ ...result, body: { ...result.body, trigger_id: `trg_${trigger_id}` } });
  }

  private async handleTriggerSchedule(cmd: TriggerScheduleCommand): Promise<CommandResult> {
    const trigger_id = this.ids.ulid();
    await this.studio.insertTrigger({
      trigger_id,
      space_id: stripSpaceId(cmd.provenance.space_id),
      spec: cmd.spec,
      cron: cmd.cron,
      created_at: this.clock.nowIso(),
    });
    return successResult("trigger_scheduled", { trigger_id: `trg_${trigger_id}`, cron: cmd.cron });
  }

  private async handleBlobWrite(cmd: BlobWriteCommand): Promise<CommandResult> {
    const blob_id = this.ids.ulid();
    const ts = this.clock.nowIso();
    await this.studio.insertBlob({
      blob_id,
      space_id: stripSpaceId(cmd.provenance.space_id),
      media_type: cmd.media_type,
      digest: "sha256:stub",
      path: `/blobs/${blob_id}`,
      created_at: ts,
    });
    return successResult("blob_written", { blob_id: `blb_${blob_id}` });
  }

  private async handleInstanceList(params: { space_id: string }) {
    const instances = await this.studio.listInstances(stripSpaceId(params.space_id));
    return instances.map((inst) => ({
      ...inst,
      instance_id: addInstanceId(inst.instance_id),
      space_id: addSpaceId(inst.space_id),
    }));
  }

  private async handleAuditExport(params: {
    space_id: string;
    from_seq?: number;
    limit?: number;
    filter?: { instance_id?: string; event_type?: string };
  }) {
    const events = await this.handleEventTail({
      space_id: params.space_id,
      from_seq: params.from_seq,
      limit: params.limit,
    });
    let filtered = events as Array<Record<string, unknown>>;
    if (params.filter?.instance_id) {
      const bare = stripInstanceId(params.filter.instance_id);
      filtered = filtered.filter((e) => e.instance_id === addInstanceId(bare) || e.instance_id === bare);
    }
    if (params.filter?.event_type) {
      filtered = filtered.filter((e) => e.type === params.filter!.event_type);
    }
    return { events: filtered, format: "jsonl" };
  }

  private mergeMetadata(
    base: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof out[key] === "object" &&
        out[key] !== null &&
        !Array.isArray(out[key])
      ) {
        out[key] = this.mergeMetadata(out[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  private async handleInstanceMetadataPatch(cmd: InstanceMetadataPatchCommand): Promise<CommandResult> {
    if (!cmd.provenance.instance_id) {
      return denialResult("missing_instance", { message: "instance_id required" }, 400);
    }

    const bareId = stripInstanceId(cmd.provenance.instance_id);
    const inst = await this.studio.getInstance(bareId);
    if (!inst) {
      return denialResult("instance_not_found", { instance_id: cmd.provenance.instance_id }, HTTP_SEMANTIC.NOT_FOUND);
    }

    if (inst.revision !== cmd.expected_revision) {
      return denialResult(
        MURRMURE_DENIAL_CODES.CONTRACT_VALIDATION_DENIED,
        { message: "revision mismatch", expected: cmd.expected_revision, actual: inst.revision },
        HTTP_SEMANTIC.CONFLICT,
      );
    }

    const nextMetadata = this.mergeMetadata(inst.metadata, cmd.patch);
    const nextRevision = inst.revision + 1;
    await this.studio.updateInstanceMetadata(bareId, nextMetadata, nextRevision);

    const p = this.toProvenance(cmd.provenance, cmd.provenance.instance_id);
    await this.kernel.execute({
      kind: "event.append",
      provenance: p,
      aggregate_id: bareId,
      event_type: "instance.metadata_patched",
      payload: { patch: cmd.patch, revision: nextRevision },
    });

    return successResult("instance_metadata_patched", {
      instance_id: addInstanceId(bareId),
      revision: nextRevision,
      metadata: nextMetadata,
    });
  }
}
