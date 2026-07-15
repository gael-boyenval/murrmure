import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ulid } from "ulid";
import {
  ArtifactMaterializeBodySchema,
  ArtifactPutBodySchema,
  JOURNAL_EVENT_TYPES,
  type ArtifactV1,
  isLocalSpaceBinding,
} from "@murrmure/contracts";
import type { HubHandler } from "@murrmure/hub-core";
import {
  exchangeFilePath,
  inboxFilePath,
  isArtifactReaderAuthorized,
  isArtifactExpired,
  computeBytesDigest,
  outboxFilePath,
  planMaterialize,
  registerArtifactManifest,
  relativeInboxPath,
  selectArtifactsForGc,
} from "@murrmure/hub-core";
import type { ArtifactRow, StudioPersistencePort } from "@murrmure/hub-persistence";
import { resolveDataDir } from "./ops.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";
import type { DaemonContext } from "./context.js";
import { broadcastSse } from "./context.js";

export class ArtifactService {
  constructor(
    private readonly studio: StudioPersistencePort,
    private readonly handler: HubHandler,
    private readonly ctx: DaemonContext,
  ) {}

  private dataDir(): string {
    return resolveDataDir(this.ctx.config);
  }

  private readExchangeBytes(transferId: string, name: string): Buffer {
    return readFileSync(exchangeFilePath(this.dataDir(), transferId, name));
  }

  private writeExchangeBytes(transferId: string, name: string, bytes: Buffer): void {
    const dest = exchangeFilePath(this.dataDir(), transferId, name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
  }

  private rowToManifest(row: ArtifactRow): ArtifactV1 {
    return {
      kind: "mrmr.artifact/v1",
      transfer_id: row.transfer_id,
      digest: row.digest,
      name: row.name,
      size_bytes: row.size_bytes,
      authorized_readers: row.authorized_readers,
      hold: row.hold,
    };
  }

  materializeToInbox(spaceRoot: string, transferId: string, name: string, bytes: Buffer): string {
    const dest = inboxFilePath(spaceRoot, transferId, name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
    return relativeInboxPath(transferId, name);
  }

  async putArtifact(input: {
    bytes: Buffer;
    metadata: unknown;
    actor_id: string;
    token_id: string;
  }) {
    const parsed = ArtifactPutBodySchema.safeParse(input.metadata);
    if (!parsed.success) {
      return {
        http: 400 as const,
        body: {
          code: "INVALID_ARTIFACT_BODY",
          message: "Artifact put body failed validation",
          issues: parsed.error.issues,
        },
      };
    }

    const bare = bareSpaceId(parsed.data.space_id);
    const space = await this.studio.getSpace(bare);
    if (!space) {
      return { http: 404 as const, body: { code: "space_not_found", message: "Space not found" } };
    }

    const bytes = input.bytes;
    if (bytes.length === 0) {
      return { http: 400 as const, body: { code: "INVALID_CONTENT", message: "Artifact content is empty" } };
    }

    const registered = registerArtifactManifest({
      transfer_id: parsed.data.transfer_id ?? `xfr_${ulid()}`,
      source_space_id: bare,
      name: parsed.data.name,
      bytes,
      authorized_readers: parsed.data.authorized_readers,
      hold: parsed.data.hold,
      ttl_days: parsed.data.ttl_days,
    });

    const existing = await this.studio.findArtifactByDigest(bare, registered.digest);
    if (existing && !parsed.data.transfer_id) {
      return {
        http: 200 as const,
        body: { artifact: this.rowToManifest(existing) },
      };
    }

    const created_at = new Date().toISOString();
    const row: ArtifactRow = {
      transfer_id: registered.manifest.transfer_id,
      source_space_id: bare,
      name: registered.manifest.name,
      digest: registered.digest,
      size_bytes: registered.size_bytes,
      hold: registered.manifest.hold ?? false,
      authorized_readers: registered.manifest.authorized_readers,
      expires_at: registered.expires_at,
      created_at,
    };

    this.writeExchangeBytes(row.transfer_id, row.name, bytes);

    const bindings = await this.studio.getSpaceBindings(bare);
    const localBindings = bindings.filter(isLocalSpaceBinding);
    const sourceRoot = localBindings.find((b) => b.primary)?.path ?? localBindings[0]?.path;
    if (sourceRoot) {
      const outbox = outboxFilePath(sourceRoot, row.transfer_id, row.name);
      mkdirSync(dirname(outbox), { recursive: true });
      copyFileSync(exchangeFilePath(this.dataDir(), row.transfer_id, row.name), outbox);
    }

    await this.studio.insertArtifact(row);

    await this.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.ARTIFACT_TRANSFERRED,
      space_id: prefixedSpaceId(bare),
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: { artifact: registered.manifest },
    });

    broadcastSse(this.ctx, {
      event: "journal.append",
      data: {
        type: JOURNAL_EVENT_TYPES.ARTIFACT_TRANSFERRED,
        space_id: prefixedSpaceId(bare),
        transfer_id: row.transfer_id,
      },
    });

    return {
      http: 201 as const,
      body: { artifact: registered.manifest },
    };
  }

  async getArtifact(input: {
    transfer_id: string;
    requester_space_id: string;
    requester_actor_id: string;
  }) {
    const row = await this.studio.getArtifact(input.transfer_id);
    if (!row) {
      return { http: 404 as const, body: { code: "ARTIFACT_NOT_FOUND", message: "Artifact not found" } };
    }

    if (
      !isArtifactReaderAuthorized(
        row.authorized_readers,
        input.requester_space_id,
        input.requester_actor_id,
      )
    ) {
      return {
        http: 403 as const,
        body: { code: "ARTIFACT_ACCESS_DENIED", message: "Reader is not authorized for this artifact" },
      };
    }

    return {
      http: 200 as const,
      body: {
        artifact: this.rowToManifest(row),
        expires_at: row.expires_at,
      },
    };
  }

  async materializeArtifact(input: {
    transfer_id: string;
    body: unknown;
    requester_actor_id: string;
  }) {
    const parsed = ArtifactMaterializeBodySchema.safeParse(input.body);
    if (!parsed.success) {
      return {
        http: 400 as const,
        body: {
          code: "INVALID_MATERIALIZE_BODY",
          message: "Materialize body failed validation",
          issues: parsed.error.issues,
        },
      };
    }

    const row = await this.studio.getArtifact(input.transfer_id);
    if (!row) {
      return { http: 404 as const, body: { code: "ARTIFACT_NOT_FOUND", message: "Artifact not found" } };
    }

    const bare = bareSpaceId(parsed.data.space_id);
    const bindings = await this.studio.getSpaceBindings(bare);
    const localBindings = bindings.filter(isLocalSpaceBinding);
    const spaceRoot = localBindings.find((b) => b.primary)?.path ?? localBindings[0]?.path;
    if (!spaceRoot) {
      return {
        http: 422 as const,
        body: { code: "SPACE_ROOT_MISSING", message: "Target space has no linked root path" },
      };
    }

    const bytes = this.readExchangeBytes(row.transfer_id, row.name);
    const plan = planMaterialize({
      transfer_id: row.transfer_id,
      name: row.name,
      digest: row.digest,
      space_root: spaceRoot,
      authorized_readers: row.authorized_readers,
      requester_space_id: bare,
      requester_actor_id: input.requester_actor_id,
      expires_at: row.expires_at,
      bytes,
    });

    if ("code" in plan) {
      const status = plan.code === "ARTIFACT_ACCESS_DENIED" ? 403 : 422;
      return { http: status as 403 | 422, body: plan };
    }

    mkdirSync(dirname(plan.absolute_path), { recursive: true });
    writeFileSync(plan.absolute_path, bytes);

    const manifest = {
      ...this.rowToManifest(row),
      local_path: plan.relative_path,
    };

    return {
      http: 200 as const,
      body: { artifact: manifest },
    };
  }

  async loadArtifactForInvoke(
    transfer_id: string,
  ): Promise<{ manifest: ArtifactV1; expires_at: string; bytes: Uint8Array } | null> {
    const row = await this.studio.getArtifact(transfer_id);
    if (!row) return null;
    const path = exchangeFilePath(this.dataDir(), row.transfer_id, row.name);
    if (!existsSync(path)) return null;
    return {
      manifest: this.rowToManifest(row),
      expires_at: row.expires_at,
      bytes: this.readExchangeBytes(row.transfer_id, row.name),
    };
  }

  /**
   * Serve the raw bytes of a registered artifact to a federated consumer after
   * enforcing the same ACL / expiry / digest checks the local materialize path
   * enforces. This is the producer-side surface that lets a destination hub
   * fetch relayed artifact references by `transfer_id` without destination
   * pre-seeding: the consumer invokes this via the relayed `hub_token` /
   * `hub_url`, verifies the digest against the relayed reference, and
   * materializes a verified consumer copy in its own space.
   *
   * Authorization is the artifact's `authorized_readers` ACL (the requester
   * space must be listed) — the gate that matters for a cross-hub fetch where
   * the caller's token may be scoped to the producer's space. A 403 is returned
   * for an unauthorized reader, 410 for an expired artifact, 404 when the
   * artifact or its exchange bytes are missing, and 422 when the exchange bytes
   * no longer match the registered digest.
   */
  async serveArtifactBytes(input: {
    transfer_id: string;
    requester_space_id: string;
    requester_actor_id: string;
  }): Promise<
    | { http: 200; bytes: Buffer; name: string; digest: string }
    | { http: 403 | 404 | 410 | 422; body: { code: string; message: string } }
  > {
    const row = await this.studio.getArtifact(input.transfer_id);
    if (!row) {
      return {
        http: 404,
        body: { code: "ARTIFACT_NOT_FOUND", message: "Artifact not found" },
      };
    }

    if (
      !isArtifactReaderAuthorized(
        row.authorized_readers,
        input.requester_space_id,
        input.requester_actor_id,
      )
    ) {
      return {
        http: 403,
        body: {
          code: "ARTIFACT_ACCESS_DENIED",
          message: "Reader is not authorized for this artifact",
        },
      };
    }

    if (isArtifactExpired(row.expires_at)) {
      return {
        http: 410,
        body: { code: "ARTIFACT_EXPIRED", message: "Artifact has expired" },
      };
    }

    const exchangePath = exchangeFilePath(this.dataDir(), row.transfer_id, row.name);
    if (!existsSync(exchangePath)) {
      return {
        http: 404,
        body: { code: "ARTIFACT_NOT_FOUND", message: "Artifact bytes are not available" },
      };
    }

    const bytes = this.readExchangeBytes(row.transfer_id, row.name);
    if (computeBytesDigest(bytes) !== row.digest) {
      return {
        http: 422,
        body: {
          code: "ARTIFACT_DIGEST_MISMATCH",
          message: `Digest mismatch for artifact '${input.transfer_id}'`,
        },
      };
    }

    return { http: 200, bytes, name: row.name, digest: row.digest };
  }

  async runGc(actor_id = "actor_system", token_id = "01JBOOTSTRAPTOKEN00000001"): Promise<number> {
    const rows = await this.studio.listArtifacts();
    const { eligible } = selectArtifactsForGc(
      rows.map((row) => ({
        transfer_id: row.transfer_id,
        source_space_id: row.source_space_id,
        hold: row.hold,
        expires_at: row.expires_at,
      })),
    );

    for (const candidate of eligible) {
      const row = rows.find((r) => r.transfer_id === candidate.transfer_id);
      if (!row) continue;

      const exchangePath = exchangeFilePath(this.dataDir(), row.transfer_id, row.name);
      const exchangeDirPath = dirname(exchangePath);
      if (existsSync(exchangePath)) {
        rmSync(exchangePath, { force: true });
      }
      if (existsSync(exchangeDirPath)) {
        rmSync(exchangeDirPath, { recursive: true, force: true });
      }

      await this.studio.deleteArtifact(row.transfer_id);

      await this.handler.appendSpaceJournal({
        type: JOURNAL_EVENT_TYPES.ARTIFACT_EXPIRED,
        space_id: prefixedSpaceId(row.source_space_id),
        actor_id,
        token_id,
        data: { transfer_id: row.transfer_id, digest: row.digest },
      });
    }

    return eligible.length;
  }
}
