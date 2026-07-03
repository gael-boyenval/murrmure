import type {
  ReactionActionPort,
  ClockPort,
  CommandResult,
  ConditionPort,
  ConvergencePort,
  IdPort,
  InProcessWaitRegistry,
  JournalEntry,
  KernelCommand,
  NotifyPort,
  PersistencePort,
  PolicyPort,
  Provenance,
  QueryPort,
  RulesPort,
  SchemaPort,
  WaitCondition,
  WaitRow,
} from "@murrmure/runtime-contracts";
import {
  DENIAL_CODES,
  HTTP_SEMANTIC,
  denialResult,
  foldJournalToSnapshot,
  successResult,
} from "@murrmure/runtime-contracts";
import {
  addVote,
  checkpointFromTransition,
  isQuorumSatisfied,
  shouldRejectImmediately,
} from "../checkpoint/lifecycle.js";
import {
  applyTransition,
  findLegalTransitionsForActor,
  findMatchingTransition,
  transitionAppliedPayload,
} from "../executor/match.js";
import { buildDenialEntry, buildEntry, ENTRY_TYPES, resultFromEntry } from "../journal/build-entry.js";
import { dispatchFanout, type FanoutDeps } from "../fanout/dispatch.js";
import { DeferredWaitRegistry } from "../waiters/registry.js";
import type { CompoundProgress } from "../waiters/match.js";
import { auditTailHandler, type ProjectionHandler } from "../projections/dispatcher.js";
import { dedupFingerprint } from "../reactions/matcher.js";

export interface KernelDeps {
  persistence: PersistencePort;
  policy: PolicyPort;
  rules: RulesPort;
  condition: ConditionPort;
  schema: SchemaPort;
  convergence: ConvergencePort;
  notify: NotifyPort;
  action: ReactionActionPort;
  clock: ClockPort;
  ids: IdPort;
  waitRegistry?: InProcessWaitRegistry;
  projectionHandlers?: Map<string, ProjectionHandler>;
}

export class RuntimeKernel implements QueryPort {
  private readonly compoundProgress = new Map<string, CompoundProgress>();
  private readonly waitRegistry: InProcessWaitRegistry;
  private readonly projectionHandlers: Map<string, ProjectionHandler>;

  constructor(private readonly deps: KernelDeps) {
    this.waitRegistry = deps.waitRegistry ?? new DeferredWaitRegistry();
    this.projectionHandlers = deps.projectionHandlers ?? new Map([["audit_tail", auditTailHandler]]);
  }

  async execute(command: KernelCommand): Promise<CommandResult> {
    const p = this.ensureProvenance(command);
    if (p.command_id) {
      const existing = await this.deps.persistence.runInTransaction((tx) =>
        tx.getIdempotency(p.command_id!),
      );
      if (existing) {
        return { ...existing, code: DENIAL_CODES.IDEMPOTENCY_REPLAY, body: { ...existing.body, replay: true } };
      }
    }

    const policy = await this.deps.policy.evaluate({
      ...p,
      command_kind: command.kind,
      phase: "pre_load",
    });
    if (!policy.allowed) {
      return this.commitDenial(
        p,
        ENTRY_TYPES.POLICY_DENIED,
        policy.denial?.code ?? DENIAL_CODES.POLICY_DENIED,
        policy.denial?.message ?? "Policy denied",
        HTTP_SEMANTIC.FORBIDDEN,
        false,
      );
    }

    let blockWaitId: string | undefined;
    let blockPromise: Promise<import("@murrmure/runtime-contracts").WaitResolution> | undefined;
    const blockOn = "block_on" in command ? command.block_on : undefined;
    if (blockOn && p.command_id) {
      blockWaitId = await this.registerBlockWait(p, blockOn, p.command_id);
      blockPromise = this.waitRegistry.registerDeferred(blockWaitId).promise;
    }

    const maxSeqBefore = await this.deps.persistence.getMaxSeq();
    let result: CommandResult;
    switch (command.kind) {
      case "aggregate.create":
        result = await this.handleCreate(command, p);
        break;
      case "state.transition":
        result = await this.handleTransition(command, p);
        break;
      case "checkpoint.resolve":
        result = await this.handleCheckpointResolve(command, p);
        break;
      case "event.append":
        result = await this.handleEventAppend(command, p);
        break;
      case "wait.register":
        result = await this.handleWaitRegister(command, p);
        break;
      case "wait.cancel":
        result = await this.handleWaitCancel(command, p);
        break;
      case "reaction.register":
        result = await this.handleReactionRegister(command, p);
        break;
      case "reaction.disable":
        result = await this.handleReactionDisable(command, p);
        break;
      case "reaction.replay":
        result = await this.handleReactionReplay(command, p);
        break;
      default:
        result = denialResult(DENIAL_CODES.POLICY_DENIED, { message: "Unknown command" }, HTTP_SEMANTIC.FORBIDDEN);
    }

    const entries = await this.tailJournal(maxSeqBefore);
    await dispatchFanout(
      entries,
      blockWaitId,
      result.outcome === "denial",
      result.outcome === "denial" ? result : undefined,
      this.fanoutDeps(),
    );
    for (const entry of entries) {
      await this.deps.persistence.ackFanout(entry.seq);
    }

    if (blockPromise) {
      const resolution = await blockPromise;
      if (resolution.status === "denied" && resolution.denial) return resolution.denial;
      if (resolution.status === "matched" && resolution.entry) {
        return successResult("wait_matched", { wait_id: resolution.wait_id, entry_type: resolution.entry.type });
      }
    }

    return result;
  }

  async getAggregate(aggregate_id: string) {
    return this.deps.persistence.runInTransaction((tx) => tx.getSnapshot(aggregate_id));
  }

  async tailJournal(from_seq: number, limit?: number) {
    return this.deps.persistence.tailJournal(from_seq, limit);
  }

  /** Space-scoped journal append — no aggregate/instance required (rev-1 §8 invoke lifecycle). */
  async appendSpaceJournal(input: {
    scope_id: string;
    type: string;
    payload: Record<string, unknown>;
    actor_id: string;
    credential_id: string;
  }): Promise<{ seq: number; entry_id: string }> {
    const entry_id = this.deps.ids.ulid();
    const ts = this.deps.clock.nowIso();
    const p: Provenance = {
      scope_id: input.scope_id,
      actor_id: input.actor_id,
      credential_id: input.credential_id,
      actor_kind: "agent",
    };
    const draft = buildEntry(p, entry_id, ts, input.type, "success", input.payload, { kind: "event" });
    return this.deps.persistence.runInTransaction(async (tx) => {
      const alloc = await tx.appendJournal(draft);
      await tx.insertOutbox(alloc.seq);
      return { seq: alloc.seq, entry_id };
    });
  }

  async listCheckpoints(aggregate_id: string) {
    return this.deps.persistence.listCheckpoints(aggregate_id);
  }

  async getWait(wait_id: string) {
    return this.deps.persistence.runInTransaction((tx) => tx.getWait(wait_id));
  }

  async getProjection(name: string, scope_id: string, aggregate_id?: string) {
    const p = await this.deps.persistence.getProjection(name, scope_id, aggregate_id);
    return p?.state ?? null;
  }

  async rebuildProjection(name: string, from_seq = 0): Promise<void> {
    const handler = this.projectionHandlers.get(name);
    if (!handler) throw new Error(`Unknown projection: ${name}`);
    const { rebuildProjection } = await import("../projections/dispatcher.js");
    await rebuildProjection(name, handler, this.deps.persistence, from_seq);
  }

  async verifyFold(aggregate_id: string): Promise<boolean> {
    const snapshot = await this.getAggregate(aggregate_id);
    const journal = await this.tailJournal(0);
    const folded = foldJournalToSnapshot(journal, aggregate_id);
    if (!snapshot && !folded) return true;
    if (!snapshot || !folded) return false;
    return snapshot.state === folded.state && snapshot.revision === folded.revision && snapshot.status === folded.status;
  }

  private ensureProvenance(command: KernelCommand): Provenance {
    const p = command.provenance;
    return { ...p, command_id: p.command_id ?? this.deps.ids.ulid() };
  }

  private fanoutDeps(): FanoutDeps {
    return {
      persistence: this.deps.persistence,
      notify: this.deps.notify,
      action: this.deps.action,
      projectionHandlers: this.projectionHandlers,
      compoundProgress: this.compoundProgress,
      ids: this.deps.ids,
    };
  }

  private async entriesForResult(_result: CommandResult): Promise<JournalEntry[]> {
    return [];
  }

  private async registerBlockWait(p: Provenance, condition: WaitCondition, bound_command_id: string): Promise<string> {
    const wait_id = this.deps.ids.ulid();
    const ts = this.deps.clock.nowIso();
    const maxSeq = await this.deps.persistence.getMaxSeq();
    const row: WaitRow = {
      wait_id,
      scope_id: p.scope_id,
      aggregate_id: p.aggregate_id,
      condition,
      delivery_mode: "in_process",
      bound_command_id,
      status: "pending",
      registered_at_seq: maxSeq,
      created_at: ts,
    };
    await this.deps.persistence.runInTransaction(async (tx) => {
      await tx.insertWait(row);
    });
    this.waitRegistry.registerDeferred(wait_id);
    return wait_id;
  }

  private async handleCreate(
    command: Extract<KernelCommand, { kind: "aggregate.create" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const artifact = await this.deps.rules.load(command.rule_ref);
    if (command.metadata) {
      const v = await this.deps.schema.validate(artifact.metadata_schema, command.metadata);
      if (!v.valid) {
        return this.commitDenial(p, ENTRY_TYPES.VALIDATION_DENIED, DENIAL_CODES.VALIDATION_DENIED, v.errors?.join("; ") ?? "Invalid metadata", HTTP_SEMANTIC.FORBIDDEN, false);
      }
    }

    const aggregate_id = this.deps.ids.ulid();
    const ts = this.deps.clock.nowIso();
    const entry_id = this.deps.ids.ulid();
    const aggregate = {
      aggregate_id,
      scope_id: p.scope_id,
      rule_ref: command.rule_ref,
      state: artifact.initial_state,
      metadata: command.metadata ?? {},
      revision: 0,
      status: "active" as const,
      created_at: ts,
      updated_at: ts,
    };

    const draft = buildEntry(p, entry_id, ts, ENTRY_TYPES.AGGREGATE_CREATED, "success", {
      rule_ref: command.rule_ref,
      initial_state: artifact.initial_state,
      status: "active",
      metadata: aggregate.metadata,
      revision: 0,
    }, { aggregate_id });

    return this.commitSuccess(p, draft, aggregate, -1, "aggregate_created", {
      aggregate_id,
      state: aggregate.state,
      revision: 0,
    });
  }

  private async handleTransition(
    command: Extract<KernelCommand, { kind: "state.transition" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const aggregate = await this.deps.persistence.runInTransaction((tx) =>
      tx.getSnapshot(command.aggregate_id),
    );
    if (!aggregate) {
      return this.commitDenial(p, ENTRY_TYPES.TRANSITION_DENIED, DENIAL_CODES.NOT_FOUND, "Aggregate not found", HTTP_SEMANTIC.NOT_FOUND, false, undefined, command.aggregate_id);
    }

    const artifact = await this.deps.rules.load(aggregate.rule_ref);
    const transition = await findMatchingTransition({
      aggregate,
      artifact,
      event: command.event,
      actor_id: p.actor_id,
      actor_kind: p.actor_kind,
      condition: this.deps.condition,
    });

    if (!transition) {
      const legal = await findLegalTransitionsForActor({
        aggregate,
        artifact,
        actor_id: p.actor_id,
        actor_kind: p.actor_kind,
        condition: this.deps.condition,
      });
      return this.commitDenial(
        p,
        ENTRY_TYPES.TRANSITION_DENIED,
        DENIAL_CODES.TRANSITION_DENIED,
        `No matching transition for event '${command.event}'`,
        HTTP_SEMANTIC.CONFLICT,
        false,
        { legal_transitions_for_actor: legal },
        command.aggregate_id,
      );
    }

    if (command.expected_revision !== aggregate.revision) {
      return this.commitDenial(
        p,
        ENTRY_TYPES.REVISION_CONFLICT,
        DENIAL_CODES.REVISION_CONFLICT,
        `Expected revision ${command.expected_revision}, current ${aggregate.revision}`,
        HTTP_SEMANTIC.CONFLICT,
        true,
        undefined,
        command.aggregate_id,
      );
    }

    const ts = this.deps.clock.nowIso();
    if (transition.checkpoint) {
      const checkpoint_id = this.deps.ids.ulid();
      const checkpoint = checkpointFromTransition(
        checkpoint_id,
        p.scope_id,
        command.aggregate_id,
        {
          id: transition.id,
          from: transition.from,
          to: transition.to,
          checkpoint: transition.checkpoint,
        },
        ts,
      );
      const draft = buildEntry(p, this.deps.ids.ulid(), ts, ENTRY_TYPES.CHECKPOINT_CREATED, "success", {
        checkpoint_id,
        transition_id: transition.id,
        from: transition.from,
        to: transition.to,
      }, { aggregate_id: command.aggregate_id });

      return this.commitCheckpointPending(p, draft, checkpoint);
    }

    const updated = applyTransition(aggregate, transition, artifact, ts, command.payload);
    const draft = buildEntry(
      p,
      this.deps.ids.ulid(),
      ts,
      ENTRY_TYPES.TRANSITION_APPLIED,
      "success",
      transitionAppliedPayload(transition, updated, command.payload),
      { aggregate_id: command.aggregate_id },
    );
    return this.commitSuccess(p, draft, updated, aggregate.revision, "transition_applied", {
      aggregate_id: updated.aggregate_id,
      state: updated.state,
      revision: updated.revision,
    });
  }

  private async handleCheckpointResolve(
    command: Extract<KernelCommand, { kind: "checkpoint.resolve" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const checkpoint = await this.deps.persistence.runInTransaction((tx) =>
      tx.getCheckpoint(command.checkpoint_id),
    );
    if (!checkpoint) {
      return this.commitDenial(p, ENTRY_TYPES.TRANSITION_DENIED, DENIAL_CODES.NOT_FOUND, "Checkpoint not found", HTTP_SEMANTIC.NOT_FOUND, false);
    }

    if (checkpoint.status !== "pending") {
      return this.commitDenial(p, ENTRY_TYPES.CHECKPOINT_VOTE, DENIAL_CODES.CHECKPOINT_ALREADY_RESOLVED, "Already resolved", HTTP_SEMANTIC.CONFLICT, false, undefined, checkpoint.aggregate_id);
    }

    const assigneeOk = await this.deps.condition.matchAssignee(p.actor_id, checkpoint.quorum.assignees, p.actor_kind);
    if (!assigneeOk) {
      return this.commitDenial(p, ENTRY_TYPES.CHECKPOINT_VOTE, DENIAL_CODES.POLICY_DENIED, "Not eligible assignee", HTTP_SEMANTIC.FORBIDDEN, false, undefined, checkpoint.aggregate_id);
    }

    const ts = this.deps.clock.nowIso();
    const decision = command.decision;
    const voteDraft = buildEntry(p, this.deps.ids.ulid(), ts, ENTRY_TYPES.CHECKPOINT_VOTE, "success", {
      checkpoint_id: checkpoint.checkpoint_id,
      decision,
    }, { aggregate_id: checkpoint.aggregate_id });

    let updatedCp = addVote(checkpoint, {
      actor_id: p.actor_id,
      decision,
      ts,
    });

    const aggregate = await this.deps.persistence.runInTransaction((tx) => tx.getSnapshot(checkpoint.aggregate_id));
    if (!aggregate) {
      return this.commitDenial(p, ENTRY_TYPES.TRANSITION_DENIED, DENIAL_CODES.NOT_FOUND, "Aggregate not found", HTTP_SEMANTIC.NOT_FOUND, false, undefined, checkpoint.aggregate_id);
    }

    const artifact = await this.deps.rules.load(aggregate.rule_ref);
    const transition = artifact.transitions.find((t) => t.id === checkpoint.transition_id);
    if (!transition) {
      return this.commitDenial(p, ENTRY_TYPES.TRANSITION_DENIED, DENIAL_CODES.TRANSITION_STALE, "Transition missing", HTTP_SEMANTIC.CONFLICT, false, undefined, checkpoint.aggregate_id);
    }

    if (decision === "rejected" && shouldRejectImmediately(updatedCp, transition.checkpoint?.reject_requires_quorum)) {
      return this.commitCheckpointRejected(p, voteDraft, updatedCp);
    }

    if (!isQuorumSatisfied(updatedCp)) {
      return this.commitJournalOnly(p, voteDraft, async (tx) => {
        await tx.upsertCheckpoint(updatedCp);
      }, "checkpoint_vote", { checkpoint_id: checkpoint.checkpoint_id });
    }

    if (aggregate.state !== checkpoint.from_state) {
      return this.commitDenial(p, ENTRY_TYPES.TRANSITION_DENIED, DENIAL_CODES.TRANSITION_STALE, "State moved", HTTP_SEMANTIC.CONFLICT, false, undefined, checkpoint.aggregate_id);
    }

    const metadata_patch = command.resume_data;
    const updated = applyTransition(aggregate, transition, artifact, ts, metadata_patch);
    const resolvedDraft = buildEntry(p, this.deps.ids.ulid(), ts, ENTRY_TYPES.CHECKPOINT_RESOLVED, "success", {
      checkpoint_id: checkpoint.checkpoint_id,
    }, { aggregate_id: checkpoint.aggregate_id });
    const applyDraft = buildEntry(
      p,
      this.deps.ids.ulid(),
      ts,
      ENTRY_TYPES.TRANSITION_APPLIED,
      "success",
      transitionAppliedPayload(transition, updated, metadata_patch),
      { aggregate_id: checkpoint.aggregate_id },
    );

    updatedCp = { ...updatedCp, status: "resolved", resolved_at: ts };
    return this.commitCheckpointResolved(p, [voteDraft, resolvedDraft, applyDraft], updatedCp, updated, aggregate.revision);
  }

  private async handleEventAppend(
    command: Extract<KernelCommand, { kind: "event.append" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const aggregate = await this.deps.persistence.runInTransaction((tx) => tx.getSnapshot(command.aggregate_id));
    if (!aggregate) {
      return this.commitDenial(p, ENTRY_TYPES.VALIDATION_DENIED, DENIAL_CODES.NOT_FOUND, "Aggregate not found", HTTP_SEMANTIC.NOT_FOUND, false, undefined, command.aggregate_id);
    }
    const artifact = await this.deps.rules.load(aggregate.rule_ref);
    const declared = artifact.events?.declarations?.find((d) => d.type === command.event_type);
    if (!declared) {
      return this.commitDenial(p, ENTRY_TYPES.VALIDATION_DENIED, DENIAL_CODES.VALIDATION_DENIED, "Undeclared event", HTTP_SEMANTIC.FORBIDDEN, false, undefined, command.aggregate_id);
    }
    if (command.payload) {
      const v = await this.deps.schema.validate(declared.schema, command.payload);
      if (!v.valid) {
        return this.commitDenial(p, ENTRY_TYPES.VALIDATION_DENIED, DENIAL_CODES.VALIDATION_DENIED, v.errors?.join("; ") ?? "Invalid", HTTP_SEMANTIC.FORBIDDEN, false, undefined, command.aggregate_id);
      }
    }
    const ts = this.deps.clock.nowIso();
    const draft = buildEntry(p, this.deps.ids.ulid(), ts, ENTRY_TYPES.EVENT_APPENDED, "success", {
      type: command.event_type,
      ...command.payload,
    }, { aggregate_id: command.aggregate_id, kind: "event" });
    return this.commitJournalOnly(p, draft, async () => {}, "event_appended", { type: command.event_type });
  }

  private async handleWaitRegister(
    command: Extract<KernelCommand, { kind: "wait.register" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const wait_id = this.deps.ids.ulid();
    const ts = this.deps.clock.nowIso();
    const maxSeq = await this.deps.persistence.getMaxSeq();
    const row: WaitRow = {
      wait_id,
      scope_id: p.scope_id,
      aggregate_id: command.aggregate_id,
      condition: command.condition,
      delivery_mode: "in_process",
      bound_command_id: command.bound_command_id,
      status: "pending",
      registered_at_seq: maxSeq,
      created_at: ts,
    };
    const draft = buildEntry(p, this.deps.ids.ulid(), ts, ENTRY_TYPES.WAIT_REGISTERED, "success", { wait_id }, { aggregate_id: command.aggregate_id });
    return this.commitJournalOnly(p, draft, async (tx) => { await tx.insertWait(row); }, "wait_registered", { wait_id });
  }

  private async handleWaitCancel(
    command: Extract<KernelCommand, { kind: "wait.cancel" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const wait = await this.deps.persistence.runInTransaction((tx) => tx.getWait(command.wait_id));
    if (!wait) return denialResult(DENIAL_CODES.NOT_FOUND, { message: "Wait not found" }, HTTP_SEMANTIC.NOT_FOUND);
    const ts = this.deps.clock.nowIso();
    const draft = buildEntry(p, this.deps.ids.ulid(), ts, ENTRY_TYPES.WAIT_CANCELLED, "success", { wait_id: command.wait_id });
    return this.commitJournalOnly(p, draft, async (tx) => {
      await tx.updateWait({ ...wait, status: "cancelled" });
    }, "wait_cancelled", { wait_id: command.wait_id });
  }

  private async handleReactionRegister(
    command: Extract<KernelCommand, { kind: "reaction.register" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const maxSeq = await this.deps.persistence.getMaxSeq();
    const reaction = { ...command.spec, enabled: true, registered_at_seq: maxSeq + 1 };
    const ts = this.deps.clock.nowIso();
    const draft = buildEntry(p, this.deps.ids.ulid(), ts, ENTRY_TYPES.REACTION_REGISTERED, "success", { reaction_id: reaction.reaction_id });
    return this.commitJournalOnly(p, draft, async (tx) => { await tx.insertReaction(reaction); }, "reaction_registered", { reaction_id: reaction.reaction_id });
  }

  private async handleReactionDisable(
    command: Extract<KernelCommand, { kind: "reaction.disable" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const reaction = await this.deps.persistence.getReaction(command.reaction_id);
    if (reaction) {
      await this.deps.persistence.runInTransaction(async (tx) => {
        await tx.insertReaction({ ...reaction, enabled: false });
      });
    }
    const ts = this.deps.clock.nowIso();
    const draft = buildEntry(p, this.deps.ids.ulid(), ts, ENTRY_TYPES.REACTION_DISABLED, "success", { reaction_id: command.reaction_id });
    return this.commitJournalOnly(p, draft, async () => {}, "reaction_disabled", { reaction_id: command.reaction_id });
  }

  private async handleReactionReplay(
    command: Extract<KernelCommand, { kind: "reaction.replay" }>,
    p: Provenance,
  ): Promise<CommandResult> {
    const reaction = await this.deps.persistence.getReaction(command.reaction_id);
    if (!reaction) return denialResult(DENIAL_CODES.NOT_FOUND, { message: "Reaction not found" }, HTTP_SEMANTIC.NOT_FOUND);
    const journal = await this.tailJournal(0);
    const source = journal.find((e) => e.entry_id === command.source_entry_id);
    if (!source) return denialResult(DENIAL_CODES.NOT_FOUND, { message: "Source entry not found" }, HTTP_SEMANTIC.NOT_FOUND);

    if (!command.bypass_dedup) {
      const fingerprint = dedupFingerprint(reaction, source);
      const expires = new Date(Date.now() + reaction.dedup.window_seconds * 1000).toISOString();
      const dedup = await this.deps.persistence.runInTransaction((tx) => tx.insertDedup(fingerprint, expires));
      if (reaction.dedup.required && dedup === "exists") {
        return successResult("dedup_skipped", { reason: command.reason });
      }
    }

    const actionResult = await this.deps.action.invoke(reaction.action, {
      entry: source,
      reaction_id: reaction.reaction_id,
      attempt_no: 1,
    });
    await this.deps.persistence.runInTransaction(async (tx) => {
      await tx.appendDeliveryLog({
        entry_id: source.entry_id,
        reaction_id: reaction.reaction_id,
        attempt_no: 1,
        dedup_key: dedupFingerprint(reaction, source),
        outcome: actionResult.outcome === "success" ? "delivered" : "failed",
        ts: source.ts,
      });
    });
    return successResult("reaction_replayed", { reaction_id: command.reaction_id, reason: command.reason });
  }

  private async commitSuccess(
    p: Provenance,
    draft: import("@murrmure/runtime-contracts").JournalEntryDraft,
    aggregate: import("@murrmure/runtime-contracts").Aggregate,
    expectedRevision: number,
    code: string,
    body: Record<string, unknown>,
    http_semantic: CommandResult["http_semantic"] = HTTP_SEMANTIC.OK,
  ): Promise<CommandResult> {
    return this.deps.persistence.runInTransaction(async (tx) => {
      const allocated = await tx.appendJournal(draft);
      await tx.insertOutbox(allocated.seq);
      const cas = await tx.upsertSnapshotIfRevision(aggregate, expectedRevision);
      if (cas === "conflict") {
        const denialDraft = buildDenialEntry(p, this.deps.ids.ulid(), this.deps.clock.nowIso(), ENTRY_TYPES.REVISION_CONFLICT, DENIAL_CODES.REVISION_CONFLICT, "Revision conflict", true, undefined, aggregate.aggregate_id);
        const dAlloc = await tx.appendJournal(denialDraft);
        await tx.insertOutbox(dAlloc.seq);
        const result = resultFromEntry({ entry_id: denialDraft.entry_id, seq: dAlloc.seq }, DENIAL_CODES.REVISION_CONFLICT, { message: "Revision conflict" }, HTTP_SEMANTIC.CONFLICT, "denial");
        if (p.command_id) {
          const ins = await tx.insertIdempotency(p.command_id, result);
          if (ins === "exists") return (await tx.getIdempotency(p.command_id))!;
        }
        return result;
      }
      const result = resultFromEntry({ entry_id: draft.entry_id, seq: allocated.seq }, code, body, http_semantic, "success");
      if (p.command_id) {
        const ins = await tx.insertIdempotency(p.command_id, result);
        if (ins === "exists") return (await tx.getIdempotency(p.command_id))!;
      }
      return result;
    });
  }

  private async commitCheckpointPending(
    p: Provenance,
    draft: import("@murrmure/runtime-contracts").JournalEntryDraft,
    checkpoint: import("@murrmure/runtime-contracts").Checkpoint,
  ): Promise<CommandResult> {
    return this.deps.persistence.runInTransaction(async (tx) => {
      const allocated = await tx.appendJournal(draft);
      await tx.insertOutbox(allocated.seq);
      await tx.upsertCheckpoint(checkpoint);
      const result = resultFromEntry(
        { entry_id: draft.entry_id, seq: allocated.seq },
        DENIAL_CODES.CHECKPOINT_PENDING,
        { checkpoint_id: checkpoint.checkpoint_id, aggregate_id: checkpoint.aggregate_id, transition_id: checkpoint.transition_id },
        HTTP_SEMANTIC.ACCEPTED,
        "success",
      );
      if (p.command_id) {
        const ins = await tx.insertIdempotency(p.command_id, result);
        if (ins === "exists") return (await tx.getIdempotency(p.command_id))!;
      }
      return result;
    });
  }

  private async commitCheckpointResolved(
    p: Provenance,
    drafts: import("@murrmure/runtime-contracts").JournalEntryDraft[],
    checkpoint: import("@murrmure/runtime-contracts").Checkpoint,
    aggregate: import("@murrmure/runtime-contracts").Aggregate,
    expectedRevision: number,
  ): Promise<CommandResult> {
    return this.deps.persistence.runInTransaction(async (tx) => {
      let lastSeq = 0;
      let lastEntryId = "";
      for (const draft of drafts) {
        const alloc = await tx.appendJournal(draft);
        await tx.insertOutbox(alloc.seq);
        lastSeq = alloc.seq;
        lastEntryId = draft.entry_id;
      }
      const won = await tx.casCheckpointStatus(checkpoint.checkpoint_id, "pending", "resolved");
      if (!won) {
        const denialDraft = buildDenialEntry(p, this.deps.ids.ulid(), this.deps.clock.nowIso(), ENTRY_TYPES.CHECKPOINT_VOTE, DENIAL_CODES.CHECKPOINT_ALREADY_RESOLVED, "Concurrent resolve", false, undefined, checkpoint.aggregate_id);
        const dAlloc = await tx.appendJournal(denialDraft);
        await tx.insertOutbox(dAlloc.seq);
        return resultFromEntry({ entry_id: denialDraft.entry_id, seq: dAlloc.seq }, DENIAL_CODES.CHECKPOINT_ALREADY_RESOLVED, { message: "Concurrent resolve" }, HTTP_SEMANTIC.CONFLICT, "denial");
      }
      await tx.upsertCheckpoint(checkpoint);
      const cas = await tx.upsertSnapshotIfRevision(aggregate, expectedRevision);
      if (cas === "conflict") {
        const staleDraft = buildDenialEntry(p, this.deps.ids.ulid(), this.deps.clock.nowIso(), ENTRY_TYPES.TRANSITION_DENIED, DENIAL_CODES.TRANSITION_STALE, "State changed", false, undefined, aggregate.aggregate_id);
        const sAlloc = await tx.appendJournal(staleDraft);
        await tx.insertOutbox(sAlloc.seq);
        return resultFromEntry({ entry_id: staleDraft.entry_id, seq: sAlloc.seq }, DENIAL_CODES.TRANSITION_STALE, { message: "State changed" }, HTTP_SEMANTIC.CONFLICT, "denial");
      }
      const result = resultFromEntry({ entry_id: lastEntryId, seq: lastSeq }, "checkpoint_resolved", {
        aggregate_id: aggregate.aggregate_id,
        state: aggregate.state,
        revision: aggregate.revision,
      }, HTTP_SEMANTIC.OK, "success");
      if (p.command_id) {
        const ins = await tx.insertIdempotency(p.command_id, result);
        if (ins === "exists") return (await tx.getIdempotency(p.command_id))!;
      }
      return result;
    });
  }

  private async commitCheckpointRejected(
    p: Provenance,
    voteDraft: import("@murrmure/runtime-contracts").JournalEntryDraft,
    checkpoint: import("@murrmure/runtime-contracts").Checkpoint,
  ): Promise<CommandResult> {
    return this.deps.persistence.runInTransaction(async (tx) => {
      const vAlloc = await tx.appendJournal(voteDraft);
      await tx.insertOutbox(vAlloc.seq);
      const rejectDraft = buildEntry(p, this.deps.ids.ulid(), this.deps.clock.nowIso(), ENTRY_TYPES.CHECKPOINT_REJECTED, "success", { checkpoint_id: checkpoint.checkpoint_id }, { aggregate_id: checkpoint.aggregate_id });
      const rAlloc = await tx.appendJournal(rejectDraft);
      await tx.insertOutbox(rAlloc.seq);
      await tx.casCheckpointStatus(checkpoint.checkpoint_id, "pending", "rejected");
      await tx.upsertCheckpoint({ ...checkpoint, status: "rejected", resolved_at: this.deps.clock.nowIso() });
      const result = resultFromEntry({ entry_id: rejectDraft.entry_id, seq: rAlloc.seq }, DENIAL_CODES.CHECKPOINT_DENIED, { checkpoint_id: checkpoint.checkpoint_id }, HTTP_SEMANTIC.FORBIDDEN, "denial");
      if (p.command_id) {
        const ins = await tx.insertIdempotency(p.command_id, result);
        if (ins === "exists") return (await tx.getIdempotency(p.command_id))!;
      }
      return result;
    });
  }

  private async commitJournalOnly(
    p: Provenance,
    draft: import("@murrmure/runtime-contracts").JournalEntryDraft,
    extra: (tx: import("@murrmure/runtime-contracts").Transaction) => Promise<void>,
    code: string,
    body: Record<string, unknown>,
  ): Promise<CommandResult> {
    return this.deps.persistence.runInTransaction(async (tx) => {
      const alloc = await tx.appendJournal(draft);
      await tx.insertOutbox(alloc.seq);
      await extra(tx);
      const result = resultFromEntry({ entry_id: draft.entry_id, seq: alloc.seq }, code, body, HTTP_SEMANTIC.OK, "success");
      if (p.command_id) {
        const ins = await tx.insertIdempotency(p.command_id, result);
        if (ins === "exists") return (await tx.getIdempotency(p.command_id))!;
      }
      return result;
    });
  }

  private async commitDenial(
    p: Provenance,
    type: string,
    code: string,
    message: string,
    http_semantic: CommandResult["http_semantic"],
    retryable: boolean,
    context?: Record<string, unknown>,
    aggregate_id?: string,
  ): Promise<CommandResult> {
    return this.deps.persistence.runInTransaction(async (tx) => {
      const draft = buildDenialEntry(p, this.deps.ids.ulid(), this.deps.clock.nowIso(), type, code, message, retryable, context, aggregate_id);
      const alloc = await tx.appendJournal(draft);
      await tx.insertOutbox(alloc.seq);
      const result = resultFromEntry({ entry_id: draft.entry_id, seq: alloc.seq }, code, { message, context }, http_semantic, "denial");
      if (p.command_id) {
        const ins = await tx.insertIdempotency(p.command_id, result);
        if (ins === "exists") return (await tx.getIdempotency(p.command_id))!;
      }
      return result;
    });
  }
}
