import type { Hono } from "hono";
import { addSpaceId } from "@studio/hub-core";
import type { DaemonContext } from "./context.js";
import { bareSpaceId } from "./space-id.js";
import { executeUnmount } from "./live-apply.js";
import { broadcastSse } from "./context.js";

/**
 * Called when a capability worker exits unexpectedly (not via intentional kill).
 * Unmounts all live mounts for the digest and notifies subscribers.
 */
export async function handleWorkerCrash(
  app: Hono,
  ctx: DaemonContext,
  packageId: string,
  digest: string,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
): Promise<void> {
  const mounts = ctx.mountRegistry
    .listAll()
    .filter((m) => m.package_id === packageId && m.bundle_digest === digest);

  for (const mount of mounts) {
    await executeUnmount(app, ctx, mount.space_id, packageId);

    broadcastSse(ctx, {
      event: "journal.append",
      data: {
        type: "capability.worker_crashed",
        package_id: packageId,
        space_id: mount.space_id,
        bundle_digest: digest,
        exit_code: exitCode,
        signal,
      },
    });

    await ctx.handler.execute({
      kind: "event.append",
      provenance: {
        space_id: addSpaceId(bareSpaceId(mount.space_id)),
        actor_id: "system",
        token_id: "system",
      },
      event_type: "capability.worker_crashed",
      payload: {
        package_id: packageId,
        install_id: mount.install_id,
        bundle_digest: digest,
        exit_code: exitCode,
        signal,
      },
    } as never);
  }
}
