import { InvokeBodySchema, assertInlinePayloadWithinLimit } from "@murrmure/contracts";
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
  type InvokeJournalWriter,
  type InvokeMemoStore,
  type QueuedInvokeItem,
} from "@murrmure/hub-core";
import type { InvokeRequest } from "@murrmure/runtime-contracts";
import type { HubHandler } from "@murrmure/hub-core";
import { createExecutorRegistry } from "@murrmure/executors";
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

export class InvokeService {
  private readonly memoStore = new Map<string, import("@murrmure/runtime-contracts").DispatchOutcome>();
  private readonly pendingInvokes = new Map<string, QueuedInvokeItem[]>();
  private readonly registry;
  private lastActor: { actor_id: string; token_id: string } | null = null;

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
        onProcessStart: ({ run_id, child }) => {
          registerShellProcessCancel(run_id, child);
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

  private journalWriter(): InvokeJournalWriter {
    return {
      append: async (input) => {
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
          },
        });

        await projectStepMemoFromJournal(this.ctx, {
          run_id: input.run_id,
          step_id: input.step_id,
          type: input.type,
          ts: new Date().toISOString(),
          idempotency_key:
            typeof input.data.idempotency_key === "string" ? input.data.idempotency_key : undefined,
          error_code: typeof input.data.error_code === "string" ? input.data.error_code : undefined,
          executor_type:
            typeof input.data.executor_type === "string" ? input.data.executor_type : undefined,
          result:
            input.data.result && typeof input.data.result === "object"
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
      },
    };
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
          { skipMemoLookup: true },
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

    const resolved = resolveInvokeTarget(
      input.action_name,
      actions,
      executors,
      bindings,
      parsed.data.delivery,
    );
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
      const stepContract = await buildFlowInvokeStepContract(this.studio, {
        run_id,
        step_id: parsed.data.step_id,
        space_root: resolved.space_root,
      });
      if (stepContract) request.step_contract = stepContract;
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
