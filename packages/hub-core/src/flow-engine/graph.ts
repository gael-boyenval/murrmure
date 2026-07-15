import type {
  FlowIr,
  FlowStepIr,
  OpenStepResolver,
  RunLifecycle,
  RunStepMemo,
  StepArtifactSlot,
  StepCatalogRoute,
  StepContractCatalog,
} from "@murrmure/contracts";
import { buildStepDispatch } from "./advance.js";
import type { FlowStepDispatch } from "./types.js";
import { topLevelCatalogSteps } from "./step-catalog.js";

export interface RunGraphLane {
  step_id: string;
  matrix_index: number;
  run_id: string;
  lifecycle: RunLifecycle;
  label?: string;
}

export interface RunGraphNode {
  id: string;
  step_id: string;
  kind: string;
  status?: RunStepMemo["status"];
  run_id?: string;
  federated?: boolean;
  remote_label?: string;
  parent_step_id?: string;
  metadata?: RunGraphStepMetadata;
}

export interface RunGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  tone?: "default" | "failure";
  route_kind?: "open" | "advance" | "fail_run" | "resume";
}

export interface RunGraphBranchMetadata {
  branch: string;
  schema_ref?: string;
  schema?: Record<string, unknown>;
  payload_required: string[];
  artifact_required: string[];
  artifact_slots: Record<string, StepArtifactSlot>;
  routes: StepCatalogRoute[];
}

export interface RunGraphResolver extends OpenStepResolver {
  config_digest: string;
}

export interface RunGraphStepMetadata {
  description?: string;
  branches: RunGraphBranchMetadata[];
  resolver: RunGraphResolver | null;
  resolver_source: "current" | "dispatch";
}

export interface RunGraphResponse {
  run_id: string;
  flow_id?: string | null;
  flow_digest?: string;
  origin_space_id?: string;
  flow_name?: string;
  mode: "preview" | "live" | "history";
  nodes: RunGraphNode[];
  edges: RunGraphEdge[];
  lanes: RunGraphLane[];
  step_memos: RunStepMemo[];
}

export interface RunGraphSibling {
  run_id: string;
  lifecycle: RunLifecycle;
  matrix_index?: number;
  matrix_step_id?: string;
  exec_context: Record<string, unknown>;
}

export function buildRunGraph(input: {
  run_id: string;
  flow_id?: string | null;
  flow_digest?: string;
  ir?: FlowIr;
  step_contract_catalog?: StepContractCatalog | null;
  step_memos: RunStepMemo[];
  siblings?: RunGraphSibling[];
  origin_space_id?: string;
  flow_name?: string;
  mode?: "preview" | "live" | "history";
  resolvers?: Record<string, RunGraphResolver | null>;
}): RunGraphResponse {
  if (input.step_contract_catalog?.entries.length) {
    return buildStepContractRunGraph({
      ...input,
      step_contract_catalog: input.step_contract_catalog,
    });
  }

  const nodes: RunGraphNode[] = [];
  const edges: RunGraphEdge[] = [];
  const lanes: RunGraphLane[] = [];
  const memoByStep = new Map(input.step_memos.map((m) => [m.step_id, m]));

  if (input.ir) {
    let prevId: string | undefined;
    for (const step of input.ir.steps) {
      if (step.kind === "parallel" && step.parallel) {
        const forkId = `fork:${step.id}`;
        nodes.push({ id: forkId, step_id: step.id, kind: "fork", status: memoByStep.get(step.id)?.status });
        if (prevId) edges.push({ id: `${prevId}->${forkId}`, source: prevId, target: forkId });

        const laneNodes = (input.siblings ?? []).filter(
          (s) => s.matrix_step_id === step.id || s.exec_context._matrix_step_id === step.id,
        );
        for (const sibling of laneNodes) {
          const laneId = `lane:${step.id}:${sibling.matrix_index ?? sibling.exec_context._matrix_index ?? 0}`;
          nodes.push({
            id: laneId,
            step_id: step.id,
            kind: "lane",
            status: lifecycleToMemoStatus(sibling.lifecycle),
            run_id: sibling.run_id,
          });
          edges.push({ id: `${forkId}->${laneId}`, source: forkId, target: laneId });
          lanes.push({
            step_id: step.id,
            matrix_index: Number(sibling.matrix_index ?? sibling.exec_context._matrix_index ?? 0),
            run_id: sibling.run_id,
            lifecycle: sibling.lifecycle,
            label: laneLabel(sibling.exec_context.item),
          });
        }

        const joinId = `join:${step.id}`;
        nodes.push({ id: joinId, step_id: step.id, kind: "join", status: memoByStep.get(step.id)?.status });
        for (const lane of lanes.filter((l) => l.step_id === step.id)) {
          edges.push({
            id: `${lane.run_id}->${joinId}`,
            source: `lane:${step.id}:${lane.matrix_index}`,
            target: joinId,
          });
        }
        prevId = joinId;
        continue;
      }

      const nodeId = `step:${step.id}`;
      nodes.push({
        id: nodeId,
        step_id: step.id,
        kind: step.kind,
        status: memoByStep.get(step.id)?.status,
      });
      if (step.kind === "start_flow") {
        const childRun = (input.siblings ?? []).find(
          (s) => s.exec_context._parent_step_id === step.id,
        );
        if (childRun) {
          const childNodeId = `child:${step.id}:${childRun.run_id}`;
          nodes.push({
            id: childNodeId,
            step_id: step.id,
            kind: "child_run",
            status: lifecycleToMemoStatus(childRun.lifecycle),
            run_id: childRun.run_id,
          });
          edges.push({ id: `${nodeId}->${childNodeId}`, source: nodeId, target: childNodeId });
        }
      }
      if (prevId) edges.push({ id: `${prevId}->${nodeId}`, source: prevId, target: nodeId });
      prevId = nodeId;
    }
  } else {
    for (const memo of input.step_memos) {
      const federated = memo.executor_type === "remote_hub";
      nodes.push({
        id: `step:${memo.step_id}`,
        step_id: memo.step_id,
        kind: memo.step_id.startsWith("hook:") ? "hook" : "action",
        status: memo.status,
        federated,
        remote_label: federated ? "Remote space" : undefined,
      });
    }
  }

  return {
    run_id: input.run_id,
    flow_id: input.flow_id,
    flow_digest: input.flow_digest,
    origin_space_id: input.origin_space_id,
    flow_name: input.flow_name,
    mode: input.mode ?? "live",
    nodes,
    edges,
    lanes,
    step_memos: input.step_memos,
  };
}

function buildStepContractRunGraph(input: {
  run_id: string;
  flow_id?: string | null;
  flow_digest?: string;
  step_contract_catalog: StepContractCatalog;
  step_memos: RunStepMemo[];
  origin_space_id?: string;
  flow_name?: string;
  mode?: "preview" | "live" | "history";
  resolvers?: Record<string, RunGraphResolver | null>;
}): RunGraphResponse {
  const catalog = input.step_contract_catalog;
  const memoByStep = new Map(input.step_memos.map((m) => [m.step_id, m]));
  const nodes: RunGraphNode[] = [];
  const edges: RunGraphEdge[] = [];
  const entriesById = new Map(catalog.entries.map((entry) => [entry.step_id, entry]));
  const hasFailureRoute = catalog.entries.some((entry) =>
    Object.values(entry.branches).some((branch) =>
      branch.routes.some((route) => route.engine === "fail_run"),
    ),
  );

  const metadataFor = (step: (typeof catalog.entries)[number]): RunGraphStepMetadata => ({
    description: step.description,
    branches: Object.entries(step.branches).map(([branch, definition]) => ({
      branch,
      schema_ref: definition.schema_ref,
      schema: definition.schema,
      payload_required: definition.payload_required,
      artifact_required: definition.artifact_required,
      artifact_slots: definition.artifact_slots,
      routes: definition.routes,
    })),
    resolver: input.resolvers?.[step.step_id] ?? null,
    resolver_source: input.mode === "preview" ? "current" : "dispatch",
  });
  const isPlainDefaultStep = (step: (typeof catalog.entries)[number]): boolean =>
    Object.keys(step.branches).length === 2 &&
    Object.hasOwn(step.branches, "completed") &&
    Object.hasOwn(step.branches, "failed");

  for (const step of catalog.entries) {
    nodes.push({
      id: `step:${step.step_id}`,
      step_id: step.step_id,
      kind: "step_contract",
      status: memoByStep.get(step.step_id)?.status,
      parent_step_id: step.parent_id ?? undefined,
      metadata: metadataFor(step),
    });
    if (!isPlainDefaultStep(step)) {
      nodes.push({
        id: `decision:${step.step_id}`,
        step_id: step.step_id,
        kind: "decision",
      });
    }
  }

  if (hasFailureRoute) {
    nodes.push({
      id: "terminal:failed",
      step_id: "run.failed",
      kind: "failure_terminal",
    });
  }

  const targetForRoute = (route: StepCatalogRoute): string | undefined => {
    if (route.engine === "fail_run") return "terminal:failed";
    if (route.step_id && entriesById.has(route.step_id)) return `step:${route.step_id}`;
    return undefined;
  };

  for (const step of catalog.entries) {
    const branchEntries = Object.entries(step.branches);
    const isPlainDefault = isPlainDefaultStep(step);
    const sourceId = `step:${step.step_id}`;
    const branchSourceId = isPlainDefault ? sourceId : `decision:${step.step_id}`;

    if (!isPlainDefault) {
      edges.push({
        id: `${sourceId}->${branchSourceId}`,
        source: sourceId,
        target: branchSourceId,
      });
    }

    for (const [branchName, branch] of branchEntries) {
      for (const [routeIndex, route] of branch.routes.entries()) {
        const target = targetForRoute(route);
        if (!target || target === sourceId) continue;
        const failure = route.engine === "fail_run";
        edges.push({
          id: `${branchSourceId}->${target}:${branchName}:${routeIndex}`,
          source: branchSourceId,
          target,
          ...(!isPlainDefault || branchName !== "completed" ? { label: branchName } : {}),
          ...(failure ? { tone: "failure" as const } : {}),
          ...(route.engine ? { route_kind: route.engine } : {}),
        });
      }
    }
  }

  // Catalogs from older runs may not carry explicit `open` routes. Preserve a
  // truthful compact chain only when no branch route describes that transition.
  const topLevel = topLevelCatalogSteps(catalog);
  for (let index = 0; index < topLevel.length - 1; index += 1) {
    const source = topLevel[index]!;
    const target = topLevel[index + 1]!;
    const alreadyRouted = edges.some(
      (edge) =>
        (edge.source === `step:${source.step_id}` ||
          edge.source === `decision:${source.step_id}`) &&
        edge.target === `step:${target.step_id}`,
    );
    if (!alreadyRouted) {
      edges.push({
        id: `step:${source.step_id}->step:${target.step_id}:catalog-order`,
        source: `step:${source.step_id}`,
        target: `step:${target.step_id}`,
      });
    }
  }

  return {
    run_id: input.run_id,
    flow_id: input.flow_id,
    flow_digest: input.flow_digest,
    origin_space_id: input.origin_space_id,
    flow_name: input.flow_name,
    mode: input.mode ?? "live",
    nodes,
    edges,
    lanes: [],
    step_memos: input.step_memos,
  };
}

function lifecycleToMemoStatus(lifecycle: RunLifecycle): RunStepMemo["status"] {
  switch (lifecycle) {
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
    case "input-required":
      return "working";
    default:
      return "working";
  }
}

function laneLabel(item: unknown): string | undefined {
  if (item && typeof item === "object" && "space" in item) {
    return String((item as { space: unknown }).space);
  }
  if (typeof item === "string") return item;
  return undefined;
}

export function planLaneDispatches(
  laneSteps: FlowStepIr[],
  execContext: Record<string, unknown>,
  originSpaceId: string,
): FlowStepDispatch[] {
  const dispatches: FlowStepDispatch[] = [];
  for (let i = 0; i < laneSteps.length; i++) {
    const step = laneSteps[i]!;
    if (step.kind !== "invoke" || !step.invoke) continue;
    const ir = {
      flow_id: "flw_lane",
      name: "lane",
      digest: "lane",
      triggers: {},
      steps: laneSteps,
    } as FlowIr;
    const dispatch = buildStepDispatch(ir, i, execContext, originSpaceId);
    if (dispatch) dispatches.push(dispatch);
    break;
  }
  return dispatches;
}
