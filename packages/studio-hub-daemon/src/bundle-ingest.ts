import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateFlowRoot } from "@murrmure/flow-dev-kit/validate";
import { pinContract } from "@murrmure/hub-core";
import { ContractV2Schema } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import {
  assignContractRefId,
  ingestLocalBundle,
  ingestSourceBlob,
  readBundleManifest,
  resolveAllowlistedPath,
} from "./bundle-store.js";

export interface BundleIngestInput {
  flow_id?: string;
  /** @deprecated use flow_id */
  package_id?: string;
  version: string;
  bundle: {
    mode: string;
    local_path?: string;
    digest?: string;
  };
  source?: {
    mode: string;
    local_path?: string;
    digest?: string;
  };
  source_metadata?: Record<string, unknown>;
}

export async function ingestFlowBundle(
  hubDataDir: string,
  studio: StudioPersistencePort,
  input: BundleIngestInput,
): Promise<
  | {
      ok: true;
      bundle_digest: string;
      blob_path: string;
      contract_ref_id: string;
      routes_prefix: string;
      canvas_route: string;
      mcp_tools: string[];
      source_digest?: string;
    }
  | { ok: false; code: string; message: string }
> {
  const flowId = input.flow_id ?? input.package_id;
  if (!flowId) {
    return { ok: false, code: "MANIFEST_INVALID", message: "flow_id required" };
  }

  if (input.bundle.mode !== "local-path" || !input.bundle.local_path) {
    return { ok: false, code: "BUNDLE_NOT_FOUND", message: "Only local-path bundle mode supported in v1" };
  }

  const resolved = resolveAllowlistedPath(input.bundle.local_path, hubDataDir);
  if (!resolved) {
    return { ok: false, code: "LOCAL_PATH_DENIED", message: "Path outside allowlist" };
  }

  if (input.source && !existsSync(join(resolved, "source.tar.zst"))) {
    return { ok: false, code: "SOURCE_BUNDLE_MISSING", message: "source.tar.zst missing from staged bundle" };
  }

  const ingested = await ingestLocalBundle(hubDataDir, resolved, input.bundle.digest);
  if (!ingested.ok) return ingested;

  const validation = validateFlowRoot(resolved, { postBuild: true });
  if (!validation.ok) {
    return {
      ok: false,
      code: "MANIFEST_INVALID",
      message: validation.errors.map((e) => e.message).join("; "),
    };
  }

  const manifest = readBundleManifest(ingested.blobPath);
  if (manifest.id !== flowId) {
    return { ok: false, code: "MANIFEST_INVALID", message: "flow_id mismatch" };
  }

  let source_digest: string | undefined;
  if (input.source?.local_path || input.source?.digest) {
    let sourcePath: string | undefined;
    if (input.source.local_path) {
      const resolvedSource = resolveAllowlistedPath(input.source.local_path, hubDataDir);
      if (!resolvedSource) {
        return { ok: false, code: "LOCAL_PATH_DENIED", message: "Source path outside allowlist" };
      }
      sourcePath = resolvedSource;
    } else {
      sourcePath = join(resolved, "source.tar.zst");
    }

    const stored = await ingestSourceBlob(hubDataDir, flowId, input.version, sourcePath, input.source.digest);
    if (!stored.ok) return stored;
    source_digest = stored.digest;
  }

  const contractRaw = JSON.parse(readFileSync(join(ingested.blobPath, "contract", "contract.json"), "utf-8"));
  const contract = ContractV2Schema.parse(contractRaw);
  const contract_ref_id = assignContractRefId(flowId, contractRaw as Record<string, unknown>);
  await pinContract(studio, contract_ref_id, contract);

  const mcpByVersion = manifest.mcp_tools_by_version as Record<string, string[]>;
  const mcp_tools = mcpByVersion[input.version] ?? mcpByVersion[String(manifest.version)] ?? [];

  return {
    ok: true,
    bundle_digest: ingested.digest,
    blob_path: ingested.blobPath,
    contract_ref_id,
    routes_prefix: String((manifest.routes_prefix as string) ?? `/api/${flowId}`),
    canvas_route: String((manifest.ui as { canvas_route?: string })?.canvas_route ?? ""),
    mcp_tools,
    source_digest,
  };
}

/** @deprecated use ingestFlowBundle */
export async function ingestCapabilityBundle(
  hubDataDir: string,
  studio: StudioPersistencePort,
  input: BundleIngestInput & { package_id: string },
) {
  return ingestFlowBundle(hubDataDir, studio, input);
}
