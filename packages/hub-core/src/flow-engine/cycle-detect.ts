import type { FlowManifest, SpaceApplyBundle } from "@murrmure/contracts";

export const FLOW_CALL_CYCLE = "FLOW_CALL_CYCLE";

function flowIdFromName(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `flw_${slug || "unnamed"}`;
}

/** Collect start_flow targets from a manifest (including parallel lanes). */
export function collectStartFlowTargets(manifest: FlowManifest): string[] {
  const targets: string[] = [];
  const walk = (steps: FlowManifest["steps"]) => {
    for (const step of steps) {
      if (step.start_flow?.flow_id) targets.push(step.start_flow.flow_id);
      if (step.parallel?.lane) walk(step.parallel.lane as FlowManifest["steps"]);
    }
  };
  walk(manifest.steps);
  return targets;
}

/** Build adjacency list flow_id → [target flow_ids] for all flows in a bundle. */
export function buildFlowCallGraph(
  flows: Array<{ flow_id?: string; manifest: FlowManifest }>,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const flow of flows) {
    const flowId = flow.flow_id || flowIdFromName(flow.manifest.name);
    graph.set(flowId, collectStartFlowTargets(flow.manifest));
  }
  return graph;
}

/** DFS cycle detection; returns cycle path if found. */
export function detectCycleInGraph(graph: Map<string, string[]>): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string): string[] | null => {
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      return cycleStart >= 0 ? [...path.slice(cycleStart), node] : [node, node];
    }
    if (visited.has(node)) return null;
    visiting.add(node);
    path.push(node);
    for (const target of graph.get(node) ?? []) {
      const cycle = dfs(target);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };

  for (const node of graph.keys()) {
    const cycle = dfs(node);
    if (cycle) return cycle;
  }
  return null;
}

export function detectFlowCallCycles(
  bundle: Pick<SpaceApplyBundle, "flows">,
): { ok: true } | { ok: false; code: string; message: string; cycle?: string[] } {
  const flows = bundle.flows ?? [];
  if (!flows.length) return { ok: true };

  const graph = buildFlowCallGraph(flows);
  const cycle = detectCycleInGraph(graph);
  if (cycle) {
    return {
      ok: false,
      code: FLOW_CALL_CYCLE,
      message: `Flow-call cycle detected: ${cycle.join(" → ")}`,
      cycle,
    };
  }
  return { ok: true };
}
