import type { DaemonContext } from "./context.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";

function contractRefPrefix(packageId: string): string {
  return `cref_${packageId.replace(/-/g, "_")}`;
}

function contractRefMatches(instanceRef: string, installRef: string, packageId: string): boolean {
  if (instanceRef === installRef) return true;
  const prefix = contractRefPrefix(packageId);
  return instanceRef.startsWith(prefix) && installRef.startsWith(prefix);
}

function findMountForContract(
  ctx: DaemonContext,
  spaceId: string,
  contractRefId: string,
): { package_id: string; semver: string } | null {
  const bare = bareSpaceId(spaceId);
  const mounts = ctx.mountRegistry.listAll().filter((m) => bareSpaceId(m.space_id) === bare);
  const exact = mounts.find((m) => m.contract_ref_id === contractRefId);
  if (exact) return { package_id: exact.package_id, semver: exact.semver };

  for (const mount of mounts) {
    if (contractRefMatches(contractRefId, mount.contract_ref_id, mount.package_id)) {
      return { package_id: mount.package_id, semver: mount.semver };
    }
  }

  if (mounts.length === 1) {
    return { package_id: mounts[0].package_id, semver: mounts[0].semver };
  }
  return null;
}

export async function enrichInstanceToolResult(
  ctx: DaemonContext,
  spaceId: string,
  result: unknown,
): Promise<unknown> {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;

  const row = result as Record<string, unknown>;
  const instanceId = row.instance_id ?? row.session_key ?? row.sessionKey;
  if (typeof instanceId !== "string") return result;

  let contractRefId = typeof row.contract_ref_id === "string" ? row.contract_ref_id : undefined;
  if (!contractRefId) {
    const instance = await ctx.studioPersistence.getInstance(instanceId).catch(() => null);
    if (instance && bareSpaceId(instance.space_id) === bareSpaceId(spaceId)) {
      contractRefId = instance.contract_ref_id;
    }
  }
  if (!contractRefId) return result;

  const mount = findMountForContract(ctx, spaceId, contractRefId);
  if (!mount) return result;

  const prefixed = prefixedSpaceId(bareSpaceId(spaceId));
  const canvasPath = `/spaces/${prefixed}/instances/${instanceId}/canvas/${mount.package_id}?version=${encodeURIComponent(mount.semver)}`;
  const sessionsPath = `/spaces/${prefixed}/sessions/${instanceId}`;

  return {
    ...row,
    canvas_path: canvasPath,
    sessions_path: sessionsPath,
    studio_url: canvasPath,
  };
}
