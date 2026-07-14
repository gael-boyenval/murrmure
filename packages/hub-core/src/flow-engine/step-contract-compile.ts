import type {
  FlowManifest,
  FlowStep,
  StepBranchDefinition,
  StepContractCatalog,
  StepContractCatalogEntry,
  StepContractManifestStep,
  StepCatalogBranch,
  StepCatalogRoute,
} from "@murrmure/contracts";
import { assertSupportedPayloadSchema, partitionRequiredFields } from "@murrmure/contracts";
import { computeContentDigest } from "../index/digest.js";
import type { ParseResult } from "../index/parse-result.js";

export const STEP_CONTRACT_MIGRATION_DOC =
  "studio-specs/current/bridges/step-contract.md";

export const KNOWN_MURRMURE_TOKENS = new Set([
  "run_id",
  "space_root",
  "agentStepContract",
  "inputs.json",
]);

const MURRMURE_TOKEN_PATTERN = /\{\{murrmure\.([^}]+)\}\}/g;

const QUALIFIED_STEP_TOKEN_PATTERN =
  /^step\.([a-zA-Z0-9_.-]+)\.(description|workdir|iteration)$/;

const QUALIFIED_ARTIFACT_TOKEN_PATTERN =
  /^step\.([a-zA-Z0-9_.-]+)\.artifact\.([a-zA-Z0-9_-]+)\.(path|transfer_id)$/;

export interface StepContractLintWarning {
  flow_id: string;
  step_id?: string;
  code: string;
  message: string;
}

export interface StepContractCompileResult {
  catalog: StepContractCatalog | null;
  warnings: StepContractLintWarning[];
}

const LEGACY_STEP_KEYS = ["invoke", "checkpoint", "gate"] as const;

/** Removed authoring keys that the clean target rejects with no dual parser. */
const REMOVED_STEP_KEYS = [
  "role",
  "presentation",
  "orchestration",
  "deriveRole",
  "executor",
  "next",
  "fail_run",
  "complete",
  "continue",
  "goto",
  "fail",
] as const;

const REMOVED_BRANCH_KEYS = [
  "next",
  "fail_run",
  "complete",
  "continue",
  "goto",
  "fail",
  "payload",
  "outcome",
] as const;

const BRANCH_WRAPPER_KEYS = ["payload", "outcome"] as const;

export function scanRawLegacyStepKinds(
  raw: unknown,
): Array<{ step_id: string; key: (typeof LEGACY_STEP_KEYS)[number] }> {
  if (!raw || typeof raw !== "object") return [];
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];

  const hits: Array<{ step_id: string; key: (typeof LEGACY_STEP_KEYS)[number] }> = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const record = step as Record<string, unknown>;
    const stepId = typeof record.id === "string" ? record.id : "(unknown)";
    for (const key of LEGACY_STEP_KEYS) {
      if (key in record && record[key] !== undefined) {
        hits.push({ step_id: stepId, key });
      }
    }
    const parallel = record.parallel as { lane?: unknown[] } | undefined;
    if (Array.isArray(parallel?.lane)) {
      for (const lane of parallel.lane) {
        if (!lane || typeof lane !== "object") continue;
        const laneRecord = lane as Record<string, unknown>;
        const laneId = typeof laneRecord.id === "string" ? laneRecord.id : "(unknown)";
        if (laneRecord.invoke !== undefined) hits.push({ step_id: laneId, key: "invoke" });
        if (laneRecord.gate !== undefined) hits.push({ step_id: laneId, key: "gate" });
      }
    }
  }
  return hits;
}

export function rejectLegacyStepKinds(raw: unknown): ParseResult<unknown> {
  const hits = scanRawLegacyStepKinds(raw);
  if (hits.length === 0) return { ok: true, value: raw };
  const first = hits[0]!;
  return {
    ok: false,
    code: "LEGACY_STEP_KIND",
    message: `Step '${first.step_id}' uses deprecated '${first.key}:' — migrate to unified step contracts (${STEP_CONTRACT_MIGRATION_DOC})`,
  };
}

interface RemovedFieldHit {
  step_id: string;
  branch?: string;
  key: string;
  kind: "step" | "branch";
}

export function scanRawRemovedFields(raw: unknown): RemovedFieldHit[] {
  if (!raw || typeof raw !== "object") return [];
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  const hits: RemovedFieldHit[] = [];

  const visitStep = (step: unknown, idPrefix: string | null): void => {
    if (!step || typeof step !== "object") return;
    const record = step as Record<string, unknown>;
    const stepId = typeof record.id === "string" ? record.id : "(unknown)";
    const qualifiedId = idPrefix ? `${idPrefix}.${stepId}` : stepId;
    for (const key of REMOVED_STEP_KEYS) {
      if (key in record && record[key] !== undefined) {
        hits.push({ step_id: qualifiedId, key, kind: "step" });
      }
    }
    const branches = record.branches;
    if (branches && typeof branches === "object" && !Array.isArray(branches)) {
      for (const [branchName, branch] of Object.entries(
        branches as Record<string, unknown>,
      )) {
        if (!branch || typeof branch !== "object") continue;
        for (const key of REMOVED_BRANCH_KEYS) {
          if (key in (branch as Record<string, unknown>) && (branch as Record<string, unknown>)[key] !== undefined) {
            hits.push({ step_id: qualifiedId, branch: branchName, key, kind: "branch" });
          }
        }
      }
    }
    const children = record.steps;
    if (Array.isArray(children)) {
      for (const child of children) visitStep(child, qualifiedId);
    }
  };

  for (const step of steps) visitStep(step, null);
  return hits;
}

export function rejectRemovedFields(raw: unknown): ParseResult<unknown> {
  const hits = scanRawRemovedFields(raw);
  if (hits.length === 0) return { ok: true, value: raw };
  const first = hits[0]!;
  const where =
    first.kind === "branch"
      ? `Step '${first.step_id}' branch '${first.branch}'`
      : `Step '${first.step_id}'`;
  const wrapper = BRANCH_WRAPPER_KEYS.includes(first.key as (typeof BRANCH_WRAPPER_KEYS)[number])
    ? ` uses removed wrapper '${first.key}:' — keep schema/artifact_slots/route/resume flat`
    : ` uses removed '${first.key}:' — see ${STEP_CONTRACT_MIGRATION_DOC}`;
  return {
    ok: false,
    code: "REMOVED_FIELD",
    message: `${where}${wrapper}`,
  };
}

/** A step is a step contract unless it is a parallel or start_flow step. */
export function isStepContractStep(step: FlowStep | StepContractManifestStep): boolean {
  if ((step as FlowStep).parallel || (step as FlowStep).start_flow) return false;
  for (const key of LEGACY_STEP_KEYS) {
    if (key in step && (step as Record<string, unknown>)[key] !== undefined) return false;
  }
  return true;
}

export function manifestUsesStepContracts(manifest: FlowManifest): boolean {
  const walk = (steps: Array<FlowStep | StepContractManifestStep>): boolean => {
    for (const step of steps) {
      if (isStepContractStep(step)) return true;
      if (step.steps?.length && walk(step.steps)) return true;
    }
    return false;
  };
  return walk(manifest.steps);
}

export function findLegacyStepKinds(
  manifest: FlowManifest,
): Array<{ step_id: string; key: (typeof LEGACY_STEP_KEYS)[number] }> {
  const hits: Array<{ step_id: string; key: (typeof LEGACY_STEP_KEYS)[number] }> = [];
  for (const step of manifest.steps) {
    for (const key of LEGACY_STEP_KEYS) {
      if (key in step && (step as Record<string, unknown>)[key] !== undefined) {
        hits.push({ step_id: step.id, key });
      }
    }
    if (step.parallel?.lane) {
      for (const lane of step.parallel.lane) {
        if (lane.invoke) hits.push({ step_id: lane.id, key: "invoke" });
        if (lane.gate) hits.push({ step_id: lane.id, key: "gate" });
      }
    }
  }
  return hits;
}

function schemaRefForBranch(branchName: string, branch: StepBranchDefinition): string | undefined {
  if (branch.schema_ref) return branch.schema_ref;
  if (typeof branch.schema === "string") return branch.schema;
  if (branch.schema && typeof branch.schema === "object") {
    return `murrmure.schemas/inline.${branchName}.v1.json`;
  }
  return undefined;
}

interface FlatStep {
  step: StepContractManifestStep;
  qualifiedId: string;
  parentId: string | null;
  isNested: boolean;
  /** Next top-level sibling id in manifest order (top-level only). */
  nextSiblingId: string | null;
}

function flattenManifestSteps(
  steps: StepContractManifestStep[],
  parentId: string | null,
  parentQualifiedPrefix: string | null,
  topLevelOrder: string[],
  out: FlatStep[],
): void {
  for (const step of steps) {
    const qualifiedId = parentQualifiedPrefix ? `${parentQualifiedPrefix}.${step.id}` : step.id;
    const isNested = parentId !== null;
    const nextSiblingId = !isNested ? nextTopLevelSibling(topLevelOrder, step.id) : null;
    out.push({ step, qualifiedId, parentId, isNested, nextSiblingId });
    if (step.steps?.length) {
      flattenManifestSteps(step.steps, qualifiedId, qualifiedId, topLevelOrder, out);
    }
  }
}

function nextTopLevelSibling(topLevelOrder: string[], stepId: string): string | null {
  const idx = topLevelOrder.indexOf(stepId);
  if (idx < 0 || idx + 1 >= topLevelOrder.length) return null;
  return topLevelOrder[idx + 1]!;
}

/**
 * Inject `completed` / `failed` defaults for steps with omitted `branches`.
 * Omission alone receives defaults; explicit maps (including empty) are exact.
 */
function applyDefaultBranches(steps: StepContractManifestStep[]): void {
  for (const step of steps) {
    if (step.branches === undefined) {
      step.branches = {
        completed: { schema: { type: "object" } },
        failed: { schema: { type: "object" } },
      };
    }
    if (step.steps?.length) applyDefaultBranches(step.steps);
  }
}

function compileBranchRoutes(
  branch: StepBranchDefinition,
  row: FlatStep,
  knownStepIds: Set<string>,
  topLevelIds: Set<string>,
  warnings: StepContractLintWarning[],
  flowId: string,
): StepCatalogRoute[] {
  if (branch.resume) {
    if (!isAncestorOf(row, branch.resume, knownStepIds)) {
      warnings.push({
        flow_id: flowId,
        step_id: row.qualifiedId,
        code: "RESUME_TARGET_NOT_ANCESTOR",
        message: `resume target '${branch.resume}' is not an open ancestor of '${row.qualifiedId}'`,
      });
    }
    return [{ engine: "resume", step_id: branch.resume }];
  }

  if (branch.route) {
    if (typeof branch.route.step === "string") {
      if (!knownStepIds.has(branch.route.step)) {
        warnings.push({
          flow_id: flowId,
          step_id: row.qualifiedId,
          code: "ROUTE_TARGET_NOT_FOUND",
          message: `route.step '${branch.route.step}' is not a known step id`,
        });
      }
      return [{ engine: "open", step_id: branch.route.step }];
    }
    if (branch.route.run === "completed") return [{ engine: "advance" }];
    if (branch.route.run === "failed") return [{ engine: "fail_run" }];
  }

  // No authored route/resume: apply control defaults by name and scope.
  if (row.isNested) {
    // Nested no-control branches resume their immediate parent (incl. failed).
    return [{ engine: "resume", step_id: row.parentId! }];
  }

  // Top-level standard names receive control defaults from step order/name.
  // Custom top-level branch names require an explicit route.
  return [];
}

function resolveTopLevelDefaultRoutes(
  branchName: string,
  row: FlatStep,
  warnings: StepContractLintWarning[],
  flowId: string,
): StepCatalogRoute[] {
  if (branchName === "completed") {
    return row.nextSiblingId
      ? [{ engine: "open", step_id: row.nextSiblingId }]
      : [{ engine: "advance" }];
  }
  if (branchName === "failed") {
    return [{ engine: "fail_run" }];
  }
  warnings.push({
    flow_id: flowId,
    step_id: row.qualifiedId,
    code: "CUSTOM_BRANCH_REQUIRES_ROUTE",
    message: `Custom top-level branch '${branchName}' requires an explicit route`,
  });
  return [{ engine: "advance" }];
}

function isAncestorOf(row: FlatStep, ancestorId: string, knownStepIds: Set<string>): boolean {
  if (!knownStepIds.has(ancestorId)) return false;
  if (row.parentId === null) return false;
  let cursor: string | null = row.parentId;
  while (cursor) {
    if (cursor === ancestorId) return true;
    const dot = cursor.lastIndexOf(".");
    cursor = dot > 0 ? cursor.slice(0, dot) : null;
  }
  return false;
}

function walkJsonValues(value: unknown, visit: (text: string) => void): void {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkJsonValues(item, visit);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) walkJsonValues(v, visit);
  }
}

function isKnownMurrmureToken(tokenPath: string, knownStepIds: Set<string>): boolean {
  if (KNOWN_MURRMURE_TOKENS.has(tokenPath)) return true;
  const stepMatch = tokenPath.match(QUALIFIED_STEP_TOKEN_PATTERN);
  if (stepMatch && knownStepIds.has(stepMatch[1]!)) return true;
  const artifactMatch = tokenPath.match(QUALIFIED_ARTIFACT_TOKEN_PATTERN);
  if (artifactMatch && knownStepIds.has(artifactMatch[1]!)) return true;
  return false;
}

function lintMurrmureTokens(
  flat: FlatStep[],
  manifest: FlowManifest,
  flowId: string,
  knownStepIds: Set<string>,
  warnings: StepContractLintWarning[],
): void {
  const report = (stepId: string | undefined, token: string) => {
    warnings.push({
      flow_id: flowId,
      step_id: stepId,
      code: "UNKNOWN_MURRMURE_TOKEN",
      message: `Unknown {{murrmure.${token}}} — see ${STEP_CONTRACT_MIGRATION_DOC}`,
    });
  };

  const scanString = (text: string, stepId?: string) => {
    for (const match of text.matchAll(MURRMURE_TOKEN_PATTERN)) {
      const tokenPath = match[1]?.trim() ?? "";
      if (!isKnownMurrmureToken(tokenPath, knownStepIds)) {
        report(stepId, tokenPath);
      }
    }
  };

  walkJsonValues(manifest, (text) => scanString(text));
  for (const row of flat) {
    if (row.step.description) scanString(row.step.description, row.qualifiedId);
    walkJsonValues(row.step.branches ?? {}, (text) => scanString(text, row.qualifiedId));
  }
}

function lintLegacySteps(
  manifest: FlowManifest,
  flowId: string,
  warnings: StepContractLintWarning[],
): void {
  for (const hit of findLegacyStepKinds(manifest)) {
    warnings.push({
      flow_id: flowId,
      step_id: hit.step_id,
      code: "LEGACY_STEP_KIND",
      message: `Step uses deprecated '${hit.key}:' — migrate to unified step contracts (${STEP_CONTRACT_MIGRATION_DOC})`,
    });
  }
}

function lintEmptyBranches(flat: FlatStep[], flowId: string, warnings: StepContractLintWarning[]): void {
  for (const row of flat) {
    if (row.step.branches && Object.keys(row.step.branches).length === 0) {
      warnings.push({
        flow_id: flowId,
        step_id: row.qualifiedId,
        code: "EMPTY_BRANCHES",
        message: `Step '${row.qualifiedId}' declares branches: {} — omit branches to receive defaults or declare at least one branch`,
      });
    }
  }
}

function lintDeadSteps(
  entries: StepContractCatalogEntry[],
  flowId: string,
  warnings: StepContractLintWarning[],
): void {
  const topLevel = entries.filter((e) => e.parent_id === null);
  if (topLevel.length === 0) return;

  const byId = new Map(topLevel.map((e) => [e.step_id, e]));
  const entry = topLevel[0]!.step_id;
  const reachable = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const entry_ = byId.get(current);
    if (!entry_) continue;
    for (const branch of Object.values(entry_.branches)) {
      for (const route of branch.routes) {
        if (
          (route.engine === "open" || route.engine === "resume") &&
          typeof route.step_id === "string" &&
          byId.has(route.step_id) &&
          !reachable.has(route.step_id)
        ) {
          reachable.add(route.step_id);
          queue.push(route.step_id);
        }
      }
    }
  }

  for (const row of topLevel) {
    if (row.step_id === entry) continue;
    if (!reachable.has(row.step_id)) {
      warnings.push({
        flow_id: flowId,
        step_id: row.step_id,
        code: "DEAD_STEP",
        message: `Step '${row.step_id}' is not reachable from flow entry '${entry}'`,
      });
    }
  }
}

function compileCatalogEntries(
  flat: FlatStep[],
  warnings: StepContractLintWarning[],
  flowId: string,
): StepContractCatalogEntry[] {
  return flat.map((row) => {
    const branches: Record<string, StepCatalogBranch> = {};
    for (const [name, def] of Object.entries(row.step.branches ?? {})) {
      const lowered = compileBranchRoutes(def, row, new Set(flat.map((r) => r.qualifiedId)), new Set(), warnings, flowId);
      const routes = lowered.length > 0
        ? lowered
        : resolveTopLevelDefaultRoutes(name, row, warnings, flowId);
      const schema = typeof def.schema === "object" ? def.schema : undefined;
      const artifactSlots = def.artifact_slots ?? {};
      const { payload_required, artifact_required } = partitionRequiredFields(schema, artifactSlots);
      const properties =
        schema?.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
          ? (schema.properties as Record<string, unknown>)
          : {};
      for (const slot of Object.keys(artifactSlots)) {
        if (Object.hasOwn(properties, slot)) {
          warnings.push({
            flow_id: flowId,
            step_id: row.qualifiedId,
            code: "PAYLOAD_ARTIFACT_NAME_COLLISION",
            message: `Branch '${name}' declares '${slot}' as both a payload property and artifact slot`,
          });
        }
      }
      if (schema) {
        try {
          assertSupportedPayloadSchema(schema);
        } catch (error) {
          warnings.push({
            flow_id: flowId,
            step_id: row.qualifiedId,
            code: "INVALID_BRANCH_SCHEMA",
            message: error instanceof Error ? error.message : `Branch '${name}' schema is invalid`,
          });
        }
      }
      branches[name] = {
        schema_ref: schemaRefForBranch(name, def),
        schema,
        payload_required,
        artifact_required,
        artifact_slots: artifactSlots,
        routes,
      };
    }
    return {
      step_id: row.qualifiedId,
      parent_id: row.parentId,
      description: row.step.description,
      branches,
    };
  });
}

export function compileStepContractCatalog(
  manifest: FlowManifest,
  flowId: string,
): StepContractCompileResult {
  const warnings: StepContractLintWarning[] = [];

  if (!manifestUsesStepContracts(manifest)) {
    lintLegacySteps(manifest, flowId, warnings);
    return { catalog: null, warnings };
  }

  // Materialize default branches before every downstream consumer so explicit
  // and injected branches are downstream-equivalent.
  const contractSteps = manifest.steps
    .filter(isStepContractStep)
    .map((step) => structuredClone(step) as StepContractManifestStep);
  applyDefaultBranches(contractSteps);

  const topLevelOrder = contractSteps.map((s) => s.id);
  const flat: FlatStep[] = [];
  flattenManifestSteps(contractSteps, null, null, topLevelOrder, flat);

  const knownStepIds = new Set(flat.map((r) => r.qualifiedId));
  lintMurrmureTokens(flat, manifest, flowId, knownStepIds, warnings);
  lintEmptyBranches(flat, flowId, warnings);

  const entries = compileCatalogEntries(flat, warnings, flowId);
  lintDeadSteps(entries, flowId, warnings);
  const graphBody = entries.map((e) => ({
    step_id: e.step_id,
    branches: Object.fromEntries(
      Object.entries(e.branches).map(([name, b]) => [name, b.routes]),
    ),
  }));
  const catalogBody = {
    flow_id: flowId,
    entries,
    step_ids: entries.map((e) => e.step_id),
    graph_digest: computeContentDigest(graphBody),
  };

  return {
    catalog: {
      ...catalogBody,
      digest: computeContentDigest(catalogBody),
    },
    warnings,
  };
}

export function lintStepContractManifest(
  manifest: FlowManifest,
  flowId: string,
): StepContractLintWarning[] {
  return compileStepContractCatalog(manifest, flowId).warnings;
}

export function formatCatalogDigestSummary(catalog: StepContractCatalog): string {
  const short = catalog.digest.replace(/^sha256:/, "").slice(0, 12);
  return `${catalog.flow_id}: ${short}… (${catalog.step_ids.length} steps)`;
}

function walkActionStrings(
  actions: Record<string, { prompt?: string; command?: string; cwd?: string }>,
  visit: (text: string, actionName: string) => void,
): void {
  for (const [name, action] of Object.entries(actions)) {
    if (action.prompt) visit(action.prompt, name);
    if (action.command) visit(action.command, name);
    if (action.cwd) visit(action.cwd, name);
  }
}

export function lintActionMurrmureTokens(
  actions: Record<string, { prompt?: string; command?: string; cwd?: string }>,
  knownStepIds: Set<string>,
  flowId = "actions",
): StepContractLintWarning[] {
  const warnings: StepContractLintWarning[] = [];
  walkActionStrings(actions, (text, actionName) => {
    for (const match of text.matchAll(MURRMURE_TOKEN_PATTERN)) {
      const tokenPath = match[1]?.trim() ?? "";
      if (!isKnownMurrmureToken(tokenPath, knownStepIds)) {
        warnings.push({
          flow_id: flowId,
          step_id: actionName,
          code: "UNKNOWN_MURRMURE_TOKEN",
          message: `Unknown {{murrmure.${tokenPath}}} in action prompt — see ${STEP_CONTRACT_MIGRATION_DOC}`,
        });
      }
    }
  });
  return warnings;
}
