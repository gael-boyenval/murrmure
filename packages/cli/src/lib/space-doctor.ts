import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { HubAuth } from "../auth.js";
import { resolveHubAuth } from "../auth.js";
import { fetchWhoami } from "./auth-context.js";
import { readCredentials } from "./auth-store.js";
import { resolveAuthSource } from "./auth-source.js";
import { resolveSpaceId } from "./space-id.js";
import type { GlobalFlags } from "./flags.js";
import { lintSpaceApplyBundle, resolveBindingsFile, validateApplyBundle } from "@murrmure/hub-core";
import {
  readSpaceApplyBundle,
  resolveMurrmureRoot,
  validateSpaceBundleCycles,
} from "./space-directory.js";
import { readSpaceLink } from "./space-link-file.js";
import { probeMcpLiveHealth, scanMcpConfig, type SpaceDoctorMcpContext } from "./space-doctor-mcp.js";
import {
  scanSpaceDoctorSkills,
  type SpaceDoctorSkillsContext,
} from "./space-doctor-skills.js";

export type SpaceDoctorSeverity = "error" | "warning" | "info";

export interface SpaceDoctorIssue {
  code: string;
  severity: SpaceDoctorSeverity;
  message: string;
  path?: string;
  fix?: string;
}

export interface SpaceDoctorWorkspaceContext {
  cwd: string;
  project_path: string;
  murrmure_present: boolean;
  link_present: boolean;
  linked_space_id?: string;
  auth_source?: string | null;
  auth_configured: boolean;
  hub_url?: string;
  default_space_id?: string;
  legacy_studio_detected: boolean;
}

export interface SpaceDoctorDigestCounts {
  actions: number;
  executors: number;
  hooks: number;
  flows: number;
}

export interface SpaceDoctorDigestMap {
  actions?: string;
  executors?: string;
  hooks?: string;
  flows: Array<{ flow_id: string; digest: string }>;
}

export interface SpaceDoctorSnapshot {
  counts: SpaceDoctorDigestCounts;
  digests: SpaceDoctorDigestMap;
}

export interface SpaceDoctorTestResult {
  files: string[];
  passed: boolean;
  skipped: boolean;
  detail?: string;
}

export interface SpaceDoctorResult {
  ok: boolean;
  space_id?: string;
  project_path: string;
  workspace: SpaceDoctorWorkspaceContext;
  issues: SpaceDoctorIssue[];
  suggestions: string[];
  local?: SpaceDoctorSnapshot;
  hub?: SpaceDoctorSnapshot & { reachable: boolean };
  tests?: SpaceDoctorTestResult;
  mcp?: SpaceDoctorMcpContext;
  skills?: SpaceDoctorSkillsContext;
}

interface HubIndexStatusResponse {
  counts?: SpaceDoctorDigestCounts;
  digests?: {
    actions?: string;
    executors?: string;
    hooks?: string;
    flows?: Array<{ flow_id: string; digest: string }>;
  };
  bindings?: Array<{ host: string; path: string; primary?: boolean }>;
}

function applyLintSeverity(code: string): SpaceDoctorSeverity {
  if (code === "HANDLER_KEY_CONFLICT") return "error";
  if (code === "HANDLER_COMPLETE_AUTO_NESTED") return "error";
  if (code === "BINDINGS_UNRESOLVED") return "error";
  if (code === "HANDLER_MISSING") return "warning";
  if (code === "STEP_UNCOVERED") return "warning";
  if (code === "HANDLER_ORPHAN_KEY") return "warning";
  if (code === "HANDLER_COMPLETE_CLI_NO_RESOLVE") return "warning";
  return "info";
}

function normalizeApplyLintCode(code: string): string {
  if (code === "STEP_UNCOVERED") return "HANDLER_MISSING";
  return code;
}

function pushIssue(
  issues: SpaceDoctorIssue[],
  issue: SpaceDoctorIssue,
): void {
  issues.push(issue);
}

function isBlocking(severity: SpaceDoctorSeverity): boolean {
  return severity === "error";
}

const LEGACY_CAPABILITY_MANIFEST = "capability.manifest.json";
const LEGACY_STUDIO_ENV_KEYS = [
  "STUDIO_HUB_URL",
  "STUDIO_TOKEN",
  "STUDIO_SPACE_ID",
  "STUDIO_HUB_TOKEN",
] as const;

export function discoverMurrmureProject(startPath: string): {
  cwd: string;
  projectPath: string;
  murrmurePresent: boolean;
  link: ReturnType<typeof readSpaceLink>;
} {
  const cwd = resolve(startPath);
  let current = cwd;
  for (let depth = 0; depth < 6; depth += 1) {
    const murrmurePath = join(current, ".mrmr");
    const link = readSpaceLink(current);
    if (existsSync(murrmurePath) && statSync(murrmurePath).isDirectory()) {
      return { cwd, projectPath: current, murrmurePresent: true, link };
    }
    if (link) {
      return {
        cwd,
        projectPath: current,
        murrmurePresent: existsSync(murrmurePath),
        link,
      };
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return { cwd, projectPath: cwd, murrmurePresent: false, link: readSpaceLink(cwd) };
}

function shallowFindFiles(root: string, filename: string, maxDepth = 3): string[] {
  const matches: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git") {
        continue;
      }
      const path = join(dir, entry);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isFile() && entry === filename) {
        matches.push(relative(root, path));
      } else if (stat.isDirectory()) {
        walk(path, depth + 1);
      }
    }
  }
  walk(root, 0);
  return matches.sort();
}

function packageJsonUsesLegacyStudio(projectPath: string): boolean {
  const packageJsonPath = join(projectPath, "package.json");
  if (!existsSync(packageJsonPath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["@studio/capability-sdk"] || deps["@studio/capability-dev-kit"]) {
      return true;
    }
    const scripts = Object.values(pkg.scripts ?? {}).join(" ");
    return scripts.includes("@studio/capability") || scripts.includes("studio-capability");
  } catch {
    return false;
  }
}

export function scanLegacyWorkspace(
  projectPath: string,
  options?: { walkUp?: boolean },
): SpaceDoctorIssue[] {
  const issues: SpaceDoctorIssue[] = [];
  const seen = new Set<string>();
  const manifestAbsPaths = new Set<string>();
  let current = resolve(projectPath);

  for (let depth = 0; depth < 6; depth += 1) {
    for (const issue of scanLegacyWorkspaceAt(current)) {
      if (issue.code === "LEGACY_CAPABILITY_MANIFEST" && issue.path) {
        const absPath = resolve(current, issue.path);
        if (manifestAbsPaths.has(absPath)) {
          continue;
        }
        manifestAbsPaths.add(absPath);
      }
      const key = `${issue.code}:${issue.path ?? ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      issues.push(issue);
    }
    if (!options?.walkUp) {
      break;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return issues;
}

function scanLegacyWorkspaceAt(projectPath: string): SpaceDoctorIssue[] {
  const issues: SpaceDoctorIssue[] = [];

  if (packageJsonUsesLegacyStudio(projectPath)) {
    pushIssue(issues, {
      code: "LEGACY_STUDIO_PACKAGE",
      severity: "warning",
      message: "package.json references @studio/capability-* (v1 FDK) — Murrmure v2 uses murrmure/ + mrmr space apply",
      path: "package.json",
      fix: "mrmr space init && mrmr space link --path . --create && mrmr space apply",
    });
  }

  for (const rel of shallowFindFiles(projectPath, LEGACY_CAPABILITY_MANIFEST)) {
    pushIssue(issues, {
      code: "LEGACY_CAPABILITY_MANIFEST",
      severity: "warning",
      message: `Legacy FDK capability manifest at ${rel} — not indexed by Murrmure v2 space apply`,
      path: rel,
      fix: "Port flows to murrmure/flows/*/flow.manifest.yaml (see apps/docs/guide/space-index.md)",
    });
  }

  const legacyEnv = LEGACY_STUDIO_ENV_KEYS.filter((key) => process.env[key]);
  const murrmureEnv = Boolean(process.env.MURRMURE_HUB_URL && (process.env.MURRMURE_HUB_TOKEN || process.env.MURRMURE_TOKEN));
  if (legacyEnv.length > 0 && !murrmureEnv) {
    pushIssue(issues, {
      code: "LEGACY_STUDIO_ENV",
      severity: "warning",
      message: `Legacy STUDIO_* env vars set (${legacyEnv.join(", ")}) but Murrmure auth env is missing`,
      fix: "mrmr login --hub-url http://127.0.0.1:8787   # or export MURRMURE_HUB_URL + MURRMURE_HUB_TOKEN",
    });
  }

  const legacyShared = join(homedir(), ".studio", "hubs", "shared.json");
  const murrmureShared = join(homedir(), ".murrmure", "hubs", "shared.json");
  if (existsSync(legacyShared) && !existsSync(murrmureShared) && !readCredentials()) {
    pushIssue(issues, {
      code: "LEGACY_STUDIO_CREDENTIALS",
      severity: "info",
      message: "Found ~/.studio/hubs/shared.json — Murrmure CLI reads ~/.murrmure/credentials",
      fix: "mrmr login --hub-url http://127.0.0.1:8787",
    });
  }

  return issues;
}

export interface SpaceDoctorFixStep {
  command: string;
  why?: string;
}

export function buildSpaceDoctorFixPlan(result: SpaceDoctorResult): SpaceDoctorFixStep[] {
  const steps: SpaceDoctorFixStep[] = [];
  const { workspace } = result;
  const project = workspace.project_path;

  if (workspace.cwd !== workspace.project_path) {
    steps.push({ command: `cd ${project}`, why: "project root (murrmure/ lives here)" });
  }

  if (!workspace.murrmure_present) {
    steps.push({ command: "mrmr space init", why: "create murrmure/ layout" });
  } else if (
    workspace.legacy_studio_detected &&
    result.local &&
    result.local.counts.actions === 0 &&
    result.local.counts.flows === 0
  ) {
    steps.push({ command: "mrmr space init", why: "murrmure/ is empty — scaffold v2 files" });
  }

  if (!workspace.auth_configured) {
    steps.push({ command: "mrmr login --hub-url http://127.0.0.1:8787", why: "required for link & apply" });
  }

  if (workspace.murrmure_present && !workspace.link_present && !result.space_id) {
    steps.push({
      command: "mrmr space onboard",
      why: "link existing murrmure/ and apply index",
    });
  }

  if (result.local && result.local.counts.flows === 0 && workspace.murrmure_present) {
    steps.push({
      command: "mrmr space flow init hello --template hello-gate",
      why: "no indexed flows — scaffold a starter flow",
    });
  } else if (result.hub && result.hub.counts.flows === 0 && workspace.link_present) {
    steps.push({
      command: "mrmr space flow init hello --template hello-gate",
      why: "hub index has 0 flows — scaffold and apply",
    });
  }

  if (result.space_id && result.local && result.hub) {
    const drift = result.issues.some((issue) =>
      ["INDEX_DRIFT", "INDEX_NOT_APPLIED", "INDEX_EMPTY"].includes(issue.code),
    );
    if (drift) {
      steps.push({ command: "mrmr space apply", why: "push local changes to hub index" });
    }
  }

  if (workspace.legacy_studio_detected) {
    const manifests = result.issues
      .filter((issue) => issue.code === "LEGACY_CAPABILITY_MANIFEST" && issue.path)
      .map((issue) => issue.path!);
    if (manifests.length === 1) {
      steps.push({
        command: `# port ${manifests[0]} → murrmure/flows/<name>/flow.manifest.yaml`,
        why: "v1 capabilities are not auto-migrated",
      });
    } else if (manifests.length > 1) {
      steps.push({
        command: "# port capability.manifest.json files → murrmure/flows/<name>/flow.manifest.yaml",
        why: `${manifests.length} legacy manifests found`,
      });
    }
  }

  const mcpCodes = new Set(
    result.issues
      .filter((issue) => issue.code.startsWith("MCP_") && issue.severity !== "info")
      .map((issue) => issue.code),
  );
  if (mcpCodes.size > 0) {
    const addUniqueStep = (step: SpaceDoctorFixStep): void => {
      if (steps.some((existing) => existing.command === step.command)) {
        return;
      }
      steps.push(step);
    };

    const suggestedConfigPath = result.mcp?.suggested_config_path ?? join(project, ".cursor", "mcp.json");
    const relConfig = suggestedConfigPath.startsWith(project)
      ? suggestedConfigPath.slice(project.length + 1)
      : ".cursor/mcp.json";
    const linkedSpaceId = result.workspace.linked_space_id ?? result.space_id;
    const shapeIssueCodes = [
      "MCP_CONFIG_MISSING",
      "MCP_CONFIG_SHAPE",
      "MCP_INVALID_JSON",
      "MCP_SCHEMA_INVALID",
      "MCP_NO_MURRMURE_SERVER",
      "MCP_FAT_COMMAND_SHAPE",
      "MCP_ALIAS_COMMAND",
      "MCP_LEGACY_COMMAND",
      "MCP_COMMAND_UNEXPECTED",
      "MCP_FAT_ENV_KEYS",
      "MCP_MISSING_TOKEN",
      "MCP_PLACEHOLDER_TOKEN",
    ];

    if (mcpCodes.has("MCP_CONFIG_MISSING")) {
      addUniqueStep({
        command: `# create ${relConfig} — see suggested MCP snippet below`,
        why: "connect Cursor agents to this workspace",
      });
    } else {
      addUniqueStep({
        command: `# fix ${relConfig} — see suggested MCP snippet below`,
        why: "repair MCP config before running agents",
      });
    }

    if (shapeIssueCodes.some((code) => mcpCodes.has(code))) {
      addUniqueStep({
        command: "mrmr space doctor --fix",
        why: "rewrite mcp.json to thin murrmure-mcp shape",
      });
    }

    if (mcpCodes.has("MCP_DISCOVERY")) {
      addUniqueStep({
        command: "mrmr login --hub-url http://127.0.0.1:8787",
        why: "refresh shared discovery and hub auth",
      });
    }

    if (mcpCodes.has("MCP_TOKEN_SET")) {
      if (result.space_id) {
        addUniqueStep({
          command: `mrmr grant mint --space ${result.space_id} --label cursor-agent`,
          why: "mint MURRMURE_HUB_TOKEN for MCP bridge",
        });
      }
      addUniqueStep({
        command: "# export MURRMURE_HUB_TOKEN=<grant token>",
        why: "make token visible to murrmure-mcp runtime",
      });
    }

    if (mcpCodes.has("MCP_TOKEN_SPACE_MATCH") && linkedSpaceId) {
      addUniqueStep({
        command: `mrmr grant use --space ${linkedSpaceId}`,
        why: "align active grant with linked space (ISSUE-07)",
      });
    }

    if (mcpCodes.has("MCP_CATALOG_LIVE") || mcpCodes.has("MCP_PROBE_INVOKE")) {
      addUniqueStep({
        command: "mrmr whoami",
        why: "verify active token scopes and linked spaces",
      });
      if (linkedSpaceId) {
        addUniqueStep({
          command: `mrmr grant use --space ${linkedSpaceId}`,
          why: "switch to the grant expected by this workspace",
        });
      }
    }

    if (mcpCodes.has("MCP_SCHEMA_PRESENT")) {
      addUniqueStep({
        command: "# update/restart hub daemon so murrmure_resolve_step advertises inputSchema.required",
        why: "schema metadata is required for reliable MCP calls",
      });
    }
  }

  const skillCodes = new Set(
    result.issues
      .filter((issue) => issue.code.startsWith("SKILL_"))
      .map((issue) => issue.code),
  );
  if (skillCodes.has("SKILL_AGENT_MISSING") || skillCodes.has("SKILL_AGENT_OUTDATED")) {
    steps.push({
      command: "mrmr skill install --variant agent",
      why: "install/update runtime agent skill",
    });
  }
  if (skillCodes.has("SKILL_DEVELOPER_MISSING") || skillCodes.has("SKILL_DEVELOPER_OUTDATED")) {
    steps.push({
      command: "mrmr skill install --variant developer",
      why: "install/update authoring skill for local flows/views",
    });
  }
  if (skillCodes.has("SKILL_LEGACY_MONOLITH") || skillCodes.has("SKILL_LEGACY_FDK")) {
    steps.push({
      command: "mrmr skill install --variant all",
      why: "replace legacy skill directories with split variants",
    });
  }

  return steps;
}

export function buildSpaceDoctorSuggestions(result: SpaceDoctorResult): string[] {
  return buildSpaceDoctorFixPlan(result).map((step) => step.command);
}

function inspectAuth(flags?: GlobalFlags): {
  auth?: HubAuth;
  authSource: ReturnType<typeof resolveAuthSource>;
  defaultSpaceId?: string;
} {
  const authSource = resolveAuthSource({ hubUrl: flags?.hubUrl, token: flags?.token });
  const resolved = resolveHubAuth({ hubUrl: flags?.hubUrl, token: flags?.token });
  if ("error" in resolved) {
    return { authSource, defaultSpaceId: undefined };
  }
  return { auth: resolved, authSource, defaultSpaceId: resolved.defaultSpaceId };
}

function collectTestFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectTestFiles(path));
    } else if (entry.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files.sort();
}

function discoverFlowContractTests(murrmureRoot: string): string[] {
  const flowsDir = join(murrmureRoot, "flows");
  if (!existsSync(flowsDir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(flowsDir)) {
    const flowDir = join(flowsDir, entry);
    if (!statSync(flowDir).isDirectory()) {
      continue;
    }
    files.push(...collectTestFiles(join(flowDir, "tests")));
  }
  return files;
}

function walkMurrmureFiles(
  root: string,
  predicate: (relPath: string) => boolean,
): string[] {
  const matches: string[] = [];
  function walk(current: string, prefix: string): void {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path, rel);
      } else if (predicate(rel)) {
        matches.push(rel);
      }
    }
  }
  walk(root, "");
  return matches.sort();
}

function scanDeprecatedConfig(murrmureRoot: string): SpaceDoctorIssue[] {
  const issues: SpaceDoctorIssue[] = [];
  const hooksPath = join(murrmureRoot, "hooks.yaml");
  const triggersPath = join(murrmureRoot, "triggers.yaml");

  if (existsSync(triggersPath) && !existsSync(hooksPath)) {
    pushIssue(issues, {
      code: "DEPRECATED_CONFIG",
      severity: "warning",
      message: "triggers.yaml is a legacy alias — prefer murrmure/hooks.yaml",
      path: "murrmure/triggers.yaml",
    });
  } else if (existsSync(triggersPath) && existsSync(hooksPath)) {
    pushIssue(issues, {
      code: "REDUNDANT_CONFIG",
      severity: "info",
      message: "triggers.yaml is ignored when hooks.yaml exists — remove the alias file",
      path: "murrmure/triggers.yaml",
    });
  }

  for (const rel of walkMurrmureFiles(murrmureRoot, (path) => path.endsWith("murrmure.flow.yaml"))) {
    pushIssue(issues, {
      code: "LEGACY_FDK_ARTIFACT",
      severity: "warning",
      message: "FDK worker package file is not indexed by space apply — use flow.manifest.yaml under murrmure/flows/",
      path: `murrmure/${rel}`,
    });
  }

  for (const rel of walkMurrmureFiles(murrmureRoot, (path) => path.endsWith("flow.manifest.json"))) {
    pushIssue(issues, {
      code: "LEGACY_MANIFEST_FORMAT",
      severity: "warning",
      message: "flow.manifest.json is a legacy FDK format — use flow.manifest.yaml for v2 indexed flows",
      path: `murrmure/${rel}`,
    });
  }

  return issues;
}

function scanLegacyLayout(projectPath: string): SpaceDoctorIssue[] {
  const issues: SpaceDoctorIssue[] = [];
  const hasModernRoot = existsSync(join(projectPath, ".mrmr"));
  const legacyRoots = ["murrmure", ".murrmure", ".mrmr.temp"].filter((name) =>
    existsSync(join(projectPath, name)),
  );
  if (!hasModernRoot || legacyRoots.length === 0) {
    return issues;
  }
  pushIssue(issues, {
    code: "LEGACY_LAYOUT",
    severity: "error",
    message: `Legacy layout still present (${legacyRoots.join(", ")})`,
    fix: "Use only .mrmr/{space,flows,views,dev} and remove legacy roots",
  });
  return issues;
}

function lintBindingsInWorkspace(input: {
  murrmureRoot: string;
  bundle: Awaited<ReturnType<typeof readSpaceApplyBundle>>;
}): SpaceDoctorIssue[] {
  const issues: SpaceDoctorIssue[] = [];
  const bindings = input.bundle.bindings?.file;
  if (!bindings) return issues;

  const resolved = resolveBindingsFile(bindings);
  if (!resolved.ok) {
    pushIssue(issues, {
      code: "BINDINGS_UNRESOLVED",
      severity: "error",
      message: resolved.message,
      path: ".mrmr/space/bindings.yaml",
    });
    return issues;
  }

  for (const flow of resolved.value.flows) {
    if (flow.source.kind === "local") {
      const localPath = join(input.murrmureRoot, flow.source.path);
      if (!existsSync(localPath)) {
        pushIssue(issues, {
          code: "BINDINGS_UNRESOLVED",
          severity: "error",
          message: `Flow binding '${flow.ref}' points to missing local path '${flow.source.path}'`,
          path: `.mrmr/${flow.source.path}`,
        });
      }
      if (
        (input.bundle.flows ?? []).some(
          (entry) => entry.flow_id === flow.ref || entry.manifest.name === flow.ref,
        )
      ) {
        pushIssue(issues, {
          code: "BINDINGS_REDUNDANT",
          severity: "info",
          message: `Flow binding '${flow.ref}' duplicates a locally indexed flow`,
          path: ".mrmr/space/bindings.yaml",
        });
      }
    }
  }

  for (const view of resolved.value.views) {
    if (view.source.kind === "local") {
      const localPath = join(input.murrmureRoot, view.source.path);
      if (!existsSync(localPath)) {
        pushIssue(issues, {
          code: "BINDINGS_UNRESOLVED",
          severity: "error",
          message: `View binding '${view.ref}' points to missing local path '${view.source.path}'`,
          path: `.mrmr/${view.source.path}`,
        });
      }
      if (
        (input.bundle.views ?? []).some(
          (entry) => entry.view_id === view.ref || entry.manifest.id === view.ref,
        )
      ) {
        pushIssue(issues, {
          code: "BINDINGS_REDUNDANT",
          severity: "info",
          message: `View binding '${view.ref}' duplicates a locally indexed view`,
          path: ".mrmr/space/bindings.yaml",
        });
      }
    }
  }

  return issues;
}

function localSnapshotFromBundle(
  bundle: Awaited<ReturnType<typeof readSpaceApplyBundle>>,
): SpaceDoctorSnapshot {
  return {
    counts: {
      actions: Object.keys(bundle.actions?.file.actions ?? {}).length,
      executors: Object.keys(bundle.executors?.file.executors ?? {}).length,
      hooks: Object.keys(bundle.hooks?.file.hooks ?? {}).length,
      flows: bundle.flows?.length ?? 0,
    },
    digests: {
      actions: bundle.actions?.digest,
      executors: bundle.executors?.digest,
      hooks: bundle.hooks?.digest,
      flows: (bundle.flows ?? []).map((flow) => ({
        flow_id: flow.flow_id,
        digest: flow.digest,
      })),
    },
  };
}

function hubSnapshotFromStatus(body: HubIndexStatusResponse): SpaceDoctorSnapshot {
  return {
    counts: {
      actions: body.counts?.actions ?? 0,
      executors: body.counts?.executors ?? 0,
      hooks: body.counts?.hooks ?? 0,
      flows: body.counts?.flows ?? 0,
    },
    digests: {
      actions: body.digests?.actions,
      executors: body.digests?.executors,
      hooks: body.digests?.hooks,
      flows: body.digests?.flows ?? [],
    },
  };
}

function compareIndexDigests(
  local: SpaceDoctorSnapshot,
  hub: SpaceDoctorSnapshot,
  issues: SpaceDoctorIssue[],
): void {
  const sections = ["actions", "executors", "hooks"] as const;
  for (const section of sections) {
    const localDigest = local.digests[section];
    const hubDigest = hub.digests[section];
    if (!localDigest || !hubDigest) {
      continue;
    }
    if (localDigest !== hubDigest) {
      pushIssue(issues, {
        code: "INDEX_DRIFT",
        severity: "warning",
        message: `Hub index is stale for ${section} — run \`mrmr space apply\``,
        path: `murrmure/${section}.yaml`,
      });
    }
  }

  const hubFlows = new Map(hub.digests.flows.map((flow) => [flow.flow_id, flow.digest]));
  for (const flow of local.digests.flows) {
    const hubDigest = hubFlows.get(flow.flow_id);
    if (!hubDigest) {
      pushIssue(issues, {
        code: "INDEX_NOT_APPLIED",
        severity: "warning",
        message: `Flow ${flow.flow_id} exists locally but is not indexed on the hub`,
        path: flow.flow_id,
      });
      continue;
    }
    if (hubDigest !== flow.digest) {
      pushIssue(issues, {
        code: "INDEX_DRIFT",
        severity: "warning",
        message: `Hub index is stale for flow ${flow.flow_id} — run \`mrmr space apply\``,
        path: flow.flow_id,
      });
    }
  }

  const localFlowIds = new Set(local.digests.flows.map((flow) => flow.flow_id));
  for (const flow of hub.digests.flows) {
    if (!localFlowIds.has(flow.flow_id)) {
      pushIssue(issues, {
        code: "INDEX_ORPHAN",
        severity: "info",
        message: `Hub indexes flow ${flow.flow_id} that is not present locally`,
        path: flow.flow_id,
      });
    }
  }
}

export function runFlowContractTests(
  projectPath: string,
  testFiles: string[],
): SpaceDoctorTestResult {
  if (testFiles.length === 0) {
    return { files: [], passed: true, skipped: true, detail: "no contract tests found" };
  }

  const relFiles = testFiles.map((file) => relative(projectPath, file));
  const runners: Array<{ cmd: string; args: string[] }> = [
    { cmd: "bun", args: ["test", ...relFiles] },
    { cmd: "pnpm", args: ["exec", "vitest", "run", ...relFiles] },
    { cmd: "npx", args: ["vitest", "run", ...relFiles] },
  ];

  for (const runner of runners) {
    const result = spawnSync(runner.cmd, runner.args, {
      cwd: projectPath,
      encoding: "utf8",
      env: process.env,
    });
    if (result.error && "code" in result.error && result.error.code === "ENOENT") {
      continue;
    }
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    return {
      files: relFiles,
      passed: result.status === 0,
      skipped: false,
      detail: detail || undefined,
    };
  }

  return {
    files: relFiles,
    passed: false,
    skipped: true,
    detail: "no test runner available (install vitest or use bun)",
  };
}

export async function runSpaceDoctor(options: {
  cwd?: string;
  projectPath?: string;
  spaceId?: string;
  auth?: HubAuth;
  flags?: GlobalFlags;
  skipTests?: boolean;
}): Promise<SpaceDoctorResult> {
  const startPath = options.cwd ?? options.projectPath ?? process.cwd();
  const discovered = discoverMurrmureProject(startPath);
  const projectPath = options.projectPath ? resolve(options.projectPath) : discovered.projectPath;
  const issues: SpaceDoctorIssue[] = [];
  const authInfo = inspectAuth(options.flags);
  const auth = options.auth ?? authInfo.auth;

  const spaceResolution = resolveSpaceId(options.flags ?? {}, options.spaceId ?? discovered.link?.space_id);
  const spaceId =
    "error" in spaceResolution
      ? (options.spaceId ?? discovered.link?.space_id ?? authInfo.defaultSpaceId)
      : spaceResolution.spaceId;

  const legacyIssues = scanLegacyWorkspace(projectPath, { walkUp: !discovered.murrmurePresent });
  issues.push(...legacyIssues);
  issues.push(...scanLegacyLayout(projectPath));
  const legacyStudioDetected = legacyIssues.some((issue) => issue.code.startsWith("LEGACY_"));

  const workspace: SpaceDoctorWorkspaceContext = {
    cwd: discovered.cwd,
    project_path: projectPath,
    murrmure_present: discovered.murrmurePresent || existsSync(join(projectPath, ".mrmr")),
    link_present: Boolean(discovered.link ?? readSpaceLink(projectPath)),
    linked_space_id: discovered.link?.space_id ?? readSpaceLink(projectPath)?.space_id,
    auth_source: authInfo.authSource,
    auth_configured: Boolean(auth),
    hub_url: auth?.hubUrl,
    default_space_id: authInfo.defaultSpaceId,
    legacy_studio_detected: legacyStudioDetected,
  };
  const skillsScan = scanSpaceDoctorSkills(projectPath);
  issues.push(...skillsScan.issues);

  if (discovered.cwd !== projectPath) {
    pushIssue(issues, {
      code: "SUBDIRECTORY_CWD",
      severity: "info",
      message: `.mrmr/ found at ${projectPath} (cwd: ${discovered.cwd})`,
      fix: `cd ${projectPath}`,
    });
  }

  if (!auth) {
    pushIssue(issues, {
      code: "AUTH_MISSING",
      severity: "info",
      message: "Hub auth not configured — index drift and whoami checks skipped",
      fix: "mrmr login --hub-url http://127.0.0.1:8787",
    });
  }

  if ("error" in spaceResolution && !spaceId) {
    pushIssue(issues, {
      code: "SPACE_UNLINKED",
      severity: "warning",
      message: spaceResolution.message,
      fix: workspace.murrmure_present
        ? `cd ${projectPath} && mrmr space link --path . --create`
        : `cd ${projectPath} && mrmr space init && mrmr space link --path . --create`,
    });
  } else if (!spaceId) {
    pushIssue(issues, {
      code: "SPACE_UNLINKED",
      severity: "warning",
      message: "No linked space — run `mrmr space onboard` or `mrmr space link`",
      fix: workspace.murrmure_present
        ? `cd ${projectPath} && mrmr space onboard`
        : `cd ${projectPath} && mrmr setup`,
    });
  }

  const mcpScan = scanMcpConfig({
    projectPath,
    cwd: discovered.cwd,
    authToken: auth?.token,
  });
  issues.push(...mcpScan.issues);
  issues.push(
    ...(await probeMcpLiveHealth({
      projectPath,
      cwd: discovered.cwd,
      linkedSpaceId: workspace.linked_space_id,
      auth,
      context: mcpScan.context,
    })),
  );

  if (auth && !spaceId) {
    const whoami = await fetchWhoami(auth);
    if (!("error" in whoami) && whoami.spaces.length > 0) {
      const ids = whoami.spaces.map((entry) => entry.space_id).join(", ");
      pushIssue(issues, {
        code: "SPACE_ID_AVAILABLE",
        severity: "info",
        message: `Token can access hub space(s): ${ids}`,
        fix: `cd ${projectPath} && mrmr space link --path . --space ${whoami.spaces[0]!.space_id}`,
      });
    }
  }

  let murrmureRoot: string | null = null;
  try {
    murrmureRoot = resolveMurrmureRoot(projectPath);
  } catch (error) {
    pushIssue(issues, {
      code: "MURRMURE_DIR_MISSING",
      severity: legacyStudioDetected ? "warning" : "error",
      message: error instanceof Error ? error.message : "murrmure/ directory not found",
      fix: `cd ${projectPath} && mrmr space init`,
    });
  }

  if (!murrmureRoot) {
    const partial: SpaceDoctorResult = {
      ok: !issues.some((issue) => isBlocking(issue.severity)),
      space_id: spaceId,
      project_path: projectPath,
      workspace,
      issues,
      suggestions: [],
      mcp: mcpScan.context,
      skills: skillsScan.context,
    };
    partial.suggestions = buildSpaceDoctorSuggestions(partial);
    return partial;
  }

  issues.push(...scanDeprecatedConfig(murrmureRoot));

  let local: SpaceDoctorSnapshot | undefined;
  try {
    const bundle = readSpaceApplyBundle(projectPath);
    validateSpaceBundleCycles(bundle);
    const validation = validateApplyBundle(bundle);
    if (!validation.ok) {
      pushIssue(issues, {
        code: validation.code,
        severity: "error",
        message: validation.message,
      });
    }
    local = localSnapshotFromBundle(bundle);
    for (const warning of lintSpaceApplyBundle(bundle)) {
      const code = normalizeApplyLintCode(warning.code);
      pushIssue(issues, {
        code,
        severity: applyLintSeverity(code),
        message: warning.message,
        path: warning.code.startsWith("HANDLER_") || warning.code === "STEP_UNCOVERED"
          ? ".mrmr/space/handlers.yaml"
          : undefined,
      });
    }
    issues.push(...lintBindingsInWorkspace({ murrmureRoot, bundle }));
    if (
      (bundle.flows?.length ?? 0) === 0 &&
      (bundle.handlers?.file.handlers.length ?? 0) > 0 &&
      ((bundle.bindings?.file.flows.length ?? 0) + (bundle.bindings?.file.views.length ?? 0) === 0)
    ) {
      pushIssue(issues, {
        code: "WORKER_NO_BINDINGS",
        severity: "warning",
        message: "Worker-style space has handlers but no local flows and no bindings.yaml refs",
        path: ".mrmr/space/bindings.yaml",
      });
    }
    if ((bundle.handlers?.file.handlers.length ?? 0) > 0 && Object.keys(bundle.actions?.file.actions ?? {}).length > 0) {
      pushIssue(issues, {
        code: "HANDLER_LEGACY_ACTIONS",
        severity: "warning",
        message: "Both handlers and legacy actions are present; prefer handlers.yaml for dispatch",
        path: ".mrmr/space/actions.yaml",
      });
    }
    if (local.counts.flows === 0 && workspace.murrmure_present) {
      pushIssue(issues, {
        code: "NO_INDEXED_FLOWS",
        severity: "info",
        message: "murrmure/ has no indexed flows — run `mrmr space flow init hello`",
        fix: `cd ${projectPath} && mrmr space flow init hello --template hello-gate && mrmr space apply`,
      });
    }
    if (
      local.counts.actions === 0 &&
      local.counts.executors === 0 &&
      local.counts.hooks === 0 &&
      local.counts.flows === 0 &&
      legacyStudioDetected
    ) {
      pushIssue(issues, {
        code: "MURRMURE_SCAFFOLD_EMPTY",
        severity: "warning",
        message:
          "murrmure/ exists but has no indexed flows or actions — port legacy capability.manifest.json to murrmure/flows/*/flow.manifest.yaml",
        fix: `cd ${projectPath} && mrmr space init`,
      });
    }
  } catch (error) {
    pushIssue(issues, {
      code: "LOCAL_VALIDATION_FAILED",
      severity: "error",
      message: error instanceof Error ? error.message : "Local murrmure/ validation failed",
    });
  }

  let hub: (SpaceDoctorSnapshot & { reachable: boolean }) | undefined;
  if (auth && spaceId) {
    try {
      const res = await fetch(`${auth.hubUrl}/v1/spaces/${spaceId}/index/status`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) {
        pushIssue(issues, {
          code: "HUB_INDEX_STATUS_FAILED",
          severity: "warning",
          message: `Hub index status returned HTTP ${res.status}`,
        });
      } else {
        const body = (await res.json()) as HubIndexStatusResponse;
        hub = { ...hubSnapshotFromStatus(body), reachable: true };

        if (local) {
          compareIndexDigests(local, hub, issues);
          const localHasContent =
            local.counts.actions > 0 ||
            local.counts.executors > 0 ||
            local.counts.hooks > 0 ||
            local.counts.flows > 0;
          const hubEmpty =
            hub.counts.actions === 0 &&
            hub.counts.executors === 0 &&
            hub.counts.hooks === 0 &&
            hub.counts.flows === 0;
          if (localHasContent && hubEmpty) {
            pushIssue(issues, {
              code: "INDEX_EMPTY",
              severity: "warning",
              message: "Local murrmure/ has content but the hub index is empty — run `mrmr space apply`",
            });
          }
        }

        const bindings = body.bindings ?? [];
        if (bindings.length > 0) {
          const matches = bindings.some((binding) => resolve(binding.path) === projectPath);
          if (!matches) {
            pushIssue(issues, {
              code: "BINDING_PATH_MISMATCH",
              severity: "warning",
              message: `Hub bindings do not include ${projectPath}`,
            });
          }
        } else if (workspace.link_present) {
          pushIssue(issues, {
            code: "BINDING_MISSING",
            severity: "warning",
            message: "Local .mrmr/space/space.yaml link exists but hub has no path bindings — run `mrmr space link`",
            fix: `cd ${projectPath} && mrmr space link --path . --space ${spaceId}`,
          });
        }
      }
    } catch (error) {
      pushIssue(issues, {
        code: "HUB_UNREACHABLE",
        severity: "warning",
        message: error instanceof Error ? error.message : "Could not reach hub for index status",
      });
    }
  } else if (spaceId && !auth) {
    pushIssue(issues, {
      code: "HUB_CHECK_SKIPPED",
      severity: "info",
      message: "Hub index checks skipped — configure hub auth to compare local files with the indexed space",
    });
  }

  let tests: SpaceDoctorTestResult | undefined;
  if (!options.skipTests) {
    const testFiles = discoverFlowContractTests(murrmureRoot);
    tests = runFlowContractTests(projectPath, testFiles);
    if (!tests.skipped && !tests.passed) {
      pushIssue(issues, {
        code: "CONTRACT_TESTS_FAILED",
        severity: "error",
        message: `Contract tests failed (${tests.files.length} file(s))`,
      });
    } else if (tests.skipped && tests.files.length > 0) {
      pushIssue(issues, {
        code: "CONTRACT_TESTS_SKIPPED",
        severity: "warning",
        message: tests.detail ?? "Contract tests could not run",
      });
    }
  }

  const result: SpaceDoctorResult = {
    ok: !issues.some((issue) => isBlocking(issue.severity)),
    space_id: spaceId,
    project_path: projectPath,
    workspace,
    issues,
    suggestions: [],
    local,
    hub,
    tests,
    mcp: mcpScan.context,
    skills: skillsScan.context,
  };
  result.suggestions = buildSpaceDoctorSuggestions(result);
  return result;
}

const HIDDEN_HUMAN_ISSUE_CODES = new Set([
  "SUBDIRECTORY_CWD",
  "AUTH_MISSING",
  "HUB_CHECK_SKIPPED",
  "SPACE_ID_AVAILABLE",
]);

const LEGACY_BUNDLED_ISSUE_CODES = new Set([
  "LEGACY_STUDIO_PACKAGE",
  "LEGACY_CAPABILITY_MANIFEST",
  "MURRMURE_SCAFFOLD_EMPTY",
  "MURRMURE_DIR_MISSING",
]);

export function legacyManifestPaths(result: SpaceDoctorResult): string[] {
  return result.issues
    .filter((issue) => issue.code === "LEGACY_CAPABILITY_MANIFEST" && issue.path)
    .map((issue) => issue.path!);
}

export function humanVisibleIssues(result: SpaceDoctorResult): SpaceDoctorIssue[] {
  const skip = new Set(HIDDEN_HUMAN_ISSUE_CODES);
  if (result.workspace.legacy_studio_detected) {
    for (const code of LEGACY_BUNDLED_ISSUE_CODES) {
      skip.add(code);
    }
  }
  return result.issues.filter((issue) => {
    if (skip.has(issue.code)) {
      return false;
    }
    if (issue.code === "SPACE_UNLINKED" && !result.space_id) {
      return false;
    }
    return true;
  });
}

export function countHumanProblems(result: SpaceDoctorResult): number {
  const visible = humanVisibleIssues(result).filter((issue) => issue.severity !== "info").length;
  if (visible > 0) {
    return visible;
  }
  return result.workspace.legacy_studio_detected ? 1 : 0;
}

function spaceLine(result: SpaceDoctorResult): string {
  if (result.space_id) {
    return result.space_id;
  }
  if (result.workspace.link_present && result.workspace.linked_space_id) {
    return result.workspace.linked_space_id;
  }
  return "not linked";
}

function authLine(result: SpaceDoctorResult): string {
  if (!result.workspace.auth_configured) {
    return "not configured";
  }
  return result.workspace.hub_url ?? result.workspace.auth_source ?? "configured";
}

export function formatSpaceDoctorHuman(result: SpaceDoctorResult): string {
  const lines: string[] = [];
  const { workspace } = result;

  lines.push(`Project  ${result.project_path}`);
  if (workspace.cwd !== workspace.project_path) {
    lines.push(`Cwd      ${workspace.cwd}`);
  }
  lines.push(`Space    ${spaceLine(result)}`);
  lines.push(`Hub      ${authLine(result)}`);

  if (result.local) {
    const { counts } = result.local;
    lines.push(
      `Local    ${counts.flows} flow(s), ${counts.actions} action(s), ${counts.hooks} hook(s)`,
    );
  }

  if (result.hub) {
    const { counts } = result.hub;
    lines.push(
      `Indexed  ${counts.flows} flow(s), ${counts.actions} action(s), ${counts.hooks} hook(s)`,
    );
  }

  if (workspace.legacy_studio_detected) {
    lines.push("");
    lines.push("Legacy Studio v1 detected (@studio/capability).");
    lines.push("Murrmure v2 only indexes murrmure/flows/*/flow.manifest.yaml — not capability.manifest.json.");
    const manifests = legacyManifestPaths(result);
    if (manifests.length === 1) {
      lines.push(`Legacy manifest: ${manifests[0]}`);
    } else if (manifests.length > 1) {
      lines.push(`Legacy manifests: ${manifests.join(", ")}`);
    }
    if (result.local && result.local.counts.flows === 0 && result.local.counts.actions === 0) {
      lines.push("murrmure/ exists but is empty — run init to scaffold v2 layout.");
    } else if (!workspace.murrmure_present) {
      lines.push("No murrmure/ directory yet.");
    }
  }

  const mcpIssues = result.issues.filter(
    (issue) => issue.code.startsWith("MCP_") && issue.severity !== "info",
  );
  if (result.mcp || mcpIssues.length > 0) {
    lines.push("");
    lines.push("MCP");
    if (result.mcp?.config_paths.length) {
      for (const configPath of result.mcp.config_paths) {
        lines.push(`  Config: ${configPath}`);
      }
    } else {
      lines.push("  Config: missing .cursor/mcp.json");
    }
    for (const issue of mcpIssues) {
      const prefix = issue.severity === "error" ? "✗" : "!";
      lines.push(`  ${prefix} ${issue.message}`);
    }
    if (result.mcp?.suggested_snippet && mcpIssues.length > 0) {
      lines.push("");
      lines.push("Suggested .cursor/mcp.json:");
      lines.push(result.mcp.suggested_snippet);
    }
  }

  const visible = humanVisibleIssues(result).filter(
    (issue) => issue.severity !== "info" && !issue.code.startsWith("MCP_"),
  );
  if (visible.length > 0) {
    lines.push("");
    lines.push("Problems");
    for (const issue of visible) {
      const prefix = issue.severity === "error" ? "✗" : "!";
      lines.push(`  ${prefix} ${issue.message}`);
    }
  }

  const plan = buildSpaceDoctorFixPlan(result);
  if (plan.length > 0) {
    lines.push("");
    lines.push("Try this");
    plan.forEach((step, index) => {
      const note = step.why ? `  # ${step.why}` : "";
      lines.push(`  ${index + 1}. ${step.command}${note}`);
    });
  }

  return lines.join("\n");
}
