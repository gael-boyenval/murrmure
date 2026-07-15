#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_SOURCE_ROOTS = [
  "packages/contracts/src",
  "packages/hub-daemon/src",
  "packages/hub-core/src",
  "packages/cli/src",
  "packages/view-sdk/src",
  "apps/desktop/src",
  "packages/runtime-contracts/src",
  "packages/runtime-kernel/src",
  "packages/runtime-adapter-http/src",
];
const PRODUCTION_EXTRA_FILES = ["apps/desktop/electrobun.config.ts"];
const ACTIVE_GUIDANCE_ROOTS = [
  "studio-specs/current",
  "packages/cli/skill-agent",
  "packages/cli/skill-developer",
  "packages/cli/templates/space",
];
const ACTIVE_GUIDANCE_FILES = ["README.md", "studio-specs/README.md"];
const PRODUCTION_FORBIDDEN = [
  { label: "production test-fixture import", pattern: /(?:fixtures\/hub|test-utils\/)/ },
  { label: "seed package catalog", pattern: /PACKAGE_CATALOG|cref_(?:linear_demo|review_loop|feature_spec)/ },
  { label: "retired FDK vocabulary", pattern: /\bFDK\b|flow-dev-kit/ },
  { label: "bundled seed contracts", pattern: /Resources\/hub\/contracts/ },
  { label: "removed View SDK export useViewSubmit", pattern: /useViewSubmit/ },
  { label: "removed space-home payload fields", pattern: /your_flows|available_to_run/ },
  { label: "removed HANDLER_MISSING diagnostic", pattern: /HANDLER_MISSING/ },
  { label: "removed FlowCheckpointStepSchema", pattern: /FlowCheckpointStepSchema/ },
  { label: "removed murrmure_invoke_action MCP tool", pattern: /murrmure_invoke_action/ },
  { label: "removed murrmure_complete_action MCP tool", pattern: /murrmure_complete_action/ },
  { label: "removed murrmure_wait_for_gate MCP tool", pattern: /murrmure_wait_for_gate/ },
  { label: "removed murrmure_resolve_gate MCP tool", pattern: /murrmure_resolve_gate/ },
  { label: "removed action:invoke capability/route", pattern: /action:invoke/ },
  { label: "removed gate:resolve capability", pattern: /gate:resolve/ },
  { label: "removed isDeclarativeCheckpointStep", pattern: /isDeclarativeCheckpointStep/ },
  { label: "removed FlowCheckpointOnResolve schema", pattern: /FlowCheckpointOnResolve/ },
  { label: "removed checkpoint on_resolve IR field", pattern: /on_resolve/ },
  { label: "removed resolveCheckpointViewRef", pattern: /resolveCheckpointViewRef/ },
  { label: "removed CHECKPOINT_LOOPBACK_HINT lint code", pattern: /CHECKPOINT_LOOPBACK_HINT/ },
  { label: "removed kernel checkpoint.resolve command", pattern: /["']checkpoint\.resolve["']/ },
  {
    label: "removed grant/agent/onboard command vocabulary",
    pattern: /\bgrant (?:mint|use)\b|\bagent (?:connect|activate)\b|\bspace onboard\b/,
  },
];
// content_base64 is forbidden in the artifact PUT path only (decision 4). The
// step-work upload command schema (commands/index.ts) is out of scope here.
const ARTIFACT_PUT_SCHEMA_FILES = [
  "packages/contracts/src/entities/artifact-record.ts",
  "packages/hub-daemon/src/routes/artifacts/index.ts",
  "packages/hub-daemon/src/artifact-service.ts",
];
const ARTIFACT_PUT_FORBIDDEN = [
  { label: "removed artifact content_base64 in PUT schema/path", pattern: /content_base64/ },
];
const REMOVED_COMMAND_PATTERN =
  /mrmr (?:space )?grant (?:mint|use)|mrmr agent (?:connect|activate)|mrmr space onboard/;
// A line that names a v2 token as removed/superseded is a legitimate removal
// description, not an active prescription — allow those through context-aware
// rules.
const REMOVAL_CONTEXT =
  /\b(?:no|not|never|removed|superseded|without|absent|gone|retired)\b/i;
const ACTIVE_GUIDANCE_FORBIDDEN = [
  { label: "active retired FDK vocabulary", pattern: /\bFDK\b|flow-dev-kit/ },
  { label: "active seed package catalog", pattern: /PACKAGE_CATALOG/ },
  { label: "active bundled seed contracts", pattern: /Resources\/hub\/contracts|fixtures\/hub\/contracts/ },
  {
    label: "active removed grant/agent/onboard command",
    pattern: REMOVED_COMMAND_PATTERN,
  },
  { label: "active removed useViewSubmit export", pattern: /useViewSubmit/ },
  { label: "active removed base64 artifact upload", pattern: /content_base64/ },
  {
    label: "active removed contract_keys-keyed handler dispatch",
    pattern: /keyed by .{0,3}contract_keys/,
  },
  {
    label: "active removed mrmr action invoke command",
    pattern: /mrmr action invoke/,
    allowIf: REMOVAL_CONTEXT,
  },
  {
    label: "active removed awaiting_human run status",
    pattern: /awaiting_human/,
    allowIf: REMOVAL_CONTEXT,
  },
];
const SKILL_EVAL_ROOTS = ["packages/cli/test/skill-eval"];
const SKILL_EVAL_FORBIDDEN = [
  {
    label: "skill-eval removed grant/agent/onboard command",
    pattern: REMOVED_COMMAND_PATTERN,
  },
];

function collectFiles(root, filePattern) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectFiles(path, filePattern));
    } else if (filePattern.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

const hits = [];

function scan(files, rules) {
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    for (const rule of rules) {
      const flags = rule.pattern.flags.includes("g")
        ? rule.pattern.flags
        : rule.pattern.flags + "g";
      const re = new RegExp(rule.pattern.source, flags);
      for (const match of content.matchAll(re)) {
        if (match.index == null) continue;
        const before = content.slice(0, match.index);
        const lineNum = before.split("\n").length;
        const lineStart = before.lastIndexOf("\n") + 1;
        const lineEnd = content.indexOf("\n", match.index);
        const line = content.slice(
          lineStart,
          lineEnd === -1 ? undefined : lineEnd,
        );
        // Context-aware rules: a line that names the token as removed/superseded
        // is a legitimate removal description, not an active prescription.
        if (rule.allowIf && rule.allowIf.test(line)) continue;
        hits.push(
          `${relative(REPO_ROOT, file)}:${lineNum}: ${rule.label}: ${match[0]}`,
        );
      }
    }
  }
}

scan(
  [
    ...PRODUCTION_SOURCE_ROOTS.flatMap((path) =>
      collectFiles(join(REPO_ROOT, path), /\.(?:ts|tsx|js|mjs|json)$/),
    ),
    ...PRODUCTION_EXTRA_FILES.map((path) => join(REPO_ROOT, path)),
  ],
  PRODUCTION_FORBIDDEN,
);
scan(
  ARTIFACT_PUT_SCHEMA_FILES.map((path) => join(REPO_ROOT, path)),
  ARTIFACT_PUT_FORBIDDEN,
);
scan(
  [
    ...ACTIVE_GUIDANCE_ROOTS.flatMap((path) =>
      collectFiles(join(REPO_ROOT, path), /\.(?:md|json|ya?ml)$/),
    ),
    ...ACTIVE_GUIDANCE_FILES.map((path) => join(REPO_ROOT, path)),
  ],
  ACTIVE_GUIDANCE_FORBIDDEN,
);
scan(
  SKILL_EVAL_ROOTS.flatMap((path) =>
    collectFiles(join(REPO_ROOT, path), /\.json$/),
  ),
  SKILL_EVAL_FORBIDDEN,
);

if (hits.length > 0) {
  console.error("check:clean-state — forbidden clean-state dependency found:");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log("check:clean-state — OK (production and active guidance are clean)");
