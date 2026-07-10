import type {
  FlowManifest,
  FlowStep,
  StepBranchDefinition,
  StepContractCatalog,
  StepContractCatalogEntry,
  StepContractManifestStep,
  StepCatalogBranch,
  StepCatalogRoute,
  StepRole,
} from "@murrmure/contracts";
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

export function isStepContractStep(step: FlowStep | StepContractManifestStep): boolean {
  return Boolean(step.branches && Object.keys(step.branches).length > 0);
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

function deriveRole(step: StepContractManifestStep, parentRole?: StepRole): StepRole {
  if (step.role) return step.role;
  if (step.presentation?.view) return "human";
  if (parentRole === "agent") return "agent";
  if (parentRole === "human") return "human";
  return "agent";
}

function schemaRefForBranch(branchName: string, branch: StepBranchDefinition): string | undefined {
  if (branch.schema_ref) return branch.schema_ref;
  if (typeof branch.schema === "string") return branch.schema;
  if (branch.schema && typeof branch.schema === "object") {
    return `murrmure.schemas/inline.${branchName}.v1.json`;
  }
  return undefined;
}

function compileBranchRoutes(
  branch: StepBranchDefinition,
  isNested: boolean,
  childIds: Set<string>,
  parentQualifiedId: string | null,
): StepCatalogRoute[] {
  const routes: StepCatalogRoute[] = [];

  if (isNested) {
    if (branch.complete === "parent" || branch.complete === true) {
      routes.push({ engine: "complete_parent" });
    }
    if (branch.continue === "parent" || branch.continue === true) {
      routes.push({ engine: "continue_parent" });
    }
    if (branch.goto) {
      const stepId = parentQualifiedId ? `${parentQualifiedId}.${branch.goto}` : branch.goto;
      routes.push({ engine: "goto", step_id: stepId });
    }
    if (branch.fail === true) {
      routes.push({ engine: "fail_run", fail_run: true });
    }
    return routes.length > 0 ? routes : [{ engine: "advance" }];
  }

  if (branch.fail_run === true) {
    routes.push({ engine: "fail_run", fail_run: true });
  }
  if (branch.next === null) {
    if (branch.fail_run !== true) {
      routes.push({ engine: "advance" });
    }
  } else if (typeof branch.next === "string") {
    routes.push({ engine: "open", step_id: branch.next });
  }
  return routes.length > 0 ? routes : [{ engine: "advance" }];
}

function flattenManifestSteps(
  steps: StepContractManifestStep[],
  parentId: string | null,
  parentQualifiedPrefix: string | null,
  out: Array<{ step: StepContractManifestStep; qualifiedId: string; parentId: string | null; isNested: boolean }>,
): void {
  for (const step of steps) {
    const qualifiedId = parentQualifiedPrefix ? `${parentQualifiedPrefix}.${step.id}` : step.id;
    const isNested = parentId !== null;
    out.push({ step, qualifiedId, parentId, isNested });
    if (step.steps?.length) {
      flattenManifestSteps(step.steps, qualifiedId, qualifiedId, out);
    }
  }
}

function collectBranchTargets(
  branch: StepBranchDefinition,
  isNested: boolean,
): string[] {
  const targets: string[] = [];
  if (!isNested && typeof branch.next === "string") targets.push(branch.next);
  if (isNested && branch.goto) targets.push(branch.goto);
  return targets;
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
  flat: Array<{ step: StepContractManifestStep; qualifiedId: string }>,
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
    walkJsonValues(row.step.branches, (text) => scanString(text, row.qualifiedId));
    if (row.step.presentation) walkJsonValues(row.step.presentation, (text) => scanString(text, row.qualifiedId));
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

function lintMixedStepKinds(
  manifest: FlowManifest,
  flowId: string,
  warnings: StepContractLintWarning[],
): void {
  for (const step of manifest.steps) {
    if (!isStepContractStep(step)) continue;
    for (const key of LEGACY_STEP_KEYS) {
      if (key in step && (step as Record<string, unknown>)[key] !== undefined) {
        warnings.push({
          flow_id: flowId,
          step_id: step.id,
          code: "MIXED_STEP_SHAPE",
          message: `Step '${step.id}' mixes branches with legacy '${key}:' — use one shape only`,
        });
      }
    }
  }
}

function lintBranchRoutes(
  flat: Array<{
    step: StepContractManifestStep;
    qualifiedId: string;
    parentId: string | null;
    isNested: boolean;
  }>,
  flowId: string,
  knownStepIds: Set<string>,
  warnings: StepContractLintWarning[],
): void {
  const childIdsByParent = new Map<string, Set<string>>();
  for (const row of flat) {
    if (!row.parentId) continue;
    const set = childIdsByParent.get(row.parentId) ?? new Set<string>();
    set.add(row.step.id);
    childIdsByParent.set(row.parentId, set);
  }

  for (const row of flat) {
    const childIds = childIdsByParent.get(row.qualifiedId) ?? new Set<string>();
    for (const [branchName, branch] of Object.entries(row.step.branches)) {
      compileBranchRoutes(branch, row.isNested, childIds, row.parentId);

      for (const target of collectBranchTargets(branch, row.isNested)) {
        if (row.isNested) {
          const siblings = childIdsByParent.get(row.parentId!) ?? new Set<string>();
          if (!siblings.has(target)) {
            warnings.push({
              flow_id: flowId,
              step_id: row.qualifiedId,
              code: "GOTO_TARGET_NOT_FOUND",
              message: `Nested goto target '${target}' is not a sibling under '${row.parentId}'`,
            });
          }
        } else if (!knownStepIds.has(target)) {
          warnings.push({
            flow_id: flowId,
            step_id: row.qualifiedId,
            code: "NEXT_TARGET_NOT_FOUND",
            message: `Branch '${branchName}' next target '${target}' is not a top-level step id`,
          });
        }
      }

      if (row.isNested && branch.next) {
        warnings.push({
          flow_id: flowId,
          step_id: row.qualifiedId,
          code: "NESTED_TOP_LEVEL_ROUTE",
          message: `Nested step '${row.qualifiedId}' must not use top-level 'next:' — use goto/complete/continue/fail`,
        });
      }
    }
  }
}

function lintDeadSteps(
  flat: Array<{ qualifiedId: string; isNested: boolean; parentId: string | null }>,
  manifest: FlowManifest,
  flowId: string,
  warnings: StepContractLintWarning[],
): void {
  const topLevel = flat.filter((r) => !r.isNested);
  if (topLevel.length === 0) return;

  const referenced = new Set<string>();
  for (const row of flat) {
    if (row.isNested) continue;
    const step = manifest.steps.find((s) => s.id === row.qualifiedId);
    if (!step?.branches) continue;
    for (const branch of Object.values(step.branches)) {
      if (typeof branch.next === "string") referenced.add(branch.next);
    }
  }

  const entry = topLevel[0]!.qualifiedId;
  const reachable = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const step = manifest.steps.find((s) => s.id === current);
    if (!step?.branches) continue;
    for (const branch of Object.values(step.branches)) {
      if (typeof branch.next === "string" && !reachable.has(branch.next)) {
        reachable.add(branch.next);
        queue.push(branch.next);
      }
    }
  }

  for (const row of topLevel) {
    if (row.qualifiedId === entry) continue;
    if (!reachable.has(row.qualifiedId) && !referenced.has(row.qualifiedId)) {
      warnings.push({
        flow_id: flowId,
        step_id: row.qualifiedId,
        code: "DEAD_STEP",
        message: `Step '${row.qualifiedId}' is not reachable from flow entry '${entry}'`,
      });
    }
  }
}

function compileCatalogEntries(
  flat: Array<{
    step: StepContractManifestStep;
    qualifiedId: string;
    parentId: string | null;
    isNested: boolean;
  }>,
): StepContractCatalogEntry[] {
  const childIdsByParent = new Map<string, Set<string>>();
  for (const row of flat) {
    if (!row.parentId) continue;
    const set = childIdsByParent.get(row.parentId) ?? new Set<string>();
    set.add(row.step.id);
    childIdsByParent.set(row.parentId, set);
  }

  return flat.map((row) => {
    const childIds = childIdsByParent.get(row.qualifiedId) ?? new Set<string>();
    const parentRow = row.parentId ? flat.find((r) => r.qualifiedId === row.parentId) : undefined;
    const parentRole = parentRow ? deriveRole(parentRow.step) : undefined;
    const branches: Record<string, StepCatalogBranch> = {};
    for (const [name, def] of Object.entries(row.step.branches)) {
      branches[name] = {
        schema_ref: schemaRefForBranch(name, def),
        schema: typeof def.schema === "object" ? def.schema : undefined,
        routes: compileBranchRoutes(def, row.isNested, childIds, row.parentId),
      };
    }
    return {
      step_id: row.qualifiedId,
      parent_id: row.parentId,
      description: row.step.description,
      role: deriveRole(row.step, parentRole),
      branches,
      artifact_slots: Object.values(row.step.branches).reduce(
        (acc, branch) => ({ ...acc, ...branch.artifact_slots }),
        {} as Record<string, { description?: string; max_bytes?: number }>,
      ),
      presentation: row.step.presentation,
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

  lintMixedStepKinds(manifest, flowId, warnings);

  const contractSteps = manifest.steps.filter(isStepContractStep) as StepContractManifestStep[];
  const flat: Array<{
    step: StepContractManifestStep;
    qualifiedId: string;
    parentId: string | null;
    isNested: boolean;
  }> = [];
  flattenManifestSteps(contractSteps, null, null, flat);

  const knownStepIds = new Set(flat.map((r) => r.qualifiedId));
  lintMurrmureTokens(flat, manifest, flowId, knownStepIds, warnings);
  lintBranchRoutes(flat, flowId, knownStepIds, warnings);
  lintDeadSteps(flat, manifest, flowId, warnings);

  const entries = compileCatalogEntries(flat);
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
