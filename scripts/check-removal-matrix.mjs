#!/usr/bin/env node
/**
 * Clean-slate removal matrix — full-repo inventory driven by
 * studio-specs/current/clean-slate/removal-manifest.json
 *
 * Usage:
 *   node scripts/check-removal-matrix.mjs          # exit 1 if blocking hits
 *   node scripts/check-removal-matrix.mjs --report # always exit 0, print all hits
 *   node scripts/check-removal-matrix.mjs --json   # machine-readable summary
 *
 * Unlike check-clean-state (incremental guards), this script:
 *   - loads one manifest (single source of truth)
 *   - scans all configured surfaces in one pass
 *   - prints a classified backlog (blocking vs informational)
 *   - checks broken relative links in active docs
 *
 * Path allowlists (archives, tests, fixtures) suppress hits — no same-line allowIf.
 * rule_path_suppressions suppress specific rule+file pairs (e.g. skill removed-tools lists).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(
  REPO_ROOT,
  "studio-specs/current/clean-slate/removal-manifest.json",
);
const REPORT_ONLY = process.argv.includes("--report");
const JSON_OUT = process.argv.includes("--json");
const JSON_FULL = process.argv.includes("--json-full");

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function globMatch(relativePath, pattern) {
  const norm = relativePath.replace(/\\/g, "/");
  if (pattern === "**") return true;
  if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
    const inner = pattern.slice(3, -3);
    return norm.split("/").includes(inner);
  }
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return norm === prefix || norm.startsWith(`${prefix}/`);
  }
  if (pattern.startsWith("**/")) {
    const suffix = pattern.slice(3);
    return norm.endsWith(suffix) || norm.includes(`/${suffix}`);
  }
  if (pattern.includes("*")) {
    const re = new RegExp(
      `^${pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`,
    );
    return re.test(norm);
  }
  return norm === pattern;
}

function isAllowlisted(relativePath, allowlists) {
  for (const [kind, patterns] of Object.entries(allowlists)) {
    for (const pattern of patterns) {
      if (globMatch(relativePath, pattern)) return kind;
    }
  }
  return null;
}

function isRuleSuppressed(relativePath, ruleId, suppressions) {
  const paths = suppressions?.[ruleId];
  if (!paths?.length) return false;
  return paths.some((pattern) => globMatch(relativePath, pattern));
}

function matchesFilesGlob(relativePath, globs) {
  if (!globs?.length) return true;
  const norm = relativePath.replace(/\\/g, "/");
  return globs.some((glob) => {
    if (glob.startsWith("**/")) {
      const suffix = glob.slice(3);
      return norm.endsWith(suffix) || norm.includes(`/${suffix}`);
    }
    return norm.endsWith(glob) || norm.includes(glob);
  });
}

function collectFiles(root, extensions) {
  const files = [];
  if (!existsSync(root)) return files;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      files.push(...collectFiles(path, extensions));
    } else if (extensions.includes(extname(entry))) {
      files.push(path);
    }
  }
  return files;
}

function filesForSurface(surface, manifest) {
  const cfg = manifest.surfaces[surface];
  const files = [];
  for (const root of cfg.roots) {
    const abs = join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      files.push(...collectFiles(abs, cfg.extensions));
    } else if (cfg.extensions.includes(extname(abs))) {
      files.push(abs);
    }
  }
  for (const extra of cfg.extra_files ?? []) {
    const abs = join(REPO_ROOT, extra);
    if (existsSync(abs)) files.push(abs);
  }
  const globs = cfg.files_glob;
  return [...new Set(files)].filter((file) => {
    const rel = relative(REPO_ROOT, file);
    return matchesFilesGlob(rel, globs);
  });
}

function pathMatchesRule(relativePath, rule) {
  if (!rule.paths_only) return true;
  return rule.paths_only.some((pattern) => globMatch(relativePath, pattern));
}

function scanRule(content, rule) {
  const flags = "gi";
  const re = new RegExp(rule.pattern, flags);
  const hits = [];
  for (const match of content.matchAll(re)) {
    if (match.index == null) continue;
    const before = content.slice(0, match.index);
    const lineNum = before.split("\n").length;
    hits.push({ lineNum, match: match[0] });
  }
  return hits;
}

function extractMarkdownLinks(content, filePath) {
  const links = [];
  const re = /\[([^\]]*)\]\(([^)]+)\)/g;
  for (const match of content.matchAll(re)) {
    const target = match[2].trim();
    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("#") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }
    const withoutHash = target.split("#")[0];
    if (!withoutHash) continue;
    links.push({
      text: match[1],
      target: withoutHash,
      line: content.slice(0, match.index).split("\n").length,
    });
  }
  return links;
}

function linkTargetExists(resolved) {
  if (existsSync(resolved)) return true;
  if (existsSync(`${resolved}.md`)) return true;
  if (existsSync(join(resolved, "index.md"))) return true;
  if (existsSync(join(resolved, "README.md"))) return true;
  return false;
}

function resolveRelativeLink(fromFile, target) {
  const fromDir = dirname(fromFile);
  return normalize(resolve(fromDir, target));
}

function checkBrokenLinks(manifest) {
  const cfg = manifest.coherence_checks?.broken_links;
  if (!cfg) return [];
  const broken = [];
  for (const root of cfg.roots) {
    const absRoot = join(REPO_ROOT, root);
    for (const file of collectFiles(absRoot, cfg.extensions)) {
      const content = readFileSync(file, "utf8");
      const rel = relative(REPO_ROOT, file);
      for (const link of extractMarkdownLinks(content, file)) {
        const resolved = resolveRelativeLink(file, link.target);
        if (!linkTargetExists(resolved)) {
          broken.push({
            surface: "coherence",
            rule: "broken-relative-link",
            file: rel,
            line: link.line,
            match: link.target,
            label: `broken link "${link.target}" from [${link.text}]`,
          });
        }
      }
    }
  }
  return broken;
}

function summarizeByRule(hits) {
  const counts = new Map();
  for (const hit of hits) {
    counts.set(hit.rule, (counts.get(hit.rule) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([rule, count]) => ({ rule, count }));
}

function summarizeBySurface(hits) {
  const counts = new Map();
  for (const hit of hits) {
    counts.set(hit.surface, (counts.get(hit.surface) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function main() {
  const manifest = loadManifest();
  const blockingHits = [];
  const informationalHits = [];

  for (const rule of manifest.rules) {
    for (const surface of rule.surfaces) {
      if (!manifest.surfaces[surface]) continue;
      for (const file of filesForSurface(surface, manifest)) {
        const rel = relative(REPO_ROOT, file);
        if (!pathMatchesRule(rel, rule)) continue;

        if (isRuleSuppressed(rel, rule.id, manifest.rule_path_suppressions)) {
          continue;
        }

        const allowKind = isAllowlisted(rel, manifest.path_allowlists);
        const content = readFileSync(file, "utf8");
        for (const hit of scanRule(content, rule)) {
          const entry = {
            surface,
            rule: rule.id,
            file: rel,
            line: hit.lineNum,
            match: hit.match,
            label: rule.label,
            sources: rule.sources ?? [],
            allowlist: allowKind,
          };
          if (allowKind) {
            informationalHits.push(entry);
          } else if (manifest.surfaces[surface].blocking) {
            blockingHits.push(entry);
          } else {
            informationalHits.push(entry);
          }
        }
      }
    }
  }

  for (const broken of checkBrokenLinks(manifest)) {
    blockingHits.push(broken);
  }

  const byFile = (a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule);

  blockingHits.sort(byFile);
  informationalHits.sort(byFile);

  const summary = {
    manifest: MANIFEST_PATH.replace(`${REPO_ROOT}/`, ""),
    rules: manifest.rules.length,
    blocking: blockingHits.length,
    informational: informationalHits.length,
    bySurface: summarizeBySurface(blockingHits),
    byRule: summarizeByRule(blockingHits),
  };
  if (JSON_FULL) {
    summary.hits = blockingHits;
  }

  if (JSON_OUT || JSON_FULL) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(REPORT_ONLY || blockingHits.length === 0 ? 0 : 1);
    return;
  }

  console.log("check:removal-matrix — manifest", summary.manifest);
  console.log(`  rules: ${summary.rules}`);
  console.log(`  blocking hits: ${summary.blocking}`);
  console.log(
    `  informational hits (archives/tests/fixtures allowlist): ${summary.informational}`,
  );
  console.log("");

  if (summary.byRule.length > 0) {
    console.log("TOP RULES (blocking):");
    for (const { rule, count } of summary.byRule.slice(0, 25)) {
      const def = manifest.rules.find((r) => r.id === rule);
      const src = def?.sources?.length ? ` [tasks ${def.sources.join(",")}]` : "";
      console.log(`  ${count.toString().padStart(4)}  ${rule}${src}`);
    }
    console.log("");
  }

  if (summary.bySurface && Object.keys(summary.bySurface).length > 0) {
    console.log("BY SURFACE (blocking):");
    for (const [surface, count] of Object.entries(summary.bySurface)) {
      console.log(`  ${surface}: ${count}`);
    }
    console.log("");
  }

  if (blockingHits.length > 0) {
    console.log("BLOCKING — must fix before clean-slate sign-off:");
    let currentFile = "";
    for (const hit of blockingHits) {
      if (hit.file !== currentFile) {
        currentFile = hit.file;
        console.log(`  ${hit.file}`);
      }
      const coherence = hit.surface === "coherence" ? " [link]" : ` [${hit.surface}/${hit.rule}]`;
      console.log(`    L${hit.line}${coherence}: ${hit.label} → ${JSON.stringify(hit.match)}`);
    }
    console.log("");
  }

  if (informationalHits.length > 0) {
    console.log("INFORMATIONAL — allowed paths (archive/test/fixture), first 40:");
    const shown = informationalHits.slice(0, 40);
    for (const hit of shown) {
      console.log(
        `  ${hit.file}:${hit.line} [${hit.allowlist}] ${hit.rule}: ${JSON.stringify(hit.match)}`,
      );
    }
    if (informationalHits.length > 40) {
      console.log(`  … and ${informationalHits.length - 40} more`);
    }
    console.log("");
  }

  if (blockingHits.length === 0) {
    console.log("check:removal-matrix — OK (no blocking hits)");
    process.exit(0);
  }

  if (REPORT_ONLY) {
    console.log("check:removal-matrix — report-only mode (exit 0)");
    process.exit(0);
  }

  process.exit(1);
}

main();
