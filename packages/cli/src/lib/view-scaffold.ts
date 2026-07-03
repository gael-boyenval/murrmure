import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { cliResourcePath } from "./cli-package-root.js";

const VIEW_TEMPLATE_TOKEN = "{{VIEW_ID}}";

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

function applyTemplateTokens(content: string, viewId: string): string {
  return content.replaceAll(VIEW_TEMPLATE_TOKEN, viewId);
}

export function assertSafeViewId(viewId: string): void {
  if (!viewId || viewId === "." || viewId === "..") {
    throw new Error(`Invalid view id '${viewId}': must be a single path segment`);
  }
  if (viewId.includes("..") || viewId.includes("/") || viewId.includes("\\")) {
    throw new Error(`Invalid view id '${viewId}': must not contain path separators or '..'`);
  }
  if (viewId.startsWith(sep) || /^[a-zA-Z]:/.test(viewId)) {
    throw new Error(`Invalid view id '${viewId}': must be a relative single segment`);
  }
}

export function resolveViewDir(murrmureRoot: string, viewId: string): string {
  assertSafeViewId(viewId);
  const viewDir = resolve(murrmureRoot, "views", viewId);
  const viewsRoot = resolve(murrmureRoot, "views");
  if (viewDir !== viewsRoot && !viewDir.startsWith(`${viewsRoot}${sep}`)) {
    throw new Error(`Invalid view id '${viewId}': path escapes views directory`);
  }
  return viewDir;
}

export function scaffoldViewPackage(targetMurrmureRoot: string, viewId: string): string[] {
  const viewDir = resolveViewDir(targetMurrmureRoot, viewId);
  if (existsSync(viewDir)) {
    throw new Error(`View '${viewId}' already exists at ${viewDir}`);
  }

  const templateDir = cliResourcePath("templates", "views", "vite-react");
  const created: string[] = [];

  for (const srcPath of listFilesRecursive(templateDir)) {
    const rel = srcPath.slice(templateDir.length + 1);
    const dest = join(viewDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const raw = readFileSync(srcPath, "utf-8");
    writeFileSync(dest, applyTemplateTokens(raw, viewId), "utf-8");
    created.push(dest);
  }

  return created;
}

export function resolveMurrmureRootFromCwd(cwd: string, spaceRoot?: string): string {
  const base = spaceRoot ? resolve(spaceRoot) : resolve(cwd);
  const direct = join(base, "murrmure");
  if (existsSync(direct)) return direct;
  throw new Error(`No murrmure/ directory — run from a linked space root or pass --space-root`);
}

