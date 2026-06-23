export type FlowInstallRow = {
  flow_id: string;
  version: string;
  evolution_state: string;
  contract_ref_id?: string;
  canvas_route?: string;
  /** @deprecated use flow_id */
  package_id?: string;
};

/** @deprecated use FlowInstallRow */
export type CapabilityInstallRow = FlowInstallRow;

export type InstanceRow = {
  instance_id: string;
  contract_ref_id: string;
  state?: string;
  metadata?: Record<string, unknown>;
};

function flowIdOf(install: FlowInstallRow): string {
  return install.flow_id ?? install.package_id ?? "";
}

function contractRefPrefix(flowId: string): string {
  return `cref_${flowId.replace(/-/g, "_")}`;
}

function contractRefMatches(instanceRef: string, installRef: string, flowId: string): boolean {
  if (instanceRef === installRef) return true;
  const prefix = contractRefPrefix(flowId);
  return instanceRef.startsWith(prefix) && installRef.startsWith(prefix);
}

export function resolveLiveInstall(
  instance: InstanceRow,
  installs: FlowInstallRow[],
): FlowInstallRow | null {
  const live = installs.filter((i) => i.evolution_state === "live");
  const exact = live.find((i) => i.contract_ref_id === instance.contract_ref_id);
  if (exact) return exact;

  for (const install of live) {
    if (!install.contract_ref_id) continue;
    if (contractRefMatches(instance.contract_ref_id, install.contract_ref_id, flowIdOf(install))) {
      return install;
    }
  }

  if (live.length === 1) return live[0];
  return null;
}

export function buildCanvasPath(
  spaceId: string,
  instanceId: string,
  install: FlowInstallRow,
): string {
  const flowId = flowIdOf(install);
  const canvasRoute = install.canvas_route;
  if (canvasRoute) {
    return canvasRoute
      .replaceAll(":spaceId", spaceId)
      .replaceAll(":instanceId", instanceId)
      .replaceAll(":sessionKey", instanceId);
  }
  return `/spaces/${spaceId}/instances/${instanceId}/canvas/${flowId}?version=${encodeURIComponent(install.version)}`;
}

export function resolveCanvasPath(
  spaceId: string,
  instance: InstanceRow,
  installs: FlowInstallRow[],
): string | null {
  const install = resolveLiveInstall(instance, installs);
  if (!install) return null;
  return buildCanvasPath(spaceId, instance.instance_id, install);
}
