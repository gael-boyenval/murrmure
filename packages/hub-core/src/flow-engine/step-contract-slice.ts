import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ListStepContractsResponse,
  StepCatalogRoute,
  StepContractCatalog,
  StepContractCatalogEntry,
  StepContractSlice,
  StepContractSliceBranch,
  RunStepMemo,
} from "@murrmure/contracts";
import { payloadSchemaForContract } from "@murrmure/contracts";
import type { InvokeStepContractContext } from "@murrmure/runtime-contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { catalogEntryForStep, flowStepContractCatalog, nestedCatalogChildren } from "./step-catalog.js";
import {
  artifactPathsForInputs,
  buildArtifactMurrmureBindings,
  runArtifactsFromExecContext,
} from "./step-artifacts.js";
import {
  activeContractPath,
  bareRunId,
  prefixedRunId,
  runScratchRelPath,
  stepWorkdirRel,
} from "./run-scratch-paths.js";

export function activeStepContractRelPath(run_id: string): string {
  return join(runScratchRelPath(run_id), "active-step-contract.json");
}

export function activeStepContractPath(space_root: string, run_id: string): string {
  return activeContractPath(space_root, run_id);
}

export function stepWorkdirRelPath(run_id: string, step_id: string): string {
  return stepWorkdirRel(run_id, step_id);
}

export function stepWorkdirPath(space_root: string, run_id: string, step_id: string): string {
  return join(space_root, stepWorkdirRel(run_id, step_id));
}

export function renderThenHint(routes: StepCatalogRoute[]): string {
  const hints: string[] = [];
  for (const route of routes) {
    if (route.engine === "open" && route.step_id) {
      hints.push(`engine opens ${route.step_id}`);
    } else if (route.engine === "resume" && route.step_id) {
      hints.push(`resume ${route.step_id}`);
    } else if (route.engine === "fail_run") {
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
      payload_required: branch.payload_required,
      artifact_required: branch.artifact_required,
      artifact_slots: branch.artifact_slots,
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
  const tracked = (exec_context._step_iterations ?? {}) as Record<string, unknown>;
  const trackedCount = Number(tracked[step_id]);
  if (Number.isInteger(trackedCount) && trackedCount > 0) return trackedCount;
  const steps = (exec_context.steps ?? {}) as Record<string, { output?: Record<string, unknown> }>;
  const prior = steps[step_id]?.output;
  if (!prior) return undefined;
  const count = Number((prior as { iteration?: number }).iteration);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

export function buildStepContractSlice(input: {
  entry: StepContractCatalogEntry;
  catalog?: StepContractCatalog;
  exec_context: Record<string, unknown>;
  run_id: string;
  space_root: string;
}): StepContractSlice {
  const workdir = stepWorkdirRelPath(input.run_id, input.entry.step_id);
  const iteration = stepIteration(input.exec_context, input.entry.step_id);
  const assignmentReasons = (input.exec_context._step_assignment_reasons ?? {}) as Record<string, unknown>;
  const reason = assignmentReasons[input.entry.step_id] === "resumed" ? "resumed" : "opened";
  const returnedChildren = (input.exec_context._returned_children ?? {}) as Record<string, unknown>;
  const returned = returnedChildren[input.entry.step_id];
  return {
    step_id: input.entry.step_id,
    parent_id: input.entry.parent_id,
    description: input.entry.description,
    branches: buildSliceBranches(input.entry),
    reason,
    declared_children: input.catalog
      ? nestedCatalogChildren(input.catalog, input.entry.step_id).map((entry) => entry.step_id)
      : [],
    ...(returned && typeof returned === "object"
      ? { returned_child: returned as StepContractSlice["returned_child"] }
      : {}),
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
  contract_markdown: string;
  contract_key_count?: number;
}): string {
  const lines: string[] = [
    "Protocol: murrmure.agent/v1",
    "",
    "## Contracts",
    input.contract_markdown,
  ];
  if ((input.contract_key_count ?? 1) > 1) {
    lines.push("");
    lines.push("## Discovery");
    lines.push("Retrieve full scoped contracts after a transition:");
    lines.push(`murrmure_list_step_contracts({ run_id: "${prefixedRunId(input.run_id)}" })`);
  }
  return lines.join("\n").trim();
}

const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}

function compactJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function payloadSchema(branch: StepContractSliceBranch): Record<string, unknown> {
  const projected =
    payloadSchemaForContract(branch.schema, branch.artifact_required) ?? { type: "object" };
  return { ...projected, $schema: JSON_SCHEMA_2020_12 };
}

function stringPlaceholder(schema: Record<string, unknown>): string {
  const format = typeof schema.format === "string" ? schema.format : undefined;
  const byFormat: Record<string, string> = {
    date: "2026-01-01",
    time: "12:00:00Z",
    "date-time": "2026-01-01T12:00:00Z",
    duration: "PT1H",
    email: "agent@example.com",
    hostname: "example.com",
    ipv4: "192.0.2.1",
    ipv6: "2001:db8::1",
    uuid: "00000000-0000-4000-8000-000000000000",
    uri: "https://example.com",
    "uri-reference": "/artifact",
  };
  const candidate = (format && byFormat[format]) || "value";
  const minLength =
    typeof schema.minLength === "number" && schema.minLength > candidate.length
      ? schema.minLength
      : candidate.length;
  return candidate.padEnd(minLength, "x");
}

function schemaPlaceholder(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const record = schema as Record<string, unknown>;
  if ("const" in record) return record.const;
  if (Array.isArray(record.enum) && record.enum.length > 0) return record.enum[0];
  for (const union of ["oneOf", "anyOf"] as const) {
    const options = record[union];
    if (Array.isArray(options) && options.length > 0) return schemaPlaceholder(options[0]);
  }
  const type = Array.isArray(record.type)
    ? record.type.find((candidate) => candidate !== "null")
    : record.type;
  if (type === "string") return stringPlaceholder(record);
  if (type === "integer" || type === "number") {
    if (typeof record.minimum === "number") return record.minimum;
    if (typeof record.exclusiveMinimum === "number") return record.exclusiveMinimum + 1;
    return 0;
  }
  if (type === "boolean") return true;
  if (type === "null") return null;
  if (type === "array") {
    const count =
      typeof record.minItems === "number" && record.minItems > 0 ? record.minItems : 1;
    return Array.from({ length: count }, () => schemaPlaceholder(record.items));
  }
  const properties =
    record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)
      ? (record.properties as Record<string, unknown>)
      : {};
  const required = Array.isArray(record.required)
    ? record.required.filter((key): key is string => typeof key === "string")
    : [];
  return Object.fromEntries(
    [...required]
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, schemaPlaceholder(properties[key])]),
  );
}

function artifactRequirements(branch: StepContractSliceBranch): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(branch.artifact_slots)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([slot, definition]) => [
        slot,
        {
          ...definition,
          required: branch.artifact_required.includes(slot),
          min_files: Math.max(
            definition.min_files ?? 0,
            branch.artifact_required.includes(slot) ? 1 : 0,
          ),
          max_files: definition.max_files ?? 1,
        },
      ]),
  );
}

function localArtifactExamples(branch: StepContractSliceBranch): string[] {
  const examples: string[] = [];
  for (const slot of branch.artifact_required
    .slice()
    .sort((left, right) => left.localeCompare(right))) {
    const definition = branch.artifact_slots[slot] ?? {};
    const count = Math.min(
      Math.max(definition.min_files ?? 1, 1),
      definition.max_files ?? 1,
    );
    const extension = definition.extensions?.[0] ?? "";
    for (let index = 0; index < count; index += 1) {
      const suffix = count > 1 ? `-${index + 1}` : "";
      examples.push(`{ slot: "${slot}", path: "${slot}${suffix}${extension}" }`);
    }
  }
  return examples;
}

function renderResolveCall(input: {
  run_id: string;
  step_id: string;
  branch_name: string;
  branch: StepContractSliceBranch;
  artifact_transport: "local_path" | "remote_reference";
}): string[] {
  const payload = schemaPlaceholder(payloadSchema(input.branch)) as Record<string, unknown>;
  const fields = [
    `  run_id: "${prefixedRunId(input.run_id)}",`,
    `  step_id: "${input.step_id}",`,
    `  branch: "${input.branch_name}",`,
  ];
  if (Object.keys(payload).length > 0) fields.push(`  payload: ${compactJson(payload)},`);
  if (input.branch.artifact_required.length > 0) {
    if (input.artifact_transport === "local_path") {
      const artifacts = localArtifactExamples(input.branch).join(", ");
      fields.push(`  artifacts_out: [${artifacts}],`);
    } else {
      fields.push('  upload_intent_id: "upi_authorized_artifact_reference",');
    }
  }
  fields[fields.length - 1] = fields[fields.length - 1]!.replace(/,$/, "");
  return ["murrmure_resolve_step({", ...fields, "})"];
}

export function renderAgentStepContractMarkdown(
  slice: StepContractSlice,
  input: { run_id: string; artifact_transport?: "local_path" | "remote_reference" },
): string {
  const lines: string[] = [`### Active step: ${slice.step_id}`];
  if (slice.iteration && slice.iteration > 1) {
    lines[0] = `### Active step: ${slice.step_id} (iteration ${slice.iteration})`;
  }
  if (slice.parent_id) {
    lines.push(`Parent: ${slice.parent_id} (nested child — resolve this step_id, not the parent)`);
  }
  if (slice.reason === "resumed") lines.push("Assignment reason: resumed");
  if (slice.declared_children?.length) {
    lines.push(`Declared children: ${slice.declared_children.join(", ")}`);
    lines.push("Open one child with:");
    lines.push("murrmure_open_child_step({");
    lines.push(`  run_id: "${prefixedRunId(input.run_id)}",`);
    lines.push(`  parent_step_id: "${slice.step_id}",`);
    lines.push(`  child_step_id: "${slice.declared_children[0]}",`);
    lines.push('  idempotency_key: "unique-child-open-key"');
    lines.push("})");
  }
  if (slice.returned_child) {
    lines.push(`Returned child: ${compactJson(slice.returned_child)}`);
  }
  if (slice.description) lines.push(slice.description);
  if (slice.workdir) lines.push(`Workdir: ${slice.workdir}`);
  lines.push("");

  for (const branchName of Object.keys(slice.branches).sort((left, right) => left.localeCompare(right))) {
    const branch = slice.branches[branchName]!;
    lines.push(`Branch \`${branchName}\`:`);
    lines.push(`Payload schema: ${compactJson(payloadSchema(branch))}`);
    const artifacts = artifactRequirements(branch);
    lines.push(
      `Artifact requirements: ${Object.keys(artifacts).length > 0 ? compactJson(artifacts) : "none"}`,
    );
    lines.push(`Then: ${branch.then}`);
    lines.push(
      ...renderResolveCall({
        run_id: input.run_id,
        step_id: slice.step_id,
        branch_name: branchName,
        branch,
        artifact_transport: input.artifact_transport ?? "local_path",
      }),
    );
    lines.push("");
  }

  return lines.join("\n").trim();
}

function contractStepIdFromKey(flow_name: string, contract_key: string): string | null {
  const prefix = `${flow_name}.`;
  if (!contract_key.startsWith(prefix)) return null;
  const stepId = contract_key.slice(prefix.length).trim();
  return stepId.length > 0 ? stepId : null;
}

function renderScopeEntryMarkdown(input: {
  entry: StepContractCatalogEntry;
  catalog: StepContractCatalog;
  exec_context: Record<string, unknown>;
  run_id: string;
  space_root: string;
}): string {
  const slice = buildStepContractSlice({
    entry: input.entry,
    catalog: input.catalog,
    exec_context: input.exec_context,
    run_id: input.run_id,
    space_root: input.space_root,
  });
  const lines: string[] = [`### Scoped step: ${slice.step_id}`];
  if (slice.parent_id) lines.push(`Parent: ${slice.parent_id}`);
  if (slice.description) lines.push(slice.description);
  for (const branchName of Object.keys(slice.branches).sort((left, right) => left.localeCompare(right))) {
    const branch = slice.branches[branchName]!;
    const required = branch.payload_required;
    lines.push(`- Branch \`${branchName}\`: ${branch.then}`);
    if (required.length > 0) {
      lines.push(`  Required payload: ${required.join(", ")}`);
    }
    if (branch.artifact_required.length > 0) {
      lines.push(`  Required artifacts: ${branch.artifact_required.join(", ")}`);
    }
  }
  return lines.join("\n");
}

export function renderHandlerScopeMarkdown(input: {
  catalog: StepContractCatalog;
  flow_name: string;
  contract_keys: string[];
  exec_context: Record<string, unknown>;
  run_id: string;
  space_root: string;
}): string | undefined {
  if (input.contract_keys.length <= 1) return undefined;
  const blocks: string[] = [];
  for (const key of input.contract_keys) {
    const stepId = contractStepIdFromKey(input.flow_name, key);
    if (!stepId) continue;
    const entry = catalogEntryForStep(input.catalog, stepId);
    if (!entry) continue;
    blocks.push(
      renderScopeEntryMarkdown({
        entry,
        catalog: input.catalog,
        exec_context: input.exec_context,
        run_id: input.run_id,
        space_root: input.space_root,
      }),
    );
  }
  if (blocks.length === 0) return undefined;
  return ["## Handler scope", ...blocks].join("\n\n");
}

export function buildMurrmurePromptBindings(input: {
  slice: StepContractSlice;
  space_root: string;
  run_id: string;
  exec_context?: Record<string, unknown>;
  handler_scope_contract?: string;
  artifact_transport?: "local_path" | "remote_reference";
}): Record<string, string> {
  const activeStepContract = renderAgentStepContractMarkdown(input.slice, {
    run_id: input.run_id,
    artifact_transport: input.artifact_transport,
  });
  const combinedContract = input.handler_scope_contract?.trim()
    ? `${input.handler_scope_contract.trim()}\n\n${activeStepContract}`
    : activeStepContract;
  const bindings: Record<string, string> = {
    run_id: prefixedRunId(input.run_id),
    space_root: input.space_root,
    agentStepContract: combinedContract,
    "inputs.json": JSON.stringify(input.slice.inputs_from_run ?? {}, null, 2),
  };
  if (input.handler_scope_contract?.trim()) {
    bindings.handlerScopeContract = input.handler_scope_contract.trim();
  }
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
  handler_scope_contract?: string;
  hub_token?: string;
  hub_url?: string;
  contract_key_count?: number;
  artifact_transport?: "local_path" | "remote_reference";
}): InvokeStepContractContext {
  const prompt_bindings = buildMurrmurePromptBindings(input);
  prompt_bindings.contractKeyCount = String(input.contract_key_count ?? 1);
  const artifacts = input.exec_context ? runArtifactsFromExecContext(input.exec_context) : {};
  return {
    slice_json: JSON.stringify(input.slice),
    contract_path: activeStepContractPath(input.space_root, input.run_id),
    workdir: stepWorkdirPath(input.space_root, input.run_id, input.slice.step_id),
    prompt_bindings,
    run_artifacts_json: Object.keys(artifacts).length > 0 ? JSON.stringify(artifacts) : undefined,
    hub_token: input.hub_token,
    hub_url: input.hub_url,
    contract_key_count: input.contract_key_count ?? 1,
  };
}

export function findActiveStepMemo(memos: RunStepMemo[]): RunStepMemo | undefined {
  const active = memos.filter((m) => m.status === "working");
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
  input: {
    run_id: string;
    step_id: string;
    space_root: string;
    contract_keys?: string[];
    hub_token?: string;
    hub_url?: string;
    artifact_transport?: "local_path" | "remote_reference";
  },
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
    catalog,
    exec_context: run.exec_context,
    run_id: prefixedRunId(input.run_id),
    space_root: input.space_root,
  });
  const handlerScopeContract =
    flowEntry?.name && input.contract_keys?.length
      ? renderHandlerScopeMarkdown({
          catalog,
          flow_name: flowEntry.name,
          contract_keys: input.contract_keys,
          exec_context: run.exec_context,
          run_id: prefixedRunId(input.run_id),
          space_root: input.space_root,
        })
      : undefined;
  return buildInvokeStepContractContext({
    slice,
    space_root: input.space_root,
    run_id: input.run_id,
    exec_context: run.exec_context,
    handler_scope_contract: handlerScopeContract,
    hub_token: input.hub_token,
    hub_url: input.hub_url,
    contract_key_count: Math.max(1, input.contract_keys?.length ?? 0),
    artifact_transport: input.artifact_transport,
  });
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
        catalog,
        exec_context: run.exec_context,
        run_id: prefixedRunId(run_id),
        space_root: resolvedSpaceRoot ?? ".",
      })
    : null;
  const callable = activeEntry
    ? nestedCatalogChildren(catalog, activeEntry.step_id).map((entry) =>
        buildStepContractSlice({
          entry,
          catalog,
          exec_context: run.exec_context,
          run_id: prefixedRunId(run_id),
          space_root: resolvedSpaceRoot ?? ".",
        }))
    : [];

  return {
    run_id: prefixedRunId(run_id),
    active,
    callable,
    graph_digest: catalog.graph_digest,
  };
}
