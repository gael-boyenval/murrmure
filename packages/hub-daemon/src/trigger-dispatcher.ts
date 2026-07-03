import { ulid } from "ulid";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { addSpaceId } from "@murrmure/hub-core";
import type { InvokeService } from "./invoke-service.js";
import type { HubHandler } from "@murrmure/hub-core";
import {
  normalizeTriggerAction,
  normalizeTriggerDedup,
  type McpWakeAction,
  type TriggerDedup,
} from "./lib/triggers-templates.js";
import {
  applyJsonPathMap,
  computeBusinessKey,
  payloadMatches,
  type SourceEvent,
} from "./trigger-jsonpath.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";

export interface TriggerSpec {
  name?: string;
  filter?: {
    event_types?: string[];
    source_space_id?: string;
    payload_match?: Record<string, unknown>;
  };
  action?: Record<string, unknown>;
  dedup?: Record<string, unknown>;
}

export class TriggerDispatcher {
  invokeService!: InvokeService;

  constructor(
    private readonly studio: StudioPersistencePort,
    private readonly handler: HubHandler,
  ) {}

  async dispatch(source: SourceEvent): Promise<void> {
    const triggers = await this.studio.listAllActiveTriggers();
    const sourceBare = bareSpaceId(source.space_id);
    const sourcePrefixed = prefixedSpaceId(sourceBare);

    for (const row of triggers) {
      const spec = (typeof row.spec_json === "string"
        ? JSON.parse(row.spec_json)
        : row.spec) as TriggerSpec;
      if (!this.matchesFilter(source, spec.filter, sourceBare, sourcePrefixed)) continue;

      const triggerId = String(row.trigger_id);
      const triggerSpaceId = String(row.space_id);
      await this.executeTrigger(triggerId, triggerSpaceId, spec, source);
    }
  }

  async replayTrigger(
    triggerSpaceId: string,
    triggerId: string,
    source: SourceEvent,
    bypassDedup = false,
  ): Promise<{ outcome: string; dedup_reason?: string }> {
    const bareTrigger = triggerId.startsWith("trg_") ? triggerId.slice(4) : triggerId;
    const rows = await this.studio.listTriggers(bareSpaceId(triggerSpaceId));
    const row = rows.find((r) => String(r.trigger_id) === bareTrigger);
    if (!row) throw new Error("TRIGGER_NOT_FOUND");

    const spec = (typeof row.spec_json === "string"
      ? JSON.parse(row.spec_json)
      : row.spec) as TriggerSpec;

    return this.executeTrigger(bareTrigger, bareSpaceId(triggerSpaceId), spec, source, bypassDedup);
  }

  private matchesFilter(
    source: SourceEvent,
    filter: TriggerSpec["filter"],
    sourceBare: string,
    sourcePrefixed: string,
  ): boolean {
    if (!filter?.event_types?.includes(source.event_type)) return false;

    if (filter.source_space_id) {
      const f = filter.source_space_id;
      const fBare = bareSpaceId(f);
      const fPrefixed = prefixedSpaceId(fBare);
      if (f !== sourceBare && f !== sourcePrefixed && fBare !== sourceBare && fPrefixed !== sourcePrefixed) {
        return false;
      }
    }

    return payloadMatches(source.payload, filter.payload_match);
  }

  private async executeTrigger(
    triggerId: string,
    triggerSpaceId: string,
    spec: TriggerSpec,
    source: SourceEvent,
    bypassDedup = false,
  ): Promise<{ outcome: string; dedup_reason?: string }> {
    const action = normalizeTriggerAction(spec.action ?? {});
    const dedup = normalizeTriggerDedup(spec.dedup);

    if (!bypassDedup) {
      const dup = await this.checkDedup(triggerSpaceId, triggerId, source, dedup);
      if (dup) {
        await this.recordDelivery(triggerSpaceId, triggerId, source.event_id, "deduped", "duplicate_business_key", dup);
        return { outcome: "deduped", dedup_reason: "duplicate_business_key" };
      }
    }

    try {
      const payload = applyJsonPathMap(source, action.payload_map);
      if ("body_ref" in payload) {
        delete payload.body_ref;
      }

      const wakeResult = await this.invokeService.invokeFromMcpWake({
        target_space_id: action.target_space_id,
        wake_label: action.wake_label,
        payload,
        actor_id: "system_trigger",
        token_id: "system",
      });

      if (wakeResult.http >= 400) {
        throw new Error(
          typeof (wakeResult.body as { message?: string }).message === "string"
            ? (wakeResult.body as { message: string }).message
            : "invoke_failed",
        );
      }

      await this.recordDelivery(
        triggerSpaceId,
        triggerId,
        source.event_id,
        "success",
        undefined,
        computeBusinessKey(source, dedup.key_jsonpaths),
      );
      return { outcome: "success" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "wake_failed";
      await this.recordDelivery(triggerSpaceId, triggerId, source.event_id, "failed", message);
      await this.emitIntegrationFailure(action, source, message);
      return { outcome: "failed", dedup_reason: message };
    }
  }

  private async checkDedup(
    triggerSpaceId: string,
    triggerId: string,
    source: SourceEvent,
    dedup: TriggerDedup,
  ): Promise<string | null> {
    const fingerprint = computeBusinessKey(source, dedup.key_jsonpaths);
    if (!fingerprint.replace(/\|/g, "")) return null;

    const existing = await this.studio.findTriggerDeliveryByFingerprint(
      triggerSpaceId,
      triggerId,
      fingerprint,
      dedup.window_seconds,
    );
    return existing ? fingerprint : null;
  }

  private async recordDelivery(
    triggerSpaceId: string,
    triggerId: string,
    sourceEventId: string,
    outcome: string,
    dedupReason?: string,
    fingerprint?: string,
  ): Promise<void> {
    await this.studio.insertTriggerDelivery({
      delivery_id: ulid(),
      space_id: triggerSpaceId,
      trigger_id: triggerId,
      source_event_id: sourceEventId,
      outcome,
      dedup_reason: dedupReason ?? null,
      fingerprint: fingerprint ?? null,
      created_at: new Date().toISOString(),
    });
  }

  private async emitIntegrationFailure(
    action: McpWakeAction,
    source: SourceEvent,
    message: string,
  ): Promise<void> {
    await this.handler.execute({
      kind: "event.append",
      provenance: {
        space_id: addSpaceId(bareSpaceId(action.target_space_id)),
        actor_id: "system_trigger",
        token_id: "system",
      },
      event_type: "integration_failure",
      payload: {
        wake_label: action.wake_label,
        source_event_id: source.event_id,
        message,
      },
    } as never).catch(() => undefined);
  }
}
