import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  UPLOAD_IDLE_LEASE_MS,
  UploadIntentError,
  UploadIntentService,
} from "../src/upload-intent-service.js";

describe("UploadIntentService", () => {
  let root: string;
  let now: number;
  let service: UploadIntentService;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "murrmure-upload-intents-"));
    now = Date.parse("2026-07-15T00:00:00.000Z");
    service = new UploadIntentService(root, () => new Date(now));
    await service.start();
  });

  afterEach(() => {
    service.stop();
    rmSync(root, { recursive: true, force: true });
  });

  async function issue(idempotency_key = "once") {
    return service.issue({
      run_id: "run_test",
      step_id: "intake",
      branch: "continue",
      space_id: "space",
      space_root: root,
      actor_id: "actor",
      token_id: "token",
      idempotency_key,
      files: [{
        slot: "spec",
        name: "spec.md",
        media_type: "text/markdown",
        size_bytes: 4,
      }],
    });
  }

  test("binds actor, metadata, idempotency, and accepted activity", async () => {
    const intent = await issue();
    expect((await issue()).intent_id).toBe(intent.intent_id);
    expect(() =>
      service.authorizeFile(intent.intent_id, 0, "other", "token"),
    ).toThrowError(expect.objectContaining({ code: "UPLOAD_INTENT_FORBIDDEN" }));
    await expect(
      service.acceptFile({
        intent_id: intent.intent_id,
        index: 0,
        actor_id: "other",
        token_id: "token",
        bytes: Buffer.from("spec"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_INTENT_FORBIDDEN" });
    await expect(
      service.abandonAuthorized(intent.intent_id, "other", "token"),
    ).rejects.toMatchObject({ code: "UPLOAD_INTENT_FORBIDDEN" });
    await expect(
      service.acceptFile({
        intent_id: intent.intent_id,
        index: 0,
        actor_id: "actor",
        token_id: "token",
        bytes: Buffer.from("bad"),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_SIZE_MISMATCH" });
    now += UPLOAD_IDLE_LEASE_MS - 1;
    await service.acceptFile({
      intent_id: intent.intent_id,
      index: 0,
      actor_id: "actor",
      token_id: "token",
      bytes: Buffer.from("spec"),
    });
    now += UPLOAD_IDLE_LEASE_MS - 1;
    expect(await service.sweepExpired()).toBe(0);
  });

  test("expires at the exact idle boundary and deletes temporary bytes", async () => {
    const intent = await issue("expire");
    await service.acceptFile({
      intent_id: intent.intent_id,
      index: 0,
      actor_id: "actor",
      token_id: "token",
      bytes: Buffer.from("spec"),
    });
    now += UPLOAD_IDLE_LEASE_MS;
    expect(await service.sweepExpired()).toBe(1);
    expect(existsSync(join(root, "upload-intents", intent.intent_id))).toBe(false);
    await expect(
      service.prepareResolve({
        intent_id: intent.intent_id,
        run_id: "run_test",
        step_id: "intake",
        branch: "continue",
        actor_id: "actor",
        token_id: "token",
        idempotency_key: "expire",
      }),
    ).rejects.toBeInstanceOf(UploadIntentError);
    expect(await service.diagnostics()).not.toContain(root);
  });

  test("startup sweep removes expired persisted intents after restart", async () => {
    const intent = await issue("restart-expiry");
    await service.acceptFile({
      intent_id: intent.intent_id,
      index: 0,
      actor_id: "actor",
      token_id: "token",
      bytes: Buffer.from("spec"),
    });
    service.stop();
    now += UPLOAD_IDLE_LEASE_MS;
    service = new UploadIntentService(root, () => new Date(now));
    await service.start();
    expect(existsSync(join(root, "upload-intents", intent.intent_id))).toBe(false);
    expect(await service.diagnostics()).toContain("UPLOAD_INTENT_EXPIRED");
  });

  test("serializes concurrent reservations at the exact run quota", async () => {
    const fileSize = 25 * 1024 * 1024;
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        service.issue({
          run_id: "run_quota",
          step_id: `step-${index}`,
          branch: "continue",
          space_id: "space",
          space_root: root,
          actor_id: "actor",
          token_id: "token",
          idempotency_key: `quota-${index}`,
          files: [
            { slot: "spec", name: `${index}-a.md`, media_type: "text/markdown", size_bytes: fileSize },
            { slot: "spec", name: `${index}-b.md`, media_type: "text/markdown", size_bytes: fileSize },
          ],
        }),
      ),
    );
    await expect(
      service.issue({
        run_id: "run_quota",
        step_id: "overflow",
        branch: "continue",
        space_id: "space",
        space_root: root,
        actor_id: "actor",
        token_id: "token",
        idempotency_key: "quota-overflow",
        files: [{ slot: "spec", name: "overflow.md", media_type: "text/markdown", size_bytes: 1 }],
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_QUOTA_EXCEEDED" });
  });
});
