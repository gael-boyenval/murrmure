import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateCapabilityRoot } from "@studio/capability-sdk";
import { pinContract } from "@studio/hub-core";
import { ContractV2Schema } from "@studio/contracts";
import type { StudioPersistencePort } from "@studio/hub-persistence";
import {
  assignContractRefId,
  ingestLocalBundle,
  readBundleManifest,
  resolveAllowlistedPath,
} from "./bundle-store.js";

export interface BundleIngestInput {
  package_id: string;
  version: string;
  bundle: {
    mode: string;
    local_path?: string;
    digest?: string;
  };
  source_metadata?: Record<string, unknown>;
}

export async function ingestCapabilityBundle(
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
    }
  | { ok: false; code: string; message: string }
> {
  if (input.bundle.mode !== "local-path" || !input.bundle.local_path) {
    return { ok: false, code: "BUNDLE_NOT_FOUND", message: "Only local-path bundle mode supported in v1" };
  }

  const resolved = resolveAllowlistedPath(input.bundle.local_path, hubDataDir);
  if (!resolved) {
    return { ok: false, code: "LOCAL_PATH_DENIED", message: "Path outside allowlist" };
  }

  const ingested = await ingestLocalBundle(hubDataDir, resolved, input.bundle.digest);
  if (!ingested.ok) return ingested;

  const validation = validateCapabilityRoot(resolved, { postBuild: true });
  if (!validation.ok) {
    return {
      ok: false,
      code: "MANIFEST_INVALID",
      message: validation.errors.map((e) => e.message).join("; "),
    };
  }

  const manifest = readBundleManifest(ingested.blobPath);
  if (manifest.id !== input.package_id) {
    return { ok: false, code: "MANIFEST_INVALID", message: "package_id mismatch" };
  }

  const contractRaw = JSON.parse(readFileSync(join(ingested.blobPath, "contract", "contract.json"), "utf-8"));
  const contract = ContractV2Schema.parse(contractRaw);
  const contract_ref_id = assignContractRefId(input.package_id, contractRaw as Record<string, unknown>);
  await pinContract(studio, contract_ref_id, contract);

  const mcpByVersion = manifest.mcp_tools_by_version as Record<string, string[]>;
  const mcp_tools = mcpByVersion[input.version] ?? mcpByVersion[String(manifest.version)] ?? [];

  return {
    ok: true,
    bundle_digest: ingested.digest,
    blob_path: ingested.blobPath,
    contract_ref_id,
    routes_prefix: String((manifest.routes_prefix as string) ?? `/api/${input.package_id}`),
    canvas_route: String((manifest.ui as { canvas_route?: string })?.canvas_route ?? ""),
    mcp_tools,
  };
}
