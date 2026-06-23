import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hubFetch, resolveHubAuth } from "./auth.js";
import { computeFileDigest, readDigestSidecar } from "./digest.js";
import { pushStatePath, stagePath } from "./paths.js";

export interface PushState {
  install_id: string;
  space_id: string;
  flow_id: string;
  version: string;
  bundle_digest: string;
  source_digest: string;
  contract_ref_id: string;
  pushed_at: string;
}

export interface PushOptions {
  spaceId: string;
  path?: string;
}

export async function pushFlow(opts: PushOptions): Promise<Record<string, unknown>> {
  const auth = resolveHubAuth();
  if ("error" in auth) {
    return { ok: false, code: "AUTH_MISSING", message: auth.error };
  }

  const sourceDir = resolve(opts.path ?? ".");
  const manifest = JSON.parse(readFileSync(join(sourceDir, "flow.manifest.json"), "utf-8")) as {
    id: string;
    version: string;
  };
  const stageDir = stagePath(manifest.id, manifest.version);
  const sourceTar = join(stageDir, "source.tar.zst");
  if (!existsSync(sourceTar)) {
    return {
      ok: false,
      code: "SOURCE_BUNDLE_MISSING",
      message: "Missing source.tar.zst — re-run `mrmr flow build` before push",
      hint: { file: sourceTar },
    };
  }

  const digestFromFile = readDigestSidecar(stageDir, "bundle.digest");
  const digest = await computeFileDigest(join(stageDir, "bundle.tar.zst"));
  if (digest !== digestFromFile) {
    return {
      ok: false,
      code: "BUNDLE_DIGEST_STALE",
      message:
        "Staged bundle.digest does not match recomputed digest — re-run `mrmr flow build` before push",
      hint: { staged: digestFromFile, computed: digest },
    };
  }

  const sourceDigestFromFile = readDigestSidecar(stageDir, "source.digest");
  const sourceDigest = await computeFileDigest(sourceTar);
  if (sourceDigest !== sourceDigestFromFile) {
    return {
      ok: false,
      code: "SOURCE_DIGEST_STALE",
      message:
        "Staged source.digest does not match recomputed digest — re-run `mrmr flow build` before push",
      hint: { staged: sourceDigestFromFile, computed: sourceDigest },
    };
  }
  let buildMeta: Record<string, unknown> = {};
  try {
    buildMeta = JSON.parse(readFileSync(join(stageDir, "build.meta.json"), "utf-8"));
  } catch {
    /* optional */
  }

  const res = await hubFetch(auth, `/v1/spaces/${opts.spaceId}/flows/install`, {
    method: "POST",
    json: {
      flow_id: manifest.id,
      version: manifest.version,
      bundle: {
        mode: "local-path",
        local_path: stageDir,
        digest,
      },
      source: {
        mode: "local-path",
        local_path: sourceTar,
        digest: sourceDigest,
      },
      source_metadata: {
        source_path: buildMeta.source_path ?? sourceDir,
        built_at: buildMeta.built_at ?? new Date().toISOString(),
        cli_version: buildMeta.cli_version ?? "0.1.0",
        dev_kit_version: buildMeta.dev_kit_version ?? "0.1.0",
      },
      config: {},
      target_state: "draft",
    },
  });

  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, ...body };
  }

  const pushState: PushState = {
    install_id: String(body.install_id),
    space_id: opts.spaceId,
    flow_id: manifest.id,
    version: manifest.version,
    bundle_digest: String(body.bundle_digest ?? digest),
    source_digest: String(body.source_digest ?? sourceDigest),
    contract_ref_id: String(body.contract_ref_id),
    pushed_at: new Date().toISOString(),
  };
  writeFileSync(pushStatePath(manifest.id, manifest.version), JSON.stringify(pushState, null, 2));

  return {
    ok: true,
    command: "push",
    install_id: pushState.install_id,
    evolution_state: body.evolution_state ?? "draft",
    contract_ref_id: pushState.contract_ref_id,
    bundle_digest: pushState.bundle_digest,
    source_digest: pushState.source_digest,
    next_steps: ["validate", "test", "promote", "apply"],
  };
}

export async function evolutionCommand(
  command: "validate" | "test" | "promote" | "apply" | "rollback",
  opts: { spaceId: string; installId: string },
): Promise<Record<string, unknown>> {
  const auth = resolveHubAuth();
  if ("error" in auth) {
    return { ok: false, code: "AUTH_MISSING", message: auth.error };
  }

  const paths: Record<string, { method: string; path: string }> = {
    validate: { method: "POST", path: `/v1/spaces/${opts.spaceId}/evolution/validate` },
    test: { method: "POST", path: `/v1/spaces/${opts.spaceId}/evolution/test` },
    promote: { method: "POST", path: `/v1/spaces/${opts.spaceId}/evolution/promote` },
    apply: { method: "POST", path: `/v1/spaces/${opts.spaceId}/flows/${opts.installId}/apply` },
    rollback: { method: "POST", path: `/v1/spaces/${opts.spaceId}/evolution/rollback` },
  };
  const route = paths[command];
  const res = await hubFetch(auth, route.path, {
    method: route.method,
    json: { install_id: opts.installId },
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, command, ...body };
}

export function readPushState(flowId: string, version: string): PushState | null {
  try {
    return JSON.parse(readFileSync(pushStatePath(flowId, version), "utf-8")) as PushState;
  } catch {
    return null;
  }
}

export async function doctor(): Promise<Record<string, unknown>> {
  const auth = resolveHubAuth();
  if ("error" in auth) {
    return { ok: false, issues: [{ code: "AUTH_MISSING", message: auth.error }] };
  }
  const issues: Array<{ code: string; message: string }> = [];
  try {
    const health = await fetch(`${auth.hubUrl}/v1/health`);
    if (!health.ok) issues.push({ code: "HUB_UNREACHABLE", message: `Hub health ${health.status}` });
  } catch (e) {
    issues.push({ code: "HUB_UNREACHABLE", message: String(e) });
  }
  try {
    const whoami = await hubFetch(auth, "/v1/auth/whoami");
    if (!whoami.ok) issues.push({ code: "TOKEN_DENIED", message: "Token rejected" });
    else {
      const body = (await whoami.json()) as { spaces?: Array<{ scopes?: string[] }> };
      const hasInstall = body.spaces?.some((s) => s.scopes?.includes("flow:install"));
      if (!hasInstall) issues.push({ code: "SCOPE_MISSING", message: "Missing flow:install scope" });
    }
  } catch (e) {
    issues.push({ code: "AUTH_CHECK_FAILED", message: String(e) });
  }
  return { ok: issues.length === 0, issues };
}
