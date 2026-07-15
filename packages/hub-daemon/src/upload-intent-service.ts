import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ulid } from "ulid";
import {
  MAX_ARTIFACT_FILE_BYTES,
  MAX_RUN_ARTIFACT_BYTES,
  MAX_SPACE_ARTIFACT_BYTES,
  MAX_STEP_RESOLUTION_BYTES,
  runScratchDir,
  spaceRunsDir,
  stepWorkdirPath,
  writeStepWorkdirFile,
} from "@murrmure/hub-core";
import type { ArtifactFileMetadata, ResolveStepArtifactOut } from "@murrmure/contracts";

export const UPLOAD_IDLE_LEASE_MS = 60 * 60 * 1000;
export const UPLOAD_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

export interface UploadIntentFile extends ArtifactFileMetadata {
  slot: string;
}

export interface UploadIntentRecord {
  intent_id: string;
  run_id: string;
  step_id: string;
  branch: string;
  space_id: string;
  space_root: string;
  actor_id: string;
  token_id: string;
  idempotency_key: string;
  files: UploadIntentFile[];
  uploaded: boolean[];
  received_bytes: number[];
  hashes: Array<string | null>;
  created_at: string;
  updated_at: string;
  state: "open" | "prepared";
}

export interface UploadAttemptDiagnostic {
  run_id: string;
  step_id: string;
  branch: string;
  slot: string;
  filename: string;
  declared_media_type: string;
  received_bytes: number;
  hash?: string;
  failure_code?: string;
  failure_stage?: string;
  actor_id: string;
  timestamp: string;
}

type UploadIntentIssueInput = Omit<
  UploadIntentRecord,
  "intent_id" | "uploaded" | "received_bytes" | "hashes" | "created_at" | "updated_at" | "state"
>;

export class UploadIntentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly http: 400 | 403 | 404 | 409 | 410 | 413 | 422 = 400,
  ) {
    super(message);
  }
}

export class UploadIntentService {
  private readonly root: string;
  private readonly records = new Map<string, UploadIntentRecord>();
  private readonly idempotency = new Map<string, string>();
  private issueTail: Promise<void> = Promise.resolve();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    dataDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.root = join(dataDir, "upload-intents");
  }

  async start(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await this.loadRecords();
    await this.sweepExpired();
    this.sweepTimer = setInterval(() => void this.sweepExpired(), UPLOAD_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  async issue(input: UploadIntentIssueInput): Promise<UploadIntentRecord> {
    let release!: () => void;
    const previous = this.issueTail;
    this.issueTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.issueLocked(input);
    } finally {
      release();
    }
  }

  private async issueLocked(input: UploadIntentIssueInput): Promise<UploadIntentRecord> {
    const key = `${input.actor_id}:${input.run_id}:${input.step_id}:${input.idempotency_key}`;
    const replayId = this.idempotency.get(key);
    if (replayId) {
      const replay = this.records.get(replayId);
      if (replay && this.sameBinding(replay, input)) return replay;
      throw new UploadIntentError("UPLOAD_INTENT_REPLAY_MISMATCH", "Idempotency key is already bound to different upload metadata", 409);
    }

    const total = input.files.reduce((sum, file) => sum + file.size_bytes, 0);
    if (input.files.some((file) => file.size_bytes > MAX_ARTIFACT_FILE_BYTES)) {
      throw new UploadIntentError("ARTIFACT_QUOTA_EXCEEDED", "A file exceeds the 25 MiB ceiling", 413);
    }
    if (total > MAX_STEP_RESOLUTION_BYTES) {
      throw new UploadIntentError("ARTIFACT_QUOTA_EXCEEDED", "Submission exceeds the 50 MiB step ceiling", 413);
    }
    const active = [...this.records.values()];
    const runReserved = active
      .filter((record) => record.run_id === input.run_id)
      .reduce((sum, record) => sum + record.files.reduce((n, file) => n + file.size_bytes, 0), 0);
    const runArtifactsDir = runScratchDir(input.space_root, input.run_id);
    const runStored = await directoryBytes(runArtifactsDir);
    if (runStored + runReserved + total > MAX_RUN_ARTIFACT_BYTES) {
      throw new UploadIntentError("ARTIFACT_QUOTA_EXCEEDED", "Run artifact quota exceeded", 413);
    }
    const spaceReserved = active
      .filter((record) => record.space_id === input.space_id)
      .reduce((sum, record) => sum + record.files.reduce((n, file) => n + file.size_bytes, 0), 0);
    const spaceStored = await directoryBytes(spaceRunsDir(input.space_root));
    if (spaceStored + spaceReserved + total > MAX_SPACE_ARTIFACT_BYTES) {
      throw new UploadIntentError("ARTIFACT_QUOTA_EXCEEDED", "Space artifact quota exceeded", 413);
    }

    const timestamp = this.now().toISOString();
    const record: UploadIntentRecord = {
      ...input,
      intent_id: `upi_${ulid()}`,
      uploaded: input.files.map(() => false),
      received_bytes: input.files.map(() => 0),
      hashes: input.files.map(() => null),
      created_at: timestamp,
      updated_at: timestamp,
      state: "open",
    };
    this.records.set(record.intent_id, record);
    this.idempotency.set(key, record.intent_id);
    await this.persist(record);
    return record;
  }

  async acceptFile(input: {
    intent_id: string;
    index: number;
    actor_id: string;
    token_id: string;
    bytes: Uint8Array;
  }): Promise<{ received_bytes: number }> {
    const record = this.requireOpen(input.intent_id, input.actor_id, input.token_id);
    const metadata = record.files[input.index];
    if (!metadata) throw new UploadIntentError("UPLOAD_FILE_NOT_FOUND", "Upload file index is not declared", 404);
    if (record.uploaded[input.index]) {
      const hash = createHash("sha256").update(input.bytes).digest("hex");
      if (record.hashes[input.index] === hash && record.received_bytes[input.index] === input.bytes.byteLength) {
        record.updated_at = this.now().toISOString();
        await this.persist(record);
        return { received_bytes: input.bytes.byteLength };
      }
      throw new UploadIntentError("UPLOAD_FILE_REPLAY_MISMATCH", "Uploaded bytes do not match the accepted file", 409);
    }
    if (input.bytes.byteLength !== metadata.size_bytes) {
      await this.diagnostic(record, input.index, "UPLOAD_SIZE_MISMATCH", "transfer", input.bytes.byteLength);
      throw new UploadIntentError("UPLOAD_SIZE_MISMATCH", "Received bytes do not match declared size", 400);
    }
    const filePath = this.filePath(record.intent_id, input.index);
    await mkdir(join(this.intentPath(record.intent_id), "files"), { recursive: true });
    await writeFile(filePath, input.bytes);
    record.uploaded[input.index] = true;
    record.received_bytes[input.index] = input.bytes.byteLength;
    record.hashes[input.index] = createHash("sha256").update(input.bytes).digest("hex");
    record.updated_at = this.now().toISOString();
    await this.persist(record);
    await this.diagnostic(record, input.index);
    return { received_bytes: input.bytes.byteLength };
  }

  authorizeFile(
    intentId: string,
    index: number,
    actorId: string,
    tokenId: string,
  ): UploadIntentFile {
    const record = this.requireOpen(intentId, actorId, tokenId);
    const metadata = record.files[index];
    if (!metadata) {
      throw new UploadIntentError("UPLOAD_FILE_NOT_FOUND", "Upload file index is not declared", 404);
    }
    return metadata;
  }

  /**
   * Return the run/step/space an intent is bound to, provided it belongs to the
   * given actor/token. Used by upload routes to enforce the assignment-token
   * scope boundary on every endpoint reachable with an ephemeral resolve token.
   * Returns null when the intent is absent or belongs to another actor/token.
   */
  getIntentScope(
    intentId: string,
    actorId: string,
    tokenId: string,
  ): { run_id: string; step_id: string; space_id: string } | null {
    const record = this.records.get(intentId);
    if (!record || record.actor_id !== actorId || record.token_id !== tokenId) {
      return null;
    }
    return { run_id: record.run_id, step_id: record.step_id, space_id: record.space_id };
  }

  async recordTransferFailure(
    intentId: string,
    index: number,
    actorId: string,
    tokenId: string,
    code: string,
  ): Promise<void> {
    const record = this.requireOpen(intentId, actorId, tokenId);
    await this.diagnostic(record, index, code, "transfer");
  }

  async prepareResolve(input: {
    intent_id: string;
    run_id: string;
    step_id: string;
    branch: string;
    actor_id: string;
    token_id: string;
    idempotency_key?: string;
  }): Promise<{ artifacts_out: ResolveStepArtifactOut[] }> {
    const record = this.requireOpen(input.intent_id, input.actor_id, input.token_id);
    if (
      record.run_id !== input.run_id ||
      record.step_id !== input.step_id ||
      record.branch !== input.branch ||
      record.idempotency_key !== input.idempotency_key
    ) {
      throw new UploadIntentError("UPLOAD_INTENT_BINDING_MISMATCH", "Upload intent does not match this resolution", 409);
    }
    if (record.uploaded.some((uploaded) => !uploaded)) {
      throw new UploadIntentError("UPLOAD_INCOMPLETE", "All declared files must be uploaded before resolve", 409);
    }
    const reservations = [...this.records.values()];
    const runReserved = reservations
      .filter((candidate) => candidate.run_id === record.run_id)
      .reduce((sum, candidate) => sum + candidate.files.reduce((n, file) => n + file.size_bytes, 0), 0);
    const runArtifactsDir = runScratchDir(record.space_root, record.run_id);
    if ((await directoryBytes(runArtifactsDir)) + runReserved > MAX_RUN_ARTIFACT_BYTES) {
      throw new UploadIntentError("ARTIFACT_QUOTA_EXCEEDED", "Run artifact quota exceeded", 413);
    }
    const spaceReserved = reservations
      .filter((candidate) => candidate.space_id === record.space_id)
      .reduce((sum, candidate) => sum + candidate.files.reduce((n, file) => n + file.size_bytes, 0), 0);
    if (
      (await directoryBytes(spaceRunsDir(record.space_root))) + spaceReserved >
      MAX_SPACE_ARTIFACT_BYTES
    ) {
      throw new UploadIntentError("ARTIFACT_QUOTA_EXCEEDED", "Space artifact quota exceeded", 413);
    }
    const artifacts_out: ResolveStepArtifactOut[] = [];
    for (let index = 0; index < record.files.length; index += 1) {
      const file = record.files[index]!;
      const bytes = await readFile(this.filePath(record.intent_id, index));
      const stagedName = `${index}-${file.name}`;
      const written = await writeStepWorkdirFile({
        space_root: record.space_root,
        run_id: record.run_id,
        step_id: record.step_id,
        filename: stagedName,
        bytes,
      });
      artifacts_out.push({
        slot: file.slot,
        path: written.path,
        name: file.name,
        media_type: file.media_type,
        size_bytes: bytes.length,
      });
    }
    record.state = "prepared";
    record.updated_at = this.now().toISOString();
    await this.persist(record);
    return { artifacts_out };
  }

  async consume(intentId: string): Promise<void> {
    await this.remove(intentId);
  }

  async abandonAuthorized(intentId: string, actorId: string, tokenId: string): Promise<void> {
    const record = this.records.get(intentId);
    if (!record) {
      throw new UploadIntentError("UPLOAD_INTENT_NOT_FOUND", "Upload intent not found or expired", 410);
    }
    if (record.actor_id !== actorId || record.token_id !== tokenId) {
      throw new UploadIntentError("UPLOAD_INTENT_FORBIDDEN", "Upload intent belongs to another actor", 403);
    }
    await this.abandon(intentId);
  }

  async abandon(intentId: string, code = "UPLOAD_CANCELLED", stage = "cancel"): Promise<void> {
    const record = this.records.get(intentId);
    if (record) {
      await Promise.all(record.files.map((_, index) => this.diagnostic(record, index, code, stage)));
      if (record.state === "prepared") {
        const workdir = stepWorkdirPath(record.space_root, record.run_id, record.step_id);
        await Promise.all(
          record.files.map((file, index) =>
            rm(join(workdir, `${index}-${file.name}`), { force: true }).catch(() => undefined),
          ),
        );
      }
    }
    await this.remove(intentId);
  }

  async sweepExpired(): Promise<number> {
    const now = this.now().getTime();
    const expired = [...this.records.values()].filter(
      (record) => now - new Date(record.updated_at).getTime() >= UPLOAD_IDLE_LEASE_MS,
    );
    await Promise.all(expired.map((record) => this.abandon(record.intent_id, "UPLOAD_INTENT_EXPIRED", "lease")));
    return expired.length;
  }

  diagnostics(): Promise<string> {
    return readFile(join(this.root, "attempts.jsonl"), "utf8").catch(() => "");
  }

  private requireOpen(intentId: string, actorId: string, tokenId: string): UploadIntentRecord {
    const record = this.records.get(intentId);
    if (!record) throw new UploadIntentError("UPLOAD_INTENT_NOT_FOUND", "Upload intent not found or expired", 410);
    if (record.actor_id !== actorId || record.token_id !== tokenId) {
      throw new UploadIntentError("UPLOAD_INTENT_FORBIDDEN", "Upload intent belongs to another actor", 403);
    }
    if (record.state !== "open") {
      throw new UploadIntentError("UPLOAD_INTENT_CONSUMED", "Upload intent has already been prepared or consumed", 409);
    }
    if (this.now().getTime() - new Date(record.updated_at).getTime() >= UPLOAD_IDLE_LEASE_MS) {
      void this.abandon(intentId, "UPLOAD_INTENT_EXPIRED", "lease");
      throw new UploadIntentError("UPLOAD_INTENT_EXPIRED", "Upload intent lease expired", 410);
    }
    return record;
  }

  private sameBinding(record: UploadIntentRecord, input: Pick<UploadIntentRecord, "branch" | "space_id" | "files">): boolean {
    return record.branch === input.branch && record.space_id === input.space_id && JSON.stringify(record.files) === JSON.stringify(input.files);
  }

  private intentPath(intentId: string): string {
    return join(this.root, intentId);
  }

  private filePath(intentId: string, index: number): string {
    return join(this.intentPath(intentId), "files", String(index));
  }

  private async persist(record: UploadIntentRecord): Promise<void> {
    await mkdir(this.intentPath(record.intent_id), { recursive: true });
    await writeFile(join(this.intentPath(record.intent_id), "record.json"), `${JSON.stringify(record)}\n`, "utf8");
  }

  private async remove(intentId: string): Promise<void> {
    const record = this.records.get(intentId);
    if (record) {
      this.idempotency.delete(`${record.actor_id}:${record.run_id}:${record.step_id}:${record.idempotency_key}`);
    }
    this.records.delete(intentId);
    await rm(this.intentPath(intentId), { recursive: true, force: true });
  }

  private async loadRecords(): Promise<void> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("upi_")) continue;
      try {
        const record = JSON.parse(
          await readFile(join(this.root, entry.name, "record.json"), "utf8"),
        ) as UploadIntentRecord;
        this.records.set(record.intent_id, record);
        this.idempotency.set(
          `${record.actor_id}:${record.run_id}:${record.step_id}:${record.idempotency_key}`,
          record.intent_id,
        );
      } catch {
        await rm(join(this.root, entry.name), { recursive: true, force: true });
      }
    }
  }

  private async diagnostic(
    record: UploadIntentRecord,
    index: number,
    failureCode?: string,
    failureStage?: string,
    receivedBytes = record.received_bytes[index] ?? 0,
  ): Promise<void> {
    const file = record.files[index];
    if (!file) return;
    const diagnostic: UploadAttemptDiagnostic = {
      run_id: record.run_id,
      step_id: record.step_id,
      branch: record.branch,
      slot: file.slot,
      filename: file.name,
      declared_media_type: file.media_type,
      received_bytes: receivedBytes,
      ...(record.hashes[index] ? { hash: record.hashes[index]! } : {}),
      ...(failureCode ? { failure_code: failureCode } : {}),
      ...(failureStage ? { failure_stage: failureStage } : {}),
      actor_id: record.actor_id,
      timestamp: this.now().toISOString(),
    };
    await writeFile(join(this.root, "attempts.jsonl"), `${JSON.stringify(diagnostic)}\n`, { flag: "a" });
  }
}

async function directoryBytes(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(entryPath);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
  }
  return total;
}
