import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  ActionsFileSchema,
  ExecutorsFileSchema,
  HooksFileSchema,
  EventsFileSchema,
  SpaceApplyBundleSchema,
  type SpaceApplyBundle,
} from "@murrmure/contracts";
import {
  computeContentDigest,
  detectFlowCallCycles,
  parseBindingsFile,
  parseFlowManifest,
  parseHandlersFile,
  parseViewManifest,
} from "@murrmure/hub-core";

const EMPTY_ACTIONS_FILE = { version: 1 as const, actions: {} };
const EMPTY_EXECUTORS_FILE = { executors: {} };
const EMPTY_HOOKS_FILE = { version: 1 as const, hooks: {} };
const EMPTY_HANDLERS_FILE = { version: 1 as const, run_policies: [], handlers: [] };
const EMPTY_EVENTS_FILE = { version: 1 as const, events: {} };
const EMPTY_BINDINGS_FILE = { version: 1 as const, flows: [], views: [] };
const HOOKS_FILENAMES = ["hooks.yaml", "triggers.yaml"] as const;

function resolveHooksFilename(filename: string): (typeof HOOKS_FILENAMES)[number] | null {
  if (filename === "hooks.yaml" || filename === "triggers.yaml") return filename;
  return null;
}

function stableFlowId(relPath: string): string {
  const withoutManifest = relPath.replace(/\/flow\.manifest\.yaml$/, "");
  const slug = withoutManifest.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `flw_${slug || "unnamed"}`;
}

function readYamlFile(path: string): unknown {
  return parseYaml(readFileSync(path, "utf-8"));
}

function parseActionsFile(raw: unknown) {
  const parsed = ActionsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("INVALID_ACTIONS: actions.yaml failed validation");
  }
  return parsed.data;
}

function parseExecutorsFile(raw: unknown) {
  const parsed = ExecutorsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("INVALID_EXECUTORS: executors.yaml failed validation");
  }
  return parsed.data;
}

function parseHooksFile(raw: unknown) {
  const parsed = HooksFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("INVALID_HOOKS: hooks.yaml failed validation");
  }
  return parsed.data;
}

function parseEventsFile(raw: unknown) {
  const parsed = EventsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("INVALID_EVENTS: events.yaml failed validation");
  }
  return parsed.data;
}

function fileDigest(path: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return `sha256:${hash.digest("hex")}`;
}

function viewBuildStatus(viewDir: string, entry?: string) {
  const distPresent = existsSync(join(viewDir, "dist"));
  const entryPresent = entry ? existsSync(join(viewDir, entry)) : distPresent;
  return { dist_present: distPresent, entry_present: entryPresent };
}

function asManifestRaw(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

export function resolveMurrmureRoot(cwd: string): string {
  const direct = join(cwd, ".mrmr");
  if (existsSync(direct) && statSync(direct).isDirectory()) return direct;
  throw new Error(`No .mrmr/ directory in ${cwd}`);
}

export function readSpaceApplyBundle(cwd: string): SpaceApplyBundle {
  const root = resolveMurrmureRoot(cwd);
  const spaceDir = join(root, "space");
  const bundle: SpaceApplyBundle = { flows: [], views: [] };
  const seenFlowIds = new Set<string>();

  const actionsPath = join(spaceDir, "actions.yaml");
  if (existsSync(actionsPath)) {
    const file = parseActionsFile(readYamlFile(actionsPath));
    bundle.actions = { digest: fileDigest(actionsPath), file };
  } else {
    bundle.actions = {
      digest: computeContentDigest(EMPTY_ACTIONS_FILE),
      file: EMPTY_ACTIONS_FILE,
    };
  }

  const executorsPath = join(spaceDir, "executors.yaml");
  if (existsSync(executorsPath)) {
    const file = parseExecutorsFile(readYamlFile(executorsPath));
    bundle.executors = { digest: fileDigest(executorsPath), file };
  } else {
    bundle.executors = {
      digest: computeContentDigest(EMPTY_EXECUTORS_FILE),
      file: EMPTY_EXECUTORS_FILE,
    };
  }

  const hooksCandidates = HOOKS_FILENAMES;
  const hooksPath = hooksCandidates
    .map((name) => join(spaceDir, name))
    .find((path) => existsSync(path));
  if (hooksPath) {
    const file = parseHooksFile(readYamlFile(hooksPath));
    bundle.hooks = { digest: fileDigest(hooksPath), file };
  } else {
    bundle.hooks = {
      digest: computeContentDigest(EMPTY_HOOKS_FILE),
      file: EMPTY_HOOKS_FILE,
    };
  }

  const handlersPath = join(spaceDir, "handlers.yaml");
  if (existsSync(handlersPath)) {
    const raw = readYamlFile(handlersPath);
    const parsed = parseHandlersFile(raw);
    if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
    bundle.handlers = { digest: fileDigest(handlersPath), file: parsed.value };
  } else {
    bundle.handlers = {
      digest: computeContentDigest(EMPTY_HANDLERS_FILE),
      file: EMPTY_HANDLERS_FILE,
    };
  }

  const eventsPath = join(spaceDir, "events.yaml");
  if (existsSync(eventsPath)) {
    const file = parseEventsFile(readYamlFile(eventsPath));
    bundle.events = { digest: fileDigest(eventsPath), file };
  } else {
    bundle.events = {
      digest: computeContentDigest(EMPTY_EVENTS_FILE),
      file: EMPTY_EVENTS_FILE,
    };
  }

  const bindingsPath = join(spaceDir, "bindings.yaml");
  if (existsSync(bindingsPath)) {
    const raw = readYamlFile(bindingsPath);
    const parsed = parseBindingsFile(raw);
    if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
    bundle.bindings = { digest: fileDigest(bindingsPath), file: parsed.value };
  } else {
    bundle.bindings = {
      digest: computeContentDigest(EMPTY_BINDINGS_FILE),
      file: EMPTY_BINDINGS_FILE,
    };
  }

  const flowsDir = join(root, "flows");
  if (existsSync(flowsDir)) {
    for (const entry of readdirSync(flowsDir).sort()) {
      const flowDir = join(flowsDir, entry);
      if (!statSync(flowDir).isDirectory()) continue;
      const manifestPath = join(flowDir, "flow.manifest.yaml");
      if (!existsSync(manifestPath)) continue;
      const raw = readYamlFile(manifestPath);
      const parsed = parseFlowManifest(raw);
      if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
      const relPath = relative(root, manifestPath);
      const flowId = stableFlowId(relPath);
      if (seenFlowIds.has(flowId)) {
        throw new Error(
          `DUPLICATE_FLOW_ID: multiple flows resolve to '${flowId}' (manifest path collision)`,
        );
      }
      seenFlowIds.add(flowId);
      (bundle.flows ??= []).push({
        flow_id: flowId,
        rel_path: relPath,
        digest: fileDigest(manifestPath),
        manifest: parsed.value,
        raw: asManifestRaw(raw),
      });
    }
  }

  const viewsDir = join(root, "views");
  if (existsSync(viewsDir)) {
    for (const entry of readdirSync(viewsDir).sort()) {
      const viewDir = join(viewsDir, entry);
      if (!statSync(viewDir).isDirectory()) continue;
      const manifestPath = join(viewDir, "view.manifest.yaml");
      if (!existsSync(manifestPath)) continue;
      const raw = readYamlFile(manifestPath);
      const parsed = parseViewManifest(raw);
      if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
      (bundle.views ??= []).push({
        view_id: parsed.value.id || entry,
        rel_path: relative(root, manifestPath),
        digest: fileDigest(manifestPath),
        manifest: parsed.value,
        build: viewBuildStatus(viewDir, parsed.value.entry),
      });
    }
  }

  return SpaceApplyBundleSchema.parse(bundle);
}

export function validateSpaceBundleCycles(bundle: SpaceApplyBundle): void {
  const cycleCheck = detectFlowCallCycles(bundle);
  if (!cycleCheck.ok) {
    throw new Error(`${cycleCheck.code}: ${cycleCheck.message}`);
  }
}

export function readSpaceSlug(cwd: string): string | undefined {
  const path = join(resolveMurrmureRoot(cwd), "space", "space.yaml");
  if (!existsSync(path)) return undefined;
  const raw = readYamlFile(path) as { slug?: string };
  return typeof raw.slug === "string" ? raw.slug : undefined;
}

export { computeContentDigest, resolveHooksFilename };
