import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { cliResourcePath } from "./cli-package-root.js";
import { scaffoldViewPackage } from "./view-scaffold.js";

export type FlowScaffoldTemplate = "hello-gate" | "hello-invoke";

function listFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isFile()) {
      files.push(path);
    } else if (stat.isDirectory()) {
      files.push(...listFilesRecursive(path));
    }
  }
  return files;
}

function applyFlowTemplateTokens(content: string, flowId: string): string {
  return content.replaceAll("{{FLOW_ID}}", flowId);
}

export function assertSafeFlowId(flowId: string): void {
  if (!flowId || flowId === "." || flowId === "..") {
    throw new Error(`Invalid flow id '${flowId}': must be a single path segment`);
  }
  if (flowId.includes("..") || flowId.includes("/") || flowId.includes("\\")) {
    throw new Error(`Invalid flow id '${flowId}': must not contain path separators or '..'`);
  }
  if (/[\0-\x1F\x7F]/.test(flowId)) {
    throw new Error(`Invalid flow id '${flowId}': must not contain control characters`);
  }
  if (flowId.startsWith(sep) || /^[a-zA-Z]:/.test(flowId)) {
    throw new Error(`Invalid flow id '${flowId}': must be a relative single segment`);
  }
}

export function resolveFlowDir(murrmureRoot: string, flowId: string): string {
  assertSafeFlowId(flowId);
  const flowDir = resolve(murrmureRoot, "flows", flowId);
  const flowsRoot = resolve(murrmureRoot, "flows");
  if (flowDir !== flowsRoot && !flowDir.startsWith(`${flowsRoot}${sep}`)) {
    throw new Error(`Invalid flow id '${flowId}': path escapes flows directory`);
  }
  return flowDir;
}

function mergeYamlSection<T extends Record<string, unknown>>(
  path: string,
  sectionKey: string,
  entries: Record<string, unknown>,
  defaults?: Record<string, unknown>,
): boolean {
  let doc: Record<string, unknown> = { ...(defaults ?? {}) };
  if (existsSync(path)) {
    const parsed = parseYaml(readFileSync(path, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      doc = { ...doc, ...(parsed as Record<string, unknown>) };
    }
  }

  const section = doc[sectionKey];
  const target =
    section && typeof section === "object" && !Array.isArray(section)
      ? { ...(section as Record<string, unknown>) }
      : {};

  let changed = false;
  for (const [key, value] of Object.entries(entries)) {
    if (!(key in target)) {
      target[key] = value;
      changed = true;
    }
  }

  if (!changed && existsSync(path)) {
    return false;
  }

  doc[sectionKey] = target;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyYaml(doc), "utf-8");
  return true;
}

function copyTemplateTree(templateDir: string, destRoot: string, flowId: string): string[] {
  const created: string[] = [];
  for (const srcPath of listFilesRecursive(templateDir)) {
    const rel = applyFlowTemplateTokens(srcPath.slice(templateDir.length + 1), flowId);
    const dest = join(destRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const raw = readFileSync(srcPath, "utf-8");
    writeFileSync(dest, applyFlowTemplateTokens(raw, flowId), "utf-8");
    created.push(dest);
  }
  return created;
}

function parseTemplateActions(templateDir: string, flowId: string): Record<string, unknown> {
  const actionsPath = join(templateDir, "actions.yaml");
  if (!existsSync(actionsPath)) {
    return {};
  }
  const parsed = parseYaml(readFileSync(actionsPath, "utf-8")) as {
    actions?: Record<string, unknown>;
  };
  const actions = parsed.actions ?? {};
  const resolved: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(actions)) {
    const resolvedName = applyFlowTemplateTokens(name, flowId);
    if (spec && typeof spec === "object") {
      resolved[resolvedName] = JSON.parse(
        applyFlowTemplateTokens(JSON.stringify(spec), flowId),
      ) as unknown;
    }
  }
  return resolved;
}

function parseTemplateExecutors(templateDir: string): Record<string, unknown> {
  const executorsPath = join(templateDir, "executors.yaml");
  if (!existsSync(executorsPath)) {
    return {};
  }
  const parsed = parseYaml(readFileSync(executorsPath, "utf-8")) as {
    executors?: Record<string, unknown>;
  };
  return parsed.executors ?? {};
}

export function scaffoldFlowPackage(
  murrmureRoot: string,
  flowId: string,
  template: FlowScaffoldTemplate = "hello-gate",
): string[] {
  assertSafeFlowId(flowId);
  const flowDir = resolveFlowDir(murrmureRoot, flowId);
  if (existsSync(flowDir)) {
    throw new Error(`Flow '${flowId}' already exists at ${flowDir}`);
  }

  const templateDir = cliResourcePath("templates", "space", "flows", template);
  const created: string[] = [];

  const actionsPath = join(murrmureRoot, "space", "actions.yaml");
  if (mergeYamlSection(actionsPath, "actions", parseTemplateActions(templateDir, flowId), { version: 1 })) {
    created.push(actionsPath);
  }

  const executorsPath = join(murrmureRoot, "space", "executors.yaml");
  if (mergeYamlSection(executorsPath, "executors", parseTemplateExecutors(templateDir))) {
    created.push(executorsPath);
  }

  const hooksTemplate = join(templateDir, "hooks.yaml");
  const hooksDest = join(murrmureRoot, "space", "hooks.yaml");
  if (!existsSync(hooksDest) && existsSync(hooksTemplate)) {
    writeFileSync(hooksDest, readFileSync(hooksTemplate, "utf-8"), "utf-8");
    created.push(hooksDest);
  }

  mkdirSync(flowDir, { recursive: true });
  const manifestSrc = join(templateDir, "flow.manifest.yaml");
  const manifestDest = join(flowDir, "flow.manifest.yaml");
  writeFileSync(
    manifestDest,
    applyFlowTemplateTokens(readFileSync(manifestSrc, "utf-8"), flowId),
    "utf-8",
  );
  created.push(manifestDest);

  const scriptsDir = join(templateDir, "scripts");
  if (existsSync(scriptsDir)) {
    created.push(...copyTemplateTree(scriptsDir, join(murrmureRoot, "space", "scripts"), flowId));
  }

  if (template === "hello-gate") {
    created.push(...scaffoldViewPackage(murrmureRoot, flowId));
    created.push(...scaffoldViewPackage(murrmureRoot, `${flowId}-intake`));
  }

  return created;
}
