import type {
  Capability,
  FlowIndexEntry,
  Run,
  Session,
} from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { toRunDto, toSessionDto } from "../session/index.js";
import { canExecuteFlow, canReadFlow } from "./start.js";
import { buildSpaceHomeIndex, type SpaceHomeIndexSection } from "./space-home-index.js";
import { flowUsesStepContracts } from "./step-catalog.js";
import {
  buildEmittableEventsCatalog,
  type EmittableEventEntry,
} from "../events/emittable-catalog.js";

export type {
  SpaceHomeHookActionRow,
  SpaceHomeHookRow,
  SpaceHomeActionRow,
  SpaceHomeEventRow,
  SpaceHomeIndexSection,
} from "./space-home-index.js";
export type { EmittableEventEntry } from "../events/emittable-catalog.js";

export interface SpaceHomeFlowRow {
  flow_id: string;
  name: string;
  digest: string;
  start: FlowIndexEntry["start"];
  can_run: boolean;
  can_preview: boolean;
  manual: boolean;
  view_ref?: FlowIndexEntry["view_ref"];
}

export interface SpaceHomeRunRow {
  run_id: string;
  session_id: string;
  flow_id?: string | null;
  lifecycle: Run["lifecycle"];
  started_at: string;
  ended_at?: string;
  title?: string;
}

export interface SpaceHomeAttentionRow {
  kind: "gate" | "run_failed" | "human_step";
  gate_id?: string;
  step_id?: string;
  run_id?: string;
  session_id?: string;
  title: string;
}

export interface SpaceHomePayload {
  space_id: string;
  needs_attention: SpaceHomeAttentionRow[];
  active_runs: SpaceHomeRunRow[];
  your_flows: SpaceHomeFlowRow[];
  available_to_run: SpaceHomeFlowRow[];
  receiving_from: SpaceHomeFlowRow[];
  recent_completed: SpaceHomeRunRow[];
  index: SpaceHomeIndexSection;
  emittable_events: EmittableEventEntry[];
}

function bare(id: string): string {
  return id.startsWith("spc_") ? id.slice(4) : id.startsWith("ses_") ? id.slice(4) : id.startsWith("run_") ? id.slice(4) : id;
}

function flowRow(
  entry: FlowIndexEntry,
  capabilities: Capability[],
  flow_acl: string[] | undefined,
): SpaceHomeFlowRow {
  const can_run = canExecuteFlow(capabilities, flow_acl, entry.flow_id);
  const can_preview = canReadFlow(capabilities);
  return {
    flow_id: entry.flow_id,
    name: entry.name,
    digest: entry.digest,
    start: entry.start,
    can_run,
    can_preview,
    manual: entry.start.manual !== false,
    view_ref: entry.view_ref,
  };
}

export async function buildSpaceHome(
  studio: StudioPersistencePort,
  input: {
    space_id: string;
    actor_id: string;
    capabilities: Capability[];
    flow_acl?: string[];
  },
): Promise<SpaceHomePayload> {
  const spaceBare = bare(input.space_id);
  const spacePrefixed = input.space_id.startsWith("spc_") ? input.space_id : `spc_${spaceBare}`;

  const allFlows = await studio.listFlowIndex(spaceBare);
  const allSpaces = await studio.listSpaces();
  const federatedFlows: FlowIndexEntry[] = [...allFlows];
  for (const sp of allSpaces) {
    if (sp.space_id === spaceBare) continue;
    const remote = await studio.listFlowIndex(sp.space_id);
    for (const f of remote) {
      if (!federatedFlows.some((x) => x.flow_id === f.flow_id && x.origin_space_id === f.origin_space_id)) {
        federatedFlows.push(f);
      }
    }
  }

  const your_flows = allFlows
    .filter((f) => f.origin_space_id === spacePrefixed)
    .map((f) => flowRow(f, input.capabilities, input.flow_acl));

  const available_to_run = allFlows
    .filter((f) => canExecuteFlow(input.capabilities, input.flow_acl, f.flow_id))
    .map((f) => flowRow(f, input.capabilities, input.flow_acl));

  const receiving_from = federatedFlows
    .filter(
      (f) =>
        f.origin_space_id !== spacePrefixed &&
        f.step_spaces.some((s) => s === spacePrefixed || s === spaceBare),
    )
    .map((f) => flowRow(f, input.capabilities, input.flow_acl));

  const sessions = await studio.listSessions({ space_id: spaceBare });
  const sessionTitle = new Map(sessions.map((s) => [s.session_id, s.title]));

  const active_runs: SpaceHomeRunRow[] = [];
  const recent_completed: SpaceHomeRunRow[] = [];
  const needs_attention: SpaceHomeAttentionRow[] = [];

  for (const session of sessions) {
    const runs = await studio.listRunsBySession(session.session_id);
    for (const run of runs) {
      const dto = toRunDto(run);
      const row: SpaceHomeRunRow = {
        run_id: dto.run_id,
        session_id: dto.session_id,
        flow_id: dto.flow_id,
        lifecycle: dto.lifecycle,
        started_at: dto.started_at,
        ended_at: dto.ended_at,
        title: sessionTitle.get(session.session_id),
      };
      if (run.lifecycle === "working" || run.lifecycle === "input-required") {
        active_runs.push(row);

        if (run.flow_id) {
          const entry = await studio.getFlowIndexEntry(run.flow_id, run.space_id);
          if (flowUsesStepContracts(entry)) {
            const memos = await studio.listRunStepMemos(`run_${run.run_id}`);
            for (const memo of memos) {
              if (memo.status !== "awaiting_human") continue;
              needs_attention.push({
                kind: "human_step",
                step_id: memo.step_id,
                run_id: dto.run_id,
                session_id: dto.session_id,
                title: `Needs you: ${memo.step_id}`,
              });
            }
          }
        }
      } else if (
        run.lifecycle === "completed" ||
        run.lifecycle === "failed" ||
        run.lifecycle === "cancelled"
      ) {
        recent_completed.push(row);
      }
    }
  }

  recent_completed.sort((a, b) => (b.ended_at ?? b.started_at).localeCompare(a.ended_at ?? a.started_at));
  recent_completed.splice(20);

  const pendingGates = await studio.listPendingGates({});
  for (const gate of pendingGates) {
    if (gate.space_id !== spaceBare && gate.space_id !== spacePrefixed) continue;
    needs_attention.push({
      kind: "gate",
      gate_id: gate.gate_id.startsWith("gte_") ? gate.gate_id : `gte_${gate.gate_id}`,
      run_id: `run_${gate.run_id}`,
      session_id: `ses_${gate.session_id}`,
      title: `Gate on step ${gate.step_id}`,
    });
  }

  for (const run of active_runs) {
    if (run.lifecycle === "failed") {
      needs_attention.push({
        kind: "run_failed",
        run_id: run.run_id,
        session_id: run.session_id,
        title: run.title ?? `Run ${run.run_id}`,
      });
    }
  }

  return {
    space_id: spacePrefixed,
    needs_attention,
    active_runs,
    your_flows,
    available_to_run,
    receiving_from,
    recent_completed,
    index: await buildSpaceHomeIndex(studio, spaceBare),
    emittable_events: (await buildEmittableEventsCatalog(studio, spaceBare)).events,
  };
}

export { toSessionDto };
