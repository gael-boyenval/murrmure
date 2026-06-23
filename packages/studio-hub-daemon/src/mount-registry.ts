import type { Hono } from "hono";
import type { DaemonContext } from "./context.js";
import { addSpaceId } from "@murrmure/hub-core";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";

export interface CapabilityMount {
  install_id: string;
  space_id: string;
  package_id: string;
  semver: string;
  contract_ref_id: string;
  routes_prefix: string;
  mcp_tools: string[];
  query_types?: string[];
  applied_at: string;
  bundle_digest?: string;
}

export interface RouteEntry {
  install_id: string;
  package_id: string;
  semver: string;
  routes_prefix: string;
  applied_at: string;
}

export class MountRegistry {
  private readonly mounts = new Map<string, CapabilityMount>();

  getMountKey(spaceId: string, packageId: string): string {
    return `${bareSpaceId(spaceId)}:${packageId}`;
  }

  getRoutes(spaceId: string): RouteEntry[] {
    const bare = bareSpaceId(spaceId);
    const out: RouteEntry[] = [];
    for (const mount of this.mounts.values()) {
      if (bareSpaceId(mount.space_id) === bare) {
        out.push({
          install_id: mount.install_id,
          package_id: mount.package_id,
          semver: mount.semver,
          routes_prefix: mount.routes_prefix,
          applied_at: mount.applied_at,
        });
      }
    }
    return out.sort((a, b) => a.package_id.localeCompare(b.package_id));
  }

  getMount(spaceId: string, packageId: string): CapabilityMount | undefined {
    return this.mounts.get(this.getMountKey(spaceId, packageId));
  }

  isLive(spaceId: string, packageId: string): boolean {
    return this.mounts.has(this.getMountKey(spaceId, packageId));
  }

  async apply(_app: Hono, _ctx: DaemonContext, mount: CapabilityMount): Promise<void> {
    if (!mount.bundle_digest) {
      throw new Error(`Live apply requires a bundle digest for ${mount.package_id}`);
    }
    this.mounts.set(this.getMountKey(mount.space_id, mount.package_id), {
      ...mount,
      space_id: prefixedSpaceId(bareSpaceId(mount.space_id)),
    });
  }

  async unmount(spaceId: string, packageId: string): Promise<void> {
    this.mounts.delete(this.getMountKey(spaceId, packageId));
  }

  listAll(): CapabilityMount[] {
    return [...this.mounts.values()];
  }
}
