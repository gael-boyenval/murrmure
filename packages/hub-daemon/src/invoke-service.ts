import {
  HandlerSpecSchema,
  InvokeBodySchema,
  assertInlinePayloadWithinLimit,
  type HandlerSpec,
} from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import {
  orchestrateInvoke,
  resolveInvokeTarget,
  resolveArtifactsIn,
  ensureSessionAndRun,
  dispatchOutcomeFromStepMemo,
  failRunWithNotification,
  enqueueTaskOffer,
  DEFAULT_WORKER_TTL_MS,
  registerShellProcessCancel,
  buildFlowInvokeStepContract,
  mergeDispatchAuditIntoRun,
  appendShellStreamToRun,
  mergeActionResultIntoRun,
  registerResolveCredential,
  revokeStepResolveCredentials,
  resolveSpaceRoot,
  type InvokeJournalWriter,
  type InvokeMemoStore,
  type QueuedInvokeItem,
} from "@murrmure/hub-core";
import type { InvokeRequest } from "@murrmure/runtime-contracts";
import type { ExecutorBinding } from "@murrmure/runtime-contracts";
import type { IndexedAction } from "@murrmure/contracts";
import type { HubHandler } from "@murrmure/hub-core";
import { createExecutorRegistry } from "@murrmure/executors";
import type { ShellCompleteInput, ShellStreamChunk } from "@murrmure/executors";
import { ulid } from "ulid";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { ControlBus, ControlPrincipal } from "./control-bus.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";
import type { McpWakeDispatcher } from "./mcp-wake-dispatcher.js";
import { broadcastSse } from "./context.js";
import type { DaemonContext } from "./context.js";
import type { ArtifactService } from "./artifact-service.js";
import { relayRemoteInvoke } from "./federation-wire.js";
import type { FederationPort } from "@murrmure/hub-core";
import { projectStepMemoFromJournal } from "./routes/sessions/index.js";

/** Backstop TTL for an ephemeral resolve token when the action sets no timeout. */
const DEFAULT_RESOLVE_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
/** Grace added past the action timeout so a handler can still resolve near the deadline. */
const RESOLVE_TOKEN_GRACE_MS = 5 * 60 * 1000;

function resolveTokenTtlMs(actionTimeoutMs?: number): number {
  if (!actionTimeoutMs || actionTimeoutMs <= 0) return DEFAULT_RESOLVE_TOKEN_TTL_MS;
  return actionTimeoutMs + RESOLVE_TOKEN_GRACE_MS;
}

export class InvokeService {
  private readonly memoStore = new Map<string, import("@murrmure/runtime-contracts").DispatchOutcome>();
  private readonly pendingInvokes = new Map<string, QueuedInvokeItem[]>();
  private readonly registry;
  private lastActor: { actor_id: string; token_id: string } | null = null;
  private readonly shellStreamBroadcastAt = new Map<string, number>();

  constructor(
    private readonly studio: StudioPersistencePort,
    private readonly handler: HubHandler,
    private readonly controlBus: ControlBus,
    private readonly mcpWake: McpWakeDispatcher,
    private readonly ctx: DaemonContext,
    private readonly artifacts: ArtifactService,
    private readonly federationPort: FederationPort,
  ) {
    const clock = { now: () => Date.now(), nowIso: () => new Date().toISOString() };
    this.registry = createExecutorRegistry({
      shellSpawn: {
        onProcessStart: ({ run_id, step_id, child }) => {
          // Register the cancel handle and return its unregister so the
          // executor can deregister on finish (once-only termination).
          return registerShellProcessCancel(run_id, step_id, child);
        },
        onOutputChunk: (chunk) => {
          void this.handleShellOutputChunk(chunk);
        },
        onShellComplete: (input) => {
          void this.handleShellComplete(input);
        },
      },
      mcpSession: {
        isReachable: (spaceId) => this.mcpWake.hasConnectedSession(spaceId),
        publish: (spaceId, message) => this.publishToSpace(spaceId, message),
      },
      queuePoll: {
        isReachable: (executor_id) =>
          this.ctx.executorPollStore.isReachable(executor_id, DEFAULT_WORKER_TTL_MS),
        createTaskId: () => `tsk_${ulid()}`,
        enqueue: (input) => {
          enqueueTaskOffer(this.ctx.executorPollStore, {
            ...input,
            actor_id: this.lastActor?.actor_id ?? "system_invoke",
            token_id: this.lastActor?.token_id ?? "system",
            clock,
          });
        },
      },
      remoteHub: {
        checkPeerHealth: async (remote_hub_id) => {
          const health = await this.federationPort.checkPeerHealth(remote_hub_id);
          return health.reachable
            ? { status: "reachable" as const }
            : { status: "unreachable" as const, detail: health.detail };
        },
        relayInvoke: async (input) => {
          const peer = await this.federationPort.getPeer(input.remote_hub_id);
          if (!peer) {
            return { ok: false, http_status: 503, dispatch: { status: "executor_unavailable", error_code: "EXECUTOR_UNAVAILABLE", detail: "Unknown peer hub" } };
          }
          const res = await relayRemoteInvoke({
            peerEndpoint: peer.endpoint,
            authToken: peer.auth_token,
            remote_space_id: input.remote_space_id,
            action_name: input.action_name,
            body: input.body,
          });
          const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          const dispatch = body.dispatch as import("@murrmure/runtime-contracts").DispatchOutcome | undefined;
          return { ok: res.ok, http_status: res.status, dispatch, body };
        },
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
      a2a: {
        postTask: async ({ endpoint, action_name, params }) => {
          try {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: action_name, params }),
            });
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            if (!res.ok) {
              return { ok: false, detail: typeof data.message === "string" ? data.message : `A2A failed (${res.status})` };
            }
            return { ok: true, result: (data.result as Record<string, unknown>) ?? data };
          } catch (error) {
            return { ok: false, detail: error instanceof Error ? error.message : "A2A request failed" };
          }
        },
      },
    });
    this.mcpWake.onConnect((principal) => {
      void this.flushQueuedInvokes(principal.space_id);
    });
  }

  private publishToSpace(
    spaceId: string,
    message: { method: string; params: Record<string, unknown> },
  ): void {
    const bare = bareSpaceId(spaceId);
    for (const principal of this.mcpWake.connectedPrincipals(bare)) {
      this.controlBus.publish(
        principal,
        message as Parameters<ControlBus["publish"]>[1],
      );
    }
  }

  private async loadRunExecInput(run_id?: string): Promise<Record<string, unknown> | undefined> {
    if (!run_id) return undefined;
    const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
    const run = await this.studio.getRun(bare);
    if (!run) return undefined;
    return ((run.exec_context.input ?? {}) as Record<string, unknown>) ?? {};
  }

  private async loadIndexedHandler(
    space_id: string,
    action_name: string,
  ): Promise<HandlerSpec | undefined> {
    const rows = await this.studio.listIndexedHooks(space_id);
    for (const row of rows) {
      const parsedHandler = HandlerSpecSchema.safeParse(row);
      if (!parsedHandler.success) continue;
      if (parsedHandler.data.id === action_name) {
        return parsedHandler.data;
      }
    }
    return undefined;
  }

  private async mintRunResolveToken(input: {
    run_id: string;
    space_id: string;
    actor_id: string;
    step_id: string;
    /** Handler (action) identity the token is minted for. */
    handler_id: string;
    /** Assignment TTL backstop (ms); expiry is set to now + ttl. */
    ttl_ms: number;
  }): Promise<string> {
    const token_id = ulid();
    const ts = new Date();
    const expires_at = new Date(ts.getTime() + input.ttl_ms).toISOString();
    await this.studio.insertToken(
      {
        token_id,
        actor_id: input.actor_id,
        space_id: bareSpaceId(input.space_id),
        scopes: ["step:resolve"],
        capabilities: ["step:resolve"],
        harness_id: `run:${input.run_id}`,
        // The assignment scope is space/run/step/handler. A step binds exactly
        // one handler, so run:step implies the handler; the handler segment is
        // carried so the token is bound to the specific handler dispatch and
        // auditable, and route handlers verify the run:step prefix.
        scope_ref: `${input.run_id}:${input.step_id}:${input.handler_id}`,
        status: "active",
        expires_at,
      },
      ts.toISOString(),
    );
    return `tok_${token_id}`;
  }

  private journalWriter(): InvokeJournalWriter {
    return {
      append: async (input) => {
        await this.appendJournalAndProject(input);
      },
    };
  }

  private async appendJournalAndProject(input: {
    type: string;
    space_id: string;
    session_id?: string;
    run_id?: string;
    step_id?: string;
    action_name?: string;
    actor_id: string;
    token_id: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const result = await this.handler.appendSpaceJournal({
      type: input.type,
      space_id: input.space_id,
      session_id: input.session_id,
      run_id: input.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {
        ...input.data,
        step_id: input.step_id,
        ...(input.action_name ? { action_name: input.action_name } : {}),
      },
    });

    await projectStepMemoFromJournal(this.ctx, {
      run_id: input.run_id,
      step_id: input.step_id,
      type: input.type,
      ts: new Date().toISOString(),
      idempotency_key:
        typeof input.data?.idempotency_key === "string" ? input.data.idempotency_key : undefined,
      error_code: typeof input.data?.error_code === "string" ? input.data.error_code : undefined,
      executor_type:
        typeof input.data?.executor_type === "string" ? input.data.executor_type : undefined,
      result:
        input.data?.result && typeof input.data.result === "object"
          ? (input.data.result as Record<string, unknown>)
          : undefined,
    });

    broadcastSse(this.ctx, {
      event: "journal.append",
      data: {
        type: input.type,
        space_id: prefixedSpaceId(bareSpaceId(input.space_id)),
        session_id: input.session_id,
        run_id: input.run_id,
        step_id: input.step_id,
        seq: result.seq,
        event_id: result.entry_id,
      },
    });
  }

  private async handleShellOutputChunk(chunk: ShellStreamChunk): Promise<void> {
    if (!chunk.run_id) return;
    await appendShellStreamToRun(this.studio, {
      run_id: chunk.run_id,
      step_id: chunk.step_id,
      stream: chunk.stream,
      chunk: chunk.chunk,
    });

    const key = `${chunk.run_id}:${chunk.step_id}`;
    const now = Date.now();
    const last = this.shellStreamBroadcastAt.get(key) ?? 0;
    if (now - last < 200) return;
    this.shellStreamBroadcastAt.set(key, now);

    const bare = chunk.run_id.startsWith("run_") ? chunk.run_id.slice(4) : chunk.run_id;
    const run = await this.studio.getRun(bare);
    if (!run?.space_id) return;

    broadcastSse(this.ctx, {
      event: "journal.append",
      data: {
        type: "mrmr.action.output",
        space_id: prefixedSpaceId(run.space_id),
        session_id: run.session_id ? `ses_${run.session_id}` : undefined,
        run_id: chunk.run_id.startsWith("run_") ? chunk.run_id : `run_${chunk.run_id}`,
        step_id: chunk.step_id,
      },
    });
  }

  private async handleShellComplete(input: ShellCompleteInput): Promise<void> {
    if (!input.run_id) return;
    const bare = input.run_id.startsWith("run_") ? input.run_id.slice(4) : input.run_id;
    const run = await this.studio.getRun(bare);
    if (!run?.space_id) return;

    // The handler process has terminated (completed or failed); its ephemeral
    // resolve credential is revoked immediately so it cannot outlive the
    // assignment. Run-terminal revocation is a separate safety net.
    revokeStepResolveCredentials(input.run_id, input.step_id);

    const space_id = run.space_id.startsWith("spc_") ? run.space_id : prefixedSpaceId(run.space_id);
    const session_id = run.session_id ? `ses_${run.session_id}` : undefined;
    const actor_id = this.lastActor?.actor_id ?? "system_invoke";
    const token_id = this.lastActor?.token_id ?? "system";
    const outcome = input.outcome;

    if (outcome.status === "completed") {
      await this.appendJournalAndProject({
        type: JOURNAL_EVENT_TYPES.ACTION_COMPLETED,
        space_id,
        session_id,
        run_id: input.run_id,
        step_id: input.step_id,
        action_name: input.action_name,
        actor_id,
        token_id,
        data: { result: outcome.result, action_name: input.action_name },
      });
      return;
    }

    if (outcome.status !== "failed") return;

    const memos = await this.studio.listRunStepMemos(`run_${bare}`);
    const memo = memos.find((m) => m.step_id === input.step_id);
    if (memo?.status === "completed") {
      if (outcome.result) {
        await mergeActionResultIntoRun(this.studio, {
          run_id: input.run_id,
          step_id: input.step_id,
          status: "completed",
          result: outcome.result,
          completed_at: new Date().toISOString(),
        });
      }
      return;
    }

    const journalType =
      outcome.error_code === "ACTION_TIMED_OUT"
        ? JOURNAL_EVENT_TYPES.ACTION_TIMED_OUT
        : JOURNAL_EVENT_TYPES.ACTION_FAILED;

    await this.appendJournalAndProject({
      type: journalType,
      space_id,
      session_id,
      run_id: input.run_id,
      step_id: input.step_id,
      action_name: input.action_name,
      actor_id,
      token_id,
      data: {
        error_code: outcome.error_code,
        detail: outcome.detail,
        result: outcome.result,
        action_name: input.action_name,
      },
    });

    await failRunWithNotification(
      {
        studio: this.studio,
        handler: this.handler,
        ids: { ulid: () => ulid() },
        clock: { nowIso: () => new Date().toISOString() },
        executorPollStore: this.ctx.executorPollStore,
      },
      {
        run_id: input.run_id,
        actor_id,
        token_id,
        reason: outcome.error_code ?? "invoke_failed",
      },
    );
  }

  private memoPort(): InvokeMemoStore {
    return {
      get: async (key) => {
        const cached = this.memoStore.get(key);
        if (cached) return cached;
        const row = await this.studio.getRunStepMemoByIdempotencyKey(key);
        if (!row) return null;
        const outcome = dispatchOutcomeFromStepMemo(row);
        if (outcome) this.memoStore.set(key, outcome);
        return outcome;
      },
      set: (key, outcome) => {
        this.memoStore.set(key, outcome);
      },
    };
  }

  private invokeQueuePort() {
    return {
      enqueue: (item: QueuedInvokeItem) => {
        const bare = bareSpaceId(item.request.space_id);
        const queue = this.pendingInvokes.get(bare) ?? [];
        queue.push(item);
        this.pendingInvokes.set(bare, queue);
      },
    };
  }

  async flushQueuedInvokes(spaceId: string): Promise<void> {
    const bare = bareSpaceId(spaceId);
    const queue = this.pendingInvokes.get(bare);
    if (!queue?.length) return;
    this.pendingInvokes.delete(bare);

    let processed = 0;
    try {
      for (; processed < queue.length; processed++) {
        const item = queue[processed]!;
        await orchestrateInvoke(
          item.resolved,
          item.request,
          item.actor,
          {
            registry: this.registry,
            memoStore: this.memoPort(),
            journal: this.journalWriter(),
            invokeQueue: this.invokeQueuePort(),
            clock: { nowIso: () => new Date().toISOString() },
          },
          {
            skipMemoLookup: true,
            onDispatchAudit: async ({ run_id, step_id, audit }) => {
              await mergeDispatchAuditIntoRun(this.studio, {
                run_id,
                step_id,
                audit,
                dispatched_at: new Date().toISOString(),
              });
            },
          },
        );
      }
    } catch {
      const remaining = queue.slice(processed);
      const concurrent = this.pendingInvokes.get(bare) ?? [];
      this.pendingInvokes.set(bare, [...remaining, ...concurrent]);
    }
  }

  async invokeAction(input: {
    space_id: string;
    action_name: string;
    body: unknown;
    idempotency_header?: string;
    actor_id: string;
    token_id: string;
  }) {
    const parsed = InvokeBodySchema.safeParse(input.body ?? {});
    if (!parsed.success) {
      return {
        http: 400 as const,
        body: {
          code: "INVALID_INVOKE_BODY",
          message: "Invoke body failed validation",
          issues: parsed.error.issues,
        },
      };
    }

    const bare = bareSpaceId(input.space_id);

    let session_id = parsed.data.session_id;
    let run_id = parsed.data.run_id;

    if (!session_id || !run_id) {
      const ensured = await ensureSessionAndRun(
        {
          studio: this.studio,
          handler: this.handler,
          ids: { ulid: () => ulid() },
          clock: { nowIso: () => new Date().toISOString() },
        },
        {
          session_id,
          run_id,
          space_id: prefixedSpaceId(bare),
          actor_id: input.actor_id,
          token_id: input.token_id,
          action_name: input.action_name,
        },
      );
      if ("error" in ensured) {
        return { http: 500 as const, body: ensured.error };
      }
      session_id = ensured.session_id;
      run_id = ensured.run_id;
    }

    const actions = await this.studio.listIndexedActions(bare);
    const executors = await this.studio.listIndexedExecutors(bare);
    const bindings = await this.studio.getSpaceBindings(bare);
    const indexedHandler =
      parsed.data.run_id && parsed.data.step_id
        ? await this.loadIndexedHandler(bare, input.action_name)
        : undefined;

    let resolved = resolveInvokeTarget(
      input.action_name,
      actions,
      executors,
      bindings,
      parsed.data.delivery,
    );
    if ("code" in resolved && indexedHandler && indexedHandler.type !== "view_resolver") {
      const action: IndexedAction = {
        name: indexedHandler.id,
        space_id: prefixedSpaceId(bare),
        executor: `handler:${indexedHandler.id}`,
        timeout_ms: indexedHandler.timeout_ms,
        command: indexedHandler.command,
        prompt: indexedHandler.prompt,
        cwd: indexedHandler.cwd,
        delivery: indexedHandler.delivery,
      };
      const params = indexedHandler.params ?? {};
      let binding: ExecutorBinding;
      if (indexedHandler.type === "remote_hub") {
        binding = {
          type: "remote_hub",
          executor_id: action.executor,
          remote_hub_id: String(params.remote_hub_id ?? ""),
          remote_space_id:
            typeof params.remote_space_id === "string" ? params.remote_space_id : undefined,
        };
      } else {
        binding = { type: indexedHandler.type, executor_id: action.executor };
      }
      resolved = {
        action,
        binding,
        space_root: resolveSpaceRoot(bindings),
        delivery: indexedHandler.delivery ?? "fail_fast",
      };
    }
    if ("code" in resolved) {
      return { http: 404 as const, body: resolved };
    }

    if (parsed.data.params) {
      try {
        assertInlinePayloadWithinLimit(parsed.data.params);
      } catch {
        return {
          http: 413 as const,
          body: {
            code: "INLINE_PAYLOAD_EXCEEDED",
            message: "Invoke params exceed 65536 bytes; register an artifact via PUT /v1/artifacts",
          },
        };
      }
    }

    let artifactParams: Record<string, unknown> | undefined;
    if (parsed.data.artifacts_in?.length) {
      if (!resolved.space_root) {
        return {
          http: 422 as const,
          body: {
            code: "SPACE_ROOT_MISSING",
            message: "artifacts_in requires a linked space root path",
          },
        };
      }

      const artifactResolution = await resolveArtifactsIn({
        transfer_ids: parsed.data.artifacts_in,
        requester_space_id: bare,
        requester_actor_id: input.actor_id,
        space_root: resolved.space_root,
        load: (transfer_id) => this.artifacts.loadArtifactForInvoke(transfer_id),
      });

      if ("code" in artifactResolution) {
        const status = artifactResolution.code === "ARTIFACT_ACCESS_DENIED" ? 403 : 404;
        return { http: status as 403 | 404, body: artifactResolution };
      }

      for (const artifact of artifactResolution) {
        const row = await this.artifacts.loadArtifactForInvoke(artifact.transfer_id);
        if (!row) {
          return {
            http: 404 as const,
            body: { code: "ARTIFACT_NOT_FOUND", message: `Artifact '${artifact.transfer_id}' is not registered` },
          };
        }

        this.artifacts.materializeToInbox(
          resolved.space_root,
          artifact.transfer_id,
          row.manifest.name,
          Buffer.from(row.bytes),
        );
      }

      artifactParams = {
        artifacts: artifactResolution.map((artifact) => ({
          transfer_id: artifact.transfer_id,
          name: artifact.name,
          digest: artifact.digest,
          local_path: artifact.relative_path,
        })),
      };
    }

    const request: InvokeRequest = {
      space_id: prefixedSpaceId(bare),
      action_name: input.action_name,
      session_id,
      run_id,
      step_id: parsed.data.step_id,
      params: { ...parsed.data.params, ...artifactParams },
      exec_input: await this.loadRunExecInput(run_id),
      expect: parsed.data.expect,
      artifacts_in: parsed.data.artifacts_in,
      delivery: resolved.delivery,
      idempotency_key: input.idempotency_header,
    };

    if (run_id && parsed.data.step_id && resolved.space_root) {
      const matchedHandler = indexedHandler ?? await this.loadIndexedHandler(bare, input.action_name);
      const ttl_ms = resolveTokenTtlMs(resolved.action.timeout_ms);
      const resolveToken = await this.mintRunResolveToken({
        run_id,
        space_id: bare,
        actor_id: input.actor_id,
        step_id: parsed.data.step_id,
        handler_id: input.action_name,
        ttl_ms,
      });
      // Track the ephemeral credential so any terminal path can revoke it.
      registerResolveCredential(run_id, parsed.data.step_id, resolveToken);
      const stepContract = await buildFlowInvokeStepContract(this.studio, {
        run_id,
        step_id: parsed.data.step_id,
        space_root: resolved.space_root,
        contract_keys: matchedHandler?.contract_keys,
        hub_token: resolveToken,
        hub_url: `http://127.0.0.1:${this.ctx.config.port}`,
        artifact_transport:
          matchedHandler?.type === "remote_hub" ? "remote_reference" : "local_path",
      });
      if (stepContract) {
        request.step_contract = stepContract;
      }
    }

    this.lastActor = { actor_id: input.actor_id, token_id: input.token_id };

    const response = await orchestrateInvoke(resolved, request, {
      actor_id: input.actor_id,
      token_id: input.token_id,
    }, {
      registry: this.registry,
      memoStore: this.memoPort(),
      journal: this.journalWriter(),
      invokeQueue: this.invokeQueuePort(),
      clock: { nowIso: () => new Date().toISOString() },
    }, {
      onDispatchAudit: async ({ run_id, step_id, audit }) => {
        await mergeDispatchAuditIntoRun(this.studio, {
          run_id,
          step_id,
          audit,
          dispatched_at: new Date().toISOString(),
        });
      },
    });

    if (response.dispatch.status === "failed" && run_id) {
      await failRunWithNotification(
        {
          studio: this.studio,
          handler: this.handler,
          ids: { ulid: () => ulid() },
          clock: { nowIso: () => new Date().toISOString() },
          executorPollStore: this.ctx.executorPollStore,
        },
        {
          run_id,
          actor_id: input.actor_id,
          token_id: input.token_id,
          reason:
            response.dispatch.error_code === "ACTION_TIMED_OUT"
              ? "ACTION_TIMED_OUT"
              : (response.dispatch.error_code ?? "invoke_failed"),
        },
      );
      broadcastSse(this.ctx, {
        event: "notification.changed",
        data: { run_id },
      });
    }

    const status =
      response.dispatch.status === "executor_unavailable"
        ? 503
        : response.dispatch.status === "failed"
          ? 422
          : 200;

    return { http: status as 200 | 422 | 503, body: response };
  }

  async invokeFromMcpWake(input: {
    target_space_id: string;
    wake_label: string;
    payload: unknown;
    actor_id: string;
    token_id: string;
  }) {
    const result = await this.invokeAction({
      space_id: input.target_space_id,
      action_name: input.wake_label,
      body: {
        params: typeof input.payload === "object" && input.payload != null ? input.payload : { value: input.payload },
      },
      actor_id: input.actor_id,
      token_id: input.token_id,
    });

    const body = result.body;
    if (!body) {
      return result.http >= 400
        ? result
        : { http: 500 as const, body: { code: "INTERNAL", message: "Empty invoke response" } };
    }

    if (result.http === 503 && "dispatch" in body && body.dispatch?.status === "executor_unavailable") {
      return {
        http: 503 as const,
        body: {
          code: "EXECUTOR_UNAVAILABLE",
          message: body.dispatch.detail ?? "Executor is not reachable",
          dispatch: body.dispatch,
        },
      };
    }

    if (result.http >= 400) {
      return result;
    }

    if ("dispatch" in body && body.dispatch?.status === "executor_unavailable") {
      return {
        http: 503 as const,
        body: {
          code: "EXECUTOR_UNAVAILABLE",
          message: body.dispatch.detail ?? "Executor is not reachable",
          dispatch: body.dispatch,
        },
      };
    }

    const dispatch = "dispatch" in body ? body.dispatch : undefined;
    return { http: 200 as const, body: { ok: true, dispatch } };
  }
}

export type { ControlPrincipal };
