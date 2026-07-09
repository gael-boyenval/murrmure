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
import {
  artifactPathsForInputs,
  buildArtifactMurrmureBindings,
  runArtifactsFromExecContext,
} from "./step-artifacts.js";

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
    ...artifactPathsForInputs(exec_context),
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

export function renderMurrmureProtocolEnvelope(input: {
  run_id: string;
  session_id?: string;
  space_id?: string;
  action_name: string;
  space_root: string;
  contract_markdown: string;
  contract_path?: string;
  workdir?: string;
}): string {
  const lines: string[] = [
    "# Murrmure protocol (auto-generated — authoritative)",
    "",
    "Use the **Task** section for what to build or change. Use this section for how to interact with Murrmure.",
    "If the run is cancelled, failed, or completed, stop immediately — do not keep working.",
    "",
    "## Session",
    `- **Run:** ${input.run_id}`,
  ];
  if (input.session_id) lines.push(`- **Session:** ${input.session_id}`);
  if (input.space_id) lines.push(`- **Space:** ${input.space_id}`);
  lines.push(`- **Action:** ${input.action_name}`);
  lines.push(`- **Space root:** ${input.space_root}`);
  if (input.workdir) lines.push(`- **Step workdir:** ${input.workdir}`);
  if (input.contract_path) {
    lines.push(`- **Active contract file:** ${input.contract_path}`);
  }
  lines.push("");
  lines.push("## Step contract");
  lines.push(input.contract_markdown);
  lines.push("");
  lines.push("## Discovery");
  lines.push(
    "After each engine transition, re-read the active contract file above (or `MURRMURE_ACTIVE_STEP_CONTRACT_PATH`).",
  );
  lines.push("Structured JSON is also in `MURRMURE_STEP_CONTRACT`; workdir in `MURRMURE_STEP_WORKDIR`.");
  lines.push("");
  lines.push("## Resolve API");
  lines.push("- `murrmure_resolve_step` — close the active agent-owned step with a branch + payload.");
  lines.push("- `murrmure_wait_for_run` — block until human steps finish (long-lived build sessions only).");
  lines.push("- Never resolve human-owned steps (`awaiting_human`).");
  return lines.join("\n").trim();
}

export function renderAgentStepContractMarkdown(slice: StepContractSlice): string {
  const lines: string[] = [`## Active step: ${slice.step_id}`];
  if (slice.iteration && slice.iteration > 1) {
    lines[0] = `## Active step: ${slice.step_id} (iteration ${slice.iteration})`;
  }
  if (slice.parent_id) {
    lines.push(`Parent: ${slice.parent_id} (nested child — resolve this step_id, not the parent)`);
  }
  if (slice.description) lines.push(slice.description);
  if (slice.workdir) lines.push(`Workdir: ${slice.workdir}`);
  lines.push("");

  for (const [branchName, branch] of Object.entries(slice.branches)) {
    const required =
      branch.schema &&
      typeof branch.schema === "object" &&
      Array.isArray((branch.schema as { required?: unknown }).required)
        ? ((branch.schema as { required: string[] }).required ?? [])
        : [];
    const payloadHint =
      required.length > 0
        ? `{ ${required.map((k) => `${k}: …`).join(", ")} }`
        : "{ … }";
    lines.push(
      `When ready: murrmure_resolve_step({ run_id: "<run_id>", step_id: "${slice.step_id}", branch: "${branchName}", payload: ${payloadHint} })`,
    );
    if (required.length > 0) {
      lines.push(`Required payload: ${required.join(", ")}`);
    }
    lines.push(`Then: ${branch.then}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function buildMurrmurePromptBindings(input: {
  slice: StepContractSlice;
  space_root: string;
  run_id: string;
  exec_context?: Record<string, unknown>;
}): Record<string, string> {
  const bindings: Record<string, string> = {
    run_id: prefixedRunId(input.run_id),
    space_root: input.space_root,
    agentStepContract: renderAgentStepContractMarkdown(input.slice),
    "inputs.json": JSON.stringify(input.slice.inputs_from_run ?? {}, null, 2),
  };
  if (input.slice.description) {
    bindings[`step.${input.slice.step_id}.description`] = input.slice.description;
  }
  if (input.slice.workdir) {
    bindings[`step.${input.slice.step_id}.workdir`] = input.slice.workdir;
  }
  if (input.slice.iteration != null) {
    bindings[`step.${input.slice.step_id}.iteration`] = String(input.slice.iteration);
  }
  if (input.exec_context) {
    Object.assign(bindings, buildArtifactMurrmureBindings(runArtifactsFromExecContext(input.exec_context)));
  }
  return bindings;
}

export function buildInvokeStepContractContext(input: {
  slice: StepContractSlice;
  space_root: string;
  run_id: string;
  exec_context?: Record<string, unknown>;
}): InvokeStepContractContext {
  const prompt_bindings = buildMurrmurePromptBindings(input);
  const artifacts = input.exec_context ? runArtifactsFromExecContext(input.exec_context) : {};
  return {
    slice_json: JSON.stringify(input.slice),
    contract_path: activeStepContractPath(input.space_root, input.run_id),
    workdir: stepWorkdirPath(input.space_root, input.run_id, input.slice.step_id),
    prompt_bindings,
    run_artifacts_json: Object.keys(artifacts).length > 0 ? JSON.stringify(artifacts) : undefined,
  };
}

export function findActiveStepMemo(memos: RunStepMemo[]): RunStepMemo | undefined {
  const active = memos.filter((m) => m.status === "working" || m.status === "awaiting_human");
  if (active.length === 0) return undefined;
  return active.sort((a, b) => b.step_id.split(".").length - a.step_id.split(".").length)[0];
}

/** Shell invoke on a parent executor step should inject the active nested child contract. */
export function resolveInvokeContractStepId(
  executor_step_id: string,
  memos: RunStepMemo[],
): string {
  const nestedWorking = memos
    .filter(
      (m) => m.status === "working" && m.step_id.startsWith(`${executor_step_id}.`),
    )
    .sort((a, b) => b.step_id.length - a.step_id.length);
  return nestedWorking[0]?.step_id ?? executor_step_id;
}

export async function buildFlowInvokeStepContract(
  studio: StudioPersistencePort,
  input: { run_id: string; step_id: string; space_root: string },
): Promise<InvokeStepContractContext | undefined> {
  const bare = bareRunId(input.run_id);
  const run = await studio.getRun(bare);
  if (!run?.flow_id) return undefined;
  const flowEntry = await studio.getFlowIndexEntry(run.flow_id, run.space_id);
  const catalog = flowStepContractCatalog(flowEntry);
  if (!catalog) return undefined;
  const memos = await studio.listRunStepMemos(prefixedRunId(input.run_id));
  const contractStepId = resolveInvokeContractStepId(input.step_id, memos);
  const entry = catalogEntryForStep(catalog, contractStepId);
  if (!entry) return undefined;
  const slice = buildStepContractSlice({
    entry,
    exec_context: run.exec_context,
    run_id: prefixedRunId(input.run_id),
    space_root: input.space_root,
  });
  return buildInvokeStepContractContext({
    slice,
    space_root: input.space_root,
    run_id: input.run_id,
    exec_context: run.exec_context,
  });
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
  if (!resolvedSpaceRoot && run.space_id) {
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
