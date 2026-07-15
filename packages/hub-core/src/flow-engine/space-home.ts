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
  origin_space_id: string;
  name: string;
  digest: string;
  triggers: FlowIndexEntry["triggers"];
  can_run: boolean;
  can_preview: boolean;
  manual: boolean;
  authored_here: boolean;
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
  version: 2;
  space_id: string;
  needs_attention: SpaceHomeAttentionRow[];
  active_runs: SpaceHomeRunRow[];
  flows: SpaceHomeFlowRow[];
  receiving_from: SpaceHomeFlowRow[];
  recent_completed: SpaceHomeRunRow[];
  index: SpaceHomeIndexSection;
  emittable_events: EmittableEventEntry[];
}

function bare(id: string): string {
  return id.startsWith("spc_") ? id.slice(4) : id.startsWith("ses_") ? id.slice(4) : id.startsWith("run_") ? id.slice(4) : id;
}

function effectiveRunLifecycle(
  lifecycle: Run["lifecycle"],
  memos: { status: string }[],
): Run["lifecycle"] {
  if (memos.some((m) => m.status === "failed")) return "failed";
  return lifecycle;
}

function flowRow(
  entry: FlowIndexEntry,
  capabilities: Capability[],
  flow_acl: string[] | undefined,
  currentSpaceId: string,
): SpaceHomeFlowRow {
  const localOrigin = bare(entry.origin_space_id) === bare(currentSpaceId);
  const can_run = localOrigin && canExecuteFlow(capabilities, flow_acl, entry.flow_id);
  const can_preview = localOrigin && canReadFlow(capabilities);
  return {
    flow_id: entry.flow_id,
    origin_space_id: entry.origin_space_id,
    name: entry.name,
    digest: entry.digest,
    triggers: entry.triggers,
    can_run,
    can_preview,
    manual: entry.triggers.manual === true,
    authored_here: localOrigin,
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

  const flows = [...new Map(
    allFlows
      .filter(
        (flow) =>
          canReadFlow(input.capabilities) ||
          canExecuteFlow(input.capabilities, input.flow_acl, flow.flow_id),
      )
      .map((flow) => [`${bare(flow.origin_space_id)}\0${flow.flow_id}`, flow] as const),
  ).values()]
    .map((flow) => flowRow(flow, input.capabilities, input.flow_acl, spacePrefixed))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.origin_space_id.localeCompare(right.origin_space_id) ||
        left.flow_id.localeCompare(right.flow_id),
    );

  const receiving_from = federatedFlows
    .filter(
      (f) =>
        f.origin_space_id !== spacePrefixed &&
        f.step_spaces.some((s) => s === spacePrefixed || s === spaceBare),
    )
    .map((f) => flowRow(f, input.capabilities, input.flow_acl, spacePrefixed));

  const sessions = await studio.listSessions({ space_id: spaceBare });
  const sessionTitle = new Map(sessions.map((s) => [s.session_id, s.title]));

  const active_runs: SpaceHomeRunRow[] = [];
  const recent_completed: SpaceHomeRunRow[] = [];
  const needs_attention: SpaceHomeAttentionRow[] = [];

  for (const session of sessions) {
    const runs = await studio.listRunsBySession(session.session_id);
    for (const run of runs) {
      const dto = toRunDto(run);
      const memos = run.flow_id ? await studio.listRunStepMemos(`run_${run.run_id}`) : [];
      const lifecycle = effectiveRunLifecycle(dto.lifecycle, memos);
      const row: SpaceHomeRunRow = {
        run_id: dto.run_id,
        session_id: dto.session_id,
        flow_id: dto.flow_id,
        lifecycle,
        started_at: dto.started_at,
        ended_at: dto.ended_at,
        title: sessionTitle.get(session.session_id),
      };
      if (lifecycle === "working" || lifecycle === "input-required") {
        active_runs.push(row);
      } else if (
        lifecycle === "completed" ||
        lifecycle === "failed" ||
        lifecycle === "cancelled"
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
    version: 2,
    space_id: spacePrefixed,
    needs_attention,
    active_runs,
    flows,
    receiving_from,
    recent_completed,
    index: await buildSpaceHomeIndex(studio, spaceBare),
    emittable_events: (await buildEmittableEventsCatalog(studio, spaceBare)).events,
  };
}

export async function buildSpaceRunHistory(
  studio: StudioPersistencePort,
  space_id: string,
): Promise<SpaceHomeRunRow[]> {
  const spaceBare = bare(space_id);
  const sessions = await studio.listSessions({ space_id: spaceBare });
  const sessionTitle = new Map(sessions.map((session) => [session.session_id, session.title]));
  const runs: SpaceHomeRunRow[] = [];
  for (const session of sessions) {
    for (const run of await studio.listRunsBySession(session.session_id)) {
      const dto = toRunDto(run);
      const memos = run.flow_id ? await studio.listRunStepMemos(`run_${run.run_id}`) : [];
      runs.push({
        run_id: dto.run_id,
        session_id: dto.session_id,
        flow_id: dto.flow_id,
        lifecycle: effectiveRunLifecycle(dto.lifecycle, memos),
        started_at: dto.started_at,
        ended_at: dto.ended_at,
        title: sessionTitle.get(session.session_id),
      });
    }
  }
  return runs.sort((left, right) =>
    (right.ended_at ?? right.started_at).localeCompare(left.ended_at ?? left.started_at),
  );
}

export { toSessionDto };
