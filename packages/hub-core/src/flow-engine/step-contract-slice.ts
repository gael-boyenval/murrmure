import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ListStepContractsResponse,
  StepCatalogRoute,
  StepContractCatalog,
  StepContractCatalogEntry,
  StepContractSlice,
  StepContractSliceBranch,
  StepOrchestration,
  RunStepMemo,
} from "@murrmure/contracts";
import type { InvokeStepContractContext } from "@murrmure/runtime-contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { catalogEntryForStep, flowStepContractCatalog } from "./step-catalog.js";

export function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

export function prefixedRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id : `run_${run_id}`;
}

export function activeStepContractRelPath(run_id: string): string {
  return join(".mrmr.temp", "runs", prefixedRunId(run_id), "active-step-contract.json");
}

export function activeStepContractPath(space_root: string, run_id: string): string {
  return join(space_root, activeStepContractRelPath(run_id));
}

export function stepWorkdirRelPath(run_id: string, step_id: string): string {
  return join(".mrmr.temp", "runs", prefixedRunId(run_id), "steps", step_id, "work");
}

export function stepWorkdirPath(space_root: string, run_id: string, step_id: string): string {
  return join(space_root, stepWorkdirRelPath(run_id, step_id));
}

export function renderThenHint(routes: StepCatalogRoute[]): string {
  const hints: string[] = [];
  for (const route of routes) {
    if (route.engine === "open" && route.step_id) {
      hints.push(`engine opens ${route.step_id}`);
    } else if (route.engine === "goto" && route.step_id) {
      hints.push(`engine opens ${route.step_id}`);
    } else if (route.engine === "complete_parent") {
      hints.push("complete parent");
    } else if (route.engine === "continue_parent") {
      hints.push("continue parent");
    } else if (route.engine === "fail_run" || route.fail_run) {
      hints.push("fail run");
    } else if (route.engine === "advance") {
      hints.push("run completes");
    }
  }
  return hints.join("; ") || "engine advances";
}

function buildSliceBranches(entry: StepContractCatalogEntry): Record<string, StepContractSliceBranch> {
  const branches: Record<string, StepContractSliceBranch> = {};
  for (const [name, branch] of Object.entries(entry.branches)) {
    branches[name] = {
      schema_ref: branch.schema_ref,
      schema: branch.schema,
      then: renderThenHint(branch.routes),
    };
  }
  return branches;
}

export function buildInputsFromRun(exec_context: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...((exec_context.input ?? {}) as Record<string, unknown>),
  };
  const steps = (exec_context.steps ?? {}) as Record<string, { output?: Record<string, unknown> }>;
  for (const [stepId, record] of Object.entries(steps)) {
    if (record.output) {
      merged[`steps.${stepId}.output`] = record.output;
    }
  }
  return merged;
}

function stepIteration(exec_context: Record<string, unknown>, step_id: string): number | undefined {
  const steps = (exec_context.steps ?? {}) as Record<string, { output?: Record<string, unknown> }>;
  const prior = steps[step_id]?.output;
  if (!prior) return undefined;
  const count = Number((prior as { iteration?: number }).iteration);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

export function buildStepContractSlice(input: {
  entry: StepContractCatalogEntry;
  exec_context: Record<string, unknown>;
  run_id: string;
  space_root: string;
}): StepContractSlice {
  const workdir = stepWorkdirRelPath(input.run_id, input.entry.step_id);
  const iteration = stepIteration(input.exec_context, input.entry.step_id);
  return {
    step_id: input.entry.step_id,
    parent_id: input.entry.parent_id,
    description: input.entry.description,
    role: input.entry.role,
    branches: buildSliceBranches(input.entry),
    workdir,
    iteration,
    inputs_from_run: buildInputsFromRun(input.exec_context),
  };
}

export async function writeActiveStepContract(input: {
  space_root: string;
  run_id: string;
  slice: StepContractSlice;
}): Promise<string> {
  const path = activeStepContractPath(input.space_root, input.run_id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(input.slice, null, 2)}\n`, "utf-8");
  return path;
}

export function renderAgentStepContractMarkdown(slice: StepContractSlice): string {
  const lines: string[] = [`## Active step: ${slice.step_id}`];
  if (slice.iteration && slice.iteration > 1) {
    lines[0] = `## Active step: ${slice.step_id} (iteration ${slice.iteration})`;
  }
  if (slice.description) lines.push(slice.description);
  if (slice.workdir) lines.push(`Workdir: ${slice.workdir}`);
  lines.push("");

  for (const [branchName, branch] of Object.entries(slice.branches)) {
    lines.push(
      `When ready: murrmure_resolve_step({ step_id: "${slice.step_id}", branch: "${branchName}", payload: … })`,
    );
    lines.push(`Then: ${branch.then}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function buildMurrmurePromptBindings(input: {
  slice: StepContractSlice;
  space_root: string;
  run_id: string;
}): Record<string, string> {
  return {
    run_id: prefixedRunId(input.run_id),
    space_root: input.space_root,
    agentStepContract: renderAgentStepContractMarkdown(input.slice),
    "inputs.json": JSON.stringify(input.slice.inputs_from_run ?? {}, null, 2),
  };
}

export function buildInvokeStepContractContext(input: {
  slice: StepContractSlice;
  space_root: string;
  run_id: string;
}): InvokeStepContractContext {
  return {
    slice_json: JSON.stringify(input.slice),
    contract_path: activeStepContractPath(input.space_root, input.run_id),
    workdir: stepWorkdirPath(input.space_root, input.run_id, input.slice.step_id),
    prompt_bindings: buildMurrmurePromptBindings(input),
  };
}

export function findActiveStepMemo(memos: RunStepMemo[]): RunStepMemo | undefined {
  return memos.find((m) => m.status === "working" || m.status === "awaiting_human");
}

function flowOrchestration(
  _catalog: StepContractCatalog,
  _activeEntry: StepContractCatalogEntry | undefined,
): StepOrchestration {
  return "engine-routed";
}

export async function listStepContractsForRun(
  studio: StudioPersistencePort,
  run_id: string,
  space_root?: string,
): Promise<ListStepContractsResponse | { code: string; message: string }> {
  const bare = bareRunId(run_id);
  const run = await studio.getRun(bare);
  if (!run?.flow_id) {
    return { code: "RUN_NOT_FOUND", message: "Run not found" };
  }

  const flowEntry = await studio.getFlowIndexEntry(run.flow_id, run.space_id);
  const catalog = flowStepContractCatalog(flowEntry);
  if (!catalog) {
    return { code: "STEP_CONTRACTS_REQUIRED", message: "Run flow does not use step contracts" };
  }

  const memos = await studio.listRunStepMemos(prefixedRunId(run_id));
  const activeMemo = findActiveStepMemo(memos);
  const activeEntry = activeMemo ? catalogEntryForStep(catalog, activeMemo.step_id) : undefined;

  let resolvedSpaceRoot = space_root;
  if (!resolvedSpaceRoot) {
    const bindings = await studio.getSpaceBindings(run.space_id);
    const { resolveSpaceRoot } = await import("../invoke/resolve.js");
    resolvedSpaceRoot = resolveSpaceRoot(bindings);
  }

  const active = activeEntry
    ? buildStepContractSlice({
        entry: activeEntry,
        exec_context: run.exec_context,
        run_id: prefixedRunId(run_id),
        space_root: resolvedSpaceRoot ?? ".",
      })
    : null;

  return {
    run_id: prefixedRunId(run_id),
    orchestration: flowOrchestration(catalog, activeEntry),
    active,
    callable: [],
    graph_digest: catalog.graph_digest,
  };
}
