export type CapabilityInstallRow = {
  package_id: string;
  version: string;
  evolution_state: string;
  contract_ref_id?: string;
  canvas_route?: string;
};

export type InstanceRow = {
  instance_id: string;
  contract_ref_id: string;
  state?: string;
  metadata?: Record<string, unknown>;
};

function contractRefPrefix(packageId: string): string {
  return `cref_${packageId.replace(/-/g, "_")}`;
}

function contractRefMatches(instanceRef: string, installRef: string, packageId: string): boolean {
  if (instanceRef === installRef) return true;
  const prefix = contractRefPrefix(packageId);
  return instanceRef.startsWith(prefix) && installRef.startsWith(prefix);
}

export function resolveLiveInstall(
  instance: InstanceRow,
  installs: CapabilityInstallRow[],
): CapabilityInstallRow | null {
  const live = installs.filter((i) => i.evolution_state === "live");
  const exact = live.find((i) => i.contract_ref_id === instance.contract_ref_id);
  if (exact) return exact;

  for (const install of live) {
    if (!install.contract_ref_id) continue;
    if (contractRefMatches(instance.contract_ref_id, install.contract_ref_id, install.package_id)) {
      return install;
    }
  }

  if (live.length === 1) return live[0];
  return null;
}

export function buildCanvasPath(
  spaceId: string,
  instanceId: string,
  install: CapabilityInstallRow,
): string {
  const canvasRoute = install.canvas_route;
  if (canvasRoute) {
    return canvasRoute
      .replaceAll(":spaceId", spaceId)
      .replaceAll(":instanceId", instanceId)
      .replaceAll(":sessionKey", instanceId);
  }
  return `/spaces/${spaceId}/instances/${instanceId}/canvas/${install.package_id}?version=${encodeURIComponent(install.version)}`;
}

export function resolveCanvasPath(
  spaceId: string,
  instance: InstanceRow,
  installs: CapabilityInstallRow[],
): string | null {
  const install = resolveLiveInstall(instance, installs);
  if (!install) return null;
  return buildCanvasPath(spaceId, instance.instance_id, install);
}
