import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  SpaceApplyBundleSchema,
  type SpaceApplyBundle,
} from "@murrmure/contracts";
import {
  computeContentDigest,
  detectFlowCallCycles,
  parseActionsFile,
  parseExecutorsFile,
  parseFlowManifest,
  parseHooksFile,
  parseEventsFile,
  parseViewManifest,
  resolveHooksFilename,
} from "@murrmure/hub-core";

const EMPTY_ACTIONS_FILE = { version: 1 as const, actions: {} };
const EMPTY_EXECUTORS_FILE = { executors: {} };
const EMPTY_HOOKS_FILE = { version: 1 as const, hooks: {} };
const EMPTY_EVENTS_FILE = { version: 1 as const, events: {} };

function stableFlowId(relPath: string): string {
  const withoutManifest = relPath.replace(/\/flow\.manifest\.yaml$/, "");
  const slug = withoutManifest.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `flw_${slug || "unnamed"}`;
}

function readYamlFile(path: string): unknown {
  return parseYaml(readFileSync(path, "utf-8"));
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
  const direct = join(cwd, "murrmure");
  if (existsSync(direct) && statSync(direct).isDirectory()) return direct;
  throw new Error(`No murrmure/ directory in ${cwd}`);
}

export function readSpaceApplyBundle(cwd: string): SpaceApplyBundle {
  const root = resolveMurrmureRoot(cwd);
  const bundle: SpaceApplyBundle = { flows: [], views: [] };
  const seenFlowIds = new Set<string>();

  const actionsPath = join(root, "actions.yaml");
  if (existsSync(actionsPath)) {
    const file = parseActionsFile(readYamlFile(actionsPath));
    if (!file.ok) throw new Error(`${file.code}: ${file.message}`);
    bundle.actions = { digest: fileDigest(actionsPath), file: file.value };
  } else {
    bundle.actions = {
      digest: computeContentDigest(EMPTY_ACTIONS_FILE),
      file: EMPTY_ACTIONS_FILE,
    };
  }

  const executorsPath = join(root, "executors.yaml");
  if (existsSync(executorsPath)) {
    const file = parseExecutorsFile(readYamlFile(executorsPath));
    if (!file.ok) throw new Error(`${file.code}: ${file.message}`);
    bundle.executors = { digest: fileDigest(executorsPath), file: file.value };
  } else {
    bundle.executors = {
      digest: computeContentDigest(EMPTY_EXECUTORS_FILE),
      file: EMPTY_EXECUTORS_FILE,
    };
  }

  const hooksCandidates = ["hooks.yaml", "triggers.yaml"] as const;
  const hooksPath = hooksCandidates
    .map((name) => join(root, name))
    .find((path) => existsSync(path));
  if (hooksPath) {
    const file = parseHooksFile(readYamlFile(hooksPath));
    if (!file.ok) throw new Error(`${file.code}: ${file.message}`);
    bundle.hooks = { digest: fileDigest(hooksPath), file: file.value };
  } else {
    bundle.hooks = {
      digest: computeContentDigest(EMPTY_HOOKS_FILE),
      file: EMPTY_HOOKS_FILE,
    };
  }

  const eventsPath = join(root, "events.yaml");
  if (existsSync(eventsPath)) {
    const file = parseEventsFile(readYamlFile(eventsPath));
    if (!file.ok) throw new Error(`${file.code}: ${file.message}`);
    bundle.events = { digest: fileDigest(eventsPath), file: file.value };
  } else {
    bundle.events = {
      digest: computeContentDigest(EMPTY_EVENTS_FILE),
      file: EMPTY_EVENTS_FILE,
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
  const path = join(resolveMurrmureRoot(cwd), "space.yaml");
  if (!existsSync(path)) return undefined;
  const raw = readYamlFile(path) as { slug?: string };
  return typeof raw.slug === "string" ? raw.slug : undefined;
}

export { computeContentDigest, resolveHooksFilename };
