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

function parseTemplateHandlers(templateDir: string, flowId: string): Array<Record<string, unknown>> {
  const handlersPath = join(templateDir, "handlers.yaml");
  if (!existsSync(handlersPath)) {
    return [];
  }
  const parsed = parseYaml(
    applyFlowTemplateTokens(readFileSync(handlersPath, "utf-8"), flowId),
  ) as { handlers?: Array<Record<string, unknown>> };
  return parsed.handlers ?? [];
}

function mergeHandlersFile(
  murrmureRoot: string,
  templateDir: string,
  flowId: string,
): boolean {
  const handlersPath = join(murrmureRoot, "space", "handlers.yaml");
  const incoming = parseTemplateHandlers(templateDir, flowId);
  if (incoming.length === 0) {
    return false;
  }

  let doc: { version: number; handlers: Array<Record<string, unknown>>; run_policies?: unknown[] } =
    { version: 1, handlers: [] };
  if (existsSync(handlersPath)) {
    const parsed = parseYaml(readFileSync(handlersPath, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const asRecord = parsed as Record<string, unknown>;
      doc = {
        version: 1,
        handlers: Array.isArray(asRecord.handlers)
          ? (asRecord.handlers as Array<Record<string, unknown>>)
          : [],
        run_policies: Array.isArray(asRecord.run_policies)
          ? (asRecord.run_policies as unknown[])
          : undefined,
      };
    }
  }

  const existingIds = new Set(
    doc.handlers.map((h) => (typeof h.id === "string" ? h.id : "")),
  );
  let changed = false;
  for (const handler of incoming) {
    const id = typeof handler.id === "string" ? handler.id : "";
    if (!id || existingIds.has(id)) continue;
    doc.handlers.push(handler);
    existingIds.add(id);
    changed = true;
  }

  if (!changed && existsSync(handlersPath)) {
    return false;
  }

  mkdirSync(dirname(handlersPath), { recursive: true });
  writeFileSync(handlersPath, stringifyYaml(doc), "utf-8");
  return true;
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

  const handlersPath = join(murrmureRoot, "space", "handlers.yaml");
  if (mergeHandlersFile(murrmureRoot, templateDir, flowId)) {
    created.push(handlersPath);
  }

  const hooksTemplate = join(templateDir, "hooks.yaml");
  const hooksDest = join(murrmureRoot, "space", "hooks.yaml");
  if (!existsSync(hooksDest) && existsSync(hooksTemplate)) {
    writeFileSync(
      hooksDest,
      applyFlowTemplateTokens(readFileSync(hooksTemplate, "utf-8"), flowId),
      "utf-8",
    );
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
