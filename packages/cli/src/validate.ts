import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FlowManifestSchema,
  ContractGraphSchema,
  LegacyFlowManifestSchema,
  McpToolsRegistrySchema,
} from "./schema.js";
import { validateShellAssetReferences } from "./ui-assets.js";

const REQUIRED_SCAFFOLD_DEPENDENCIES = [
  "@murrmure/cli",
  "@murrmure/flow-dev-kit",
  "react",
  "react-dom",
  "@types/react",
  "@types/react-dom",
  "typescript",
  "vitest",
] as const;

const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export interface ValidateIssue {
  code: string;
  message: string;
  hint?: Record<string, unknown>;
}

export interface ValidateResult {
  ok: boolean;
  errors: ValidateIssue[];
  warnings: ValidateIssue[];
  manifest?: ReturnType<typeof FlowManifestSchema.parse>;
}

function reachableStates(initial: string, states: Record<string, { on?: Record<string, string | string[]> }>): Set<string> {
  const visited = new Set<string>();
  const queue = [initial];
  while (queue.length) {
    const s = queue.pop()!;
    if (visited.has(s)) continue;
    visited.add(s);
    const def = states[s];
    if (!def?.on) continue;
    for (const target of Object.values(def.on)) {
      const next = Array.isArray(target) ? target[0] : target;
      if (next && states[next]) queue.push(next);
    }
  }
  return visited;
}

function readDependencyVersion(
  pkg: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> },
  dependency: string,
): string | undefined {
  const value = pkg.dependencies?.[dependency] ?? pkg.devDependencies?.[dependency];
  return typeof value === "string" ? value : undefined;
}

export function validateFlowRoot(dir: string, opts?: { postBuild?: boolean }): ValidateResult {
  const errors: ValidateIssue[] = [];
  const warnings: ValidateIssue[] = [];

  const manifestPath = opts?.postBuild
    ? join(dir, "manifest.json")
    : join(dir, "flow.manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      errors: [{ code: "MANIFEST_INVALID", message: "Missing manifest", hint: { file: manifestPath } }],
      warnings,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return {
      ok: false,
      errors: [{ code: "MANIFEST_INVALID", message: "flow.manifest.json is not valid JSON" }],
      warnings,
    };
  }

  const legacy = LegacyFlowManifestSchema.safeParse(raw);
  if (legacy.success) {
    warnings.push({
      code: "LEGACY_MANIFEST",
      message: "P5 manifest detected — migrate to schemaVersion 1",
      hint: { id: legacy.data.id },
    });
    return { ok: !opts?.postBuild, errors: opts?.postBuild ? [{ code: "MANIFEST_INVALID", message: "Legacy manifest cannot be built" }] : [], warnings, manifest: undefined };
  }

  const parsed = FlowManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "MANIFEST_INVALID", message: parsed.error.message }],
      warnings,
    };
  }
  const manifest = parsed.data;

  const contractPath = join(dir, "contract", "contract.json");
  if (!existsSync(contractPath)) {
    errors.push({ code: "MANIFEST_INVALID", message: "Missing contract/contract.json", hint: { file: contractPath } });
  } else {
    try {
      const contractRaw = JSON.parse(readFileSync(contractPath, "utf-8")) as Record<string, unknown>;
      if (contractRaw.schemaVersion === "2.0" || contractRaw.schema_version === "2.0") {
        if (!contractRaw.initial_state || !Array.isArray(contractRaw.states)) {
          errors.push({ code: "MANIFEST_INVALID", message: "Invalid contract v2 shape" });
        }
      } else {
        const contract = ContractGraphSchema.parse(contractRaw);
        const reachable = reachableStates(contract.initial_state, contract.states);
        for (const state of Object.keys(contract.states)) {
          if (!reachable.has(state)) {
            errors.push({
              code: "GRAPH_UNREACHABLE",
              message: `State '${state}' not reachable from initial_state`,
              hint: { file: "contract/contract.json", state },
            });
          }
        }
      }
    } catch (e) {
      errors.push({ code: "MANIFEST_INVALID", message: `Invalid contract.json: ${String(e)}` });
    }
  }

  const mcpPath = join(dir, "contract", "mcp-tools.json");
  const toolsForVersion = manifest.mcp_tools_by_version[manifest.version] ?? [];
  if (toolsForVersion.length === 0) {
    warnings.push({ code: "MCP_TOOLS_EMPTY", message: "No MCP tools declared for manifest.version" });
  }
  if (existsSync(mcpPath)) {
    try {
      const registry = McpToolsRegistrySchema.parse(JSON.parse(readFileSync(mcpPath, "utf-8")));
      for (const tool of toolsForVersion) {
        if (!registry.tools[tool]) {
          errors.push({
            code: "MCP_TOOL_UNMAPPED",
            message: `Tool '${tool}' missing from contract/mcp-tools.json`,
            hint: { tool },
          });
        }
      }
    } catch (e) {
      errors.push({ code: "MANIFEST_INVALID", message: `Invalid mcp-tools.json: ${String(e)}` });
    }
  } else if (toolsForVersion.length > 0) {
    errors.push({ code: "MCP_TOOL_UNMAPPED", message: "Missing contract/mcp-tools.json" });
  }

  if (manifest.config_schema) {
    const cfgPath = join(dir, manifest.config_schema);
    if (!existsSync(cfgPath)) {
      errors.push({ code: "MANIFEST_INVALID", message: `Missing config schema: ${manifest.config_schema}` });
    }
  }

  if (!manifest.tests?.contract) {
    warnings.push({ code: "TESTS_MISSING", message: "No tests/contract entry declared" });
  }

  if (!opts?.postBuild) {
    const packageJsonPath = join(dir, "package.json");
    if (!existsSync(packageJsonPath)) {
      errors.push({
        code: "DEVKIT_VERSION_REQUIRED",
        message: "Missing package.json with scaffold dependency pins",
        hint: { file: packageJsonPath, dependency: "@murrmure/flow-dev-kit" },
      });
    } else {
      let packageJson: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
      try {
        packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
          dependencies?: Record<string, unknown>;
          devDependencies?: Record<string, unknown>;
        };
      } catch (error) {
        errors.push({
          code: "MANIFEST_INVALID",
          message: `Invalid package.json: ${String(error)}`,
        });
        return { ok: false, errors, warnings, manifest };
      }

      const devKitVersion = readDependencyVersion(packageJson, "@murrmure/flow-dev-kit");
      if (!devKitVersion) {
        errors.push({
          code: "DEVKIT_VERSION_REQUIRED",
          message: "Missing @murrmure/flow-dev-kit dependency",
          hint: { file: "package.json", dependency: "@murrmure/flow-dev-kit" },
        });
      }

      for (const dependency of REQUIRED_SCAFFOLD_DEPENDENCIES) {
        const version = readDependencyVersion(packageJson, dependency);
        if (!version) {
          continue;
        }
        if (!EXACT_SEMVER.test(version)) {
          errors.push({
            code: "DEVKIT_VERSION_NOT_EXACT",
            message: `Dependency '${dependency}' must use an exact version pin`,
            hint: { file: "package.json", dependency, version },
          });
        }
      }

      const sdkVersion = readDependencyVersion(packageJson, "@murrmure/cli");
      if (sdkVersion && devKitVersion && sdkVersion !== devKitVersion) {
        errors.push({
          code: "DEVKIT_CLI_VERSION_MISMATCH",
          message:
            "@murrmure/cli and @murrmure/flow-dev-kit must use matching versions",
          hint: {
            file: "package.json",
            cli_version: sdkVersion,
            dev_kit_version: devKitVersion,
          },
        });
      }
    }
  }

  if (opts?.postBuild) {
    const uiEntry = join(dir, manifest.ui.entry);
    const serverMount = join(dir, manifest.server.mount_module);
    if (!existsSync(uiEntry)) {
      errors.push({ code: "MOUNT_EXPORT_MISSING", message: `Missing UI entry: ${manifest.ui.entry}` });
    }
    if (!existsSync(serverMount)) {
      errors.push({ code: "MOUNT_EXPORT_MISSING", message: `Missing server mount: ${manifest.server.mount_module}` });
    }
    const shellHtml = join(dir, manifest.ui.shell_html ?? "ui/shell.html");
    if (!existsSync(shellHtml)) {
      errors.push({ code: "MOUNT_EXPORT_MISSING", message: `Missing ui/shell.html` });
    } else {
      errors.push(...validateShellAssetReferences(join(dir, "ui"), readFileSync(shellHtml, "utf-8")));
    }
  }

  return { ok: errors.length === 0, errors, warnings, manifest };
}

export function validateManifest(data: unknown) {
  return FlowManifestSchema.parse(data);
}
