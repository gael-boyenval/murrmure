import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface ValidateIssue {
  code: string;
  message: string;
  hint?: Record<string, unknown>;
}

const DEFAULT_SKIP_TOP_LEVEL = new Set(["src", "entry.js"]);

function copyUiTreeExcept(sourceUiDir: string, stageUiDir: string, skipTopLevel: Set<string>): void {
  for (const name of readdirSync(sourceUiDir)) {
    if (skipTopLevel.has(name)) {
      continue;
    }
    const sourcePath = join(sourceUiDir, name);
    const destPath = join(stageUiDir, name);
    const entry = statSync(sourcePath);
    if (entry.isDirectory()) {
      cpSync(sourcePath, destPath, { recursive: true });
      continue;
    }
    mkdirSync(stageUiDir, { recursive: true });
    cpSync(sourcePath, destPath);
  }
}

/** Copy static UI files from source into the stage `ui/` directory. */
export function copyUiStaticAssets(
  sourceDir: string,
  stageUiDir: string,
  assetPaths?: string[],
): void {
  const sourceUiDir = join(sourceDir, "ui");
  if (!existsSync(sourceUiDir)) {
    return;
  }

  mkdirSync(stageUiDir, { recursive: true });

  if (assetPaths && assetPaths.length > 0) {
    for (const relativePath of assetPaths) {
      const sourcePath = join(sourceUiDir, relativePath);
      if (!existsSync(sourcePath)) {
        continue;
      }
      const destPath = join(stageUiDir, relativePath);
      mkdirSync(join(destPath, ".."), { recursive: true });
      cpSync(sourcePath, destPath, { recursive: true });
    }
    return;
  }

  copyUiTreeExcept(sourceUiDir, stageUiDir, DEFAULT_SKIP_TOP_LEVEL);
}

export function collectShellAssetReferences(shellHtml: string): string[] {
  const refs = new Set<string>();
  const pattern = /\b(?:src|href)=["'](\.[^"']+)["']/gi;
  for (const match of shellHtml.matchAll(pattern)) {
    const raw = match[1];
    if (!raw || raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("//")) {
      continue;
    }
    refs.add(raw.replace(/^\.\//, ""));
  }
  return [...refs];
}

export function validateShellAssetReferences(stageUiDir: string, shellHtml: string): ValidateIssue[] {
  const errors: ValidateIssue[] = [];
  for (const relativePath of collectShellAssetReferences(shellHtml)) {
    const assetPath = join(stageUiDir, relativePath);
    if (!existsSync(assetPath)) {
      errors.push({
        code: "UI_ASSET_MISSING",
        message: `shell.html references missing asset: ${relativePath}`,
        hint: { file: join("ui", relativePath) },
      });
    }
  }
  return errors;
}
