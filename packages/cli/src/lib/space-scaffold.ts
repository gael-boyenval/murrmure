import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { cliResourcePath } from "./cli-package-root.js";

type TemplateManifest = Record<string, string>;

function loadManifest(): TemplateManifest {
  const raw = readFileSync(cliResourcePath("templates", "space", "manifest.json"), "utf-8");
  return JSON.parse(raw) as TemplateManifest;
}

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

export function isMurrmureDirEmpty(murrmureRoot: string): boolean {
  if (!existsSync(murrmureRoot)) {
    return false;
  }
  return listFilesRecursive(murrmureRoot).length === 0;
}

export function scaffoldMurrmureDir(targetDir: string): {
  created: string[];
  filledEmptyMurrmure: boolean;
} {
  const root = join(targetDir, "murrmure");
  let filledEmptyMurrmure = false;

  if (existsSync(root)) {
    if (!isMurrmureDirEmpty(root)) {
      throw new Error(`murrmure/ already exists at ${root} — remove it or use a fresh directory`);
    }
    filledEmptyMurrmure = true;
  } else {
    mkdirSync(root, { recursive: true });
  }

  const tempRoot = join(targetDir, ".mrmr.temp");
  if (!existsSync(tempRoot)) {
    mkdirSync(join(tempRoot, "inbox"), { recursive: true });
    mkdirSync(join(tempRoot, "outbox"), { recursive: true });
  }
  const gitignorePath = join(tempRoot, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "*\n!.gitignore\n", "utf-8");
  }

  const created: string[] = [];
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "*\n!.gitignore\n", "utf-8");
    created.push(gitignorePath);
  }

  const manifest = loadManifest();
  for (const [rel, content] of Object.entries(manifest)) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, "utf-8");
    created.push(dest);
  }

  const exampleFlow = cliResourcePath("templates", "space", "flows", "example", "flow.manifest.yaml");
  const flowDestDir = join(root, "flows", "example");
  mkdirSync(flowDestDir, { recursive: true });
  const flowDest = join(flowDestDir, "flow.manifest.yaml");
  writeFileSync(flowDest, readFileSync(exampleFlow, "utf-8"), "utf-8");
  created.push(flowDest);

  return { created, filledEmptyMurrmure };
}
