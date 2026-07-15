import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";
import { createHttpApp } from "../src/app.js";
import { RuntimeKernel, DeferredWaitRegistry } from "@murrmure/runtime-kernel";
import { InMemoryPersistence } from "@murrmure/runtime-persistence";
import { ruleRefDigest, DENIAL_CODES, HTTP_SEMANTIC } from "@murrmure/runtime-contracts";
import {
  allowAllPolicy,
  compositeNotify,
  fixedClockPort,
  fixedIdPort,
  inMemoryRules,
  parseFixtureArtifact,
  permissiveCondition,
  recordingAction,
  resetFixedIds,
  strictSchema,
  noOpConvergence,
} from "../../runtime-kernel/test/stubs/index.js";
import { ERROR_HTTP_MAP } from "../src/errors.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, "../../../studio-specs/current/fixtures/kernel");

function makeHttpKernel() {
  resetFixedIds();
  const artifact = parseFixtureArtifact(
    JSON.parse(readFileSync(join(FIXTURES, "rules/linear.json"), "utf-8")),
  );
  const digest = ruleRefDigest(artifact);
  const persistence = new InMemoryPersistence();
  const waitRegistry = new DeferredWaitRegistry();
  const kernel = new RuntimeKernel({
    persistence,
    policy: allowAllPolicy(),
    rules: inMemoryRules(new Map([[digest, artifact]])),
    condition: permissiveCondition(),
    schema: strictSchema(),
    convergence: noOpConvergence(),
    notify: compositeNotify(waitRegistry),
    action: recordingAction(),
    clock: fixedClockPort(),
    ids: fixedIdPort(),
    waitRegistry,
  });
  const app = createHttpApp({ commands: kernel, queries: kernel });
  return { app, kernel, digest, persistence };
}

describe("HTTP adapter conformance", () => {
  test("create aggregate golden fixture", async () => {
    const { app, digest } = makeHttpKernel();
    const fixture = JSON.parse(readFileSync(join(FIXTURES, "http/create-aggregate.json"), "utf-8"));
    const body = {
      ...fixture.request.body,
      rule_ref: { ...fixture.request.body.rule_ref, digest },
    };

    const res = await app.request(fixture.request.path, {
      method: fixture.request.method,
      headers: fixture.request.headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();

    expect(res.status).toBe(fixture.expected.status);
    expect(json.outcome).toBe(fixture.expected.outcome);
    expect(json.code).toBe(fixture.expected.code);
  });

  test("scope_id from path not body alone", async () => {
    const { app, digest } = makeHttpKernel();
    const res = await app.request("/v1/scopes/scp_from_path/aggregates", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({
        rule_ref: { rule_ref_id: "linear", digest, version: "1.0.0" },
      }),
    });
    expect(res.status).toBe(200);
    const aggRes = await res.json();
    const get = await app.request(`/v1/scopes/scp_from_path/aggregates/${aggRes.body.aggregate_id}`);
    expect(get.status).toBe(200);
  });

  test("idempotency conflict on same key different body", async () => {
    const { app, digest } = makeHttpKernel();
    const headers = {
      Authorization: "Bearer t",
      "Content-Type": "application/json",
      "Idempotency-Key": "conflict-key",
    };
    await app.request("/v1/scopes/s/aggregates", {
      method: "POST",
      headers,
      body: JSON.stringify({ rule_ref: { rule_ref_id: "l", digest, version: "1" }, metadata: { a: 1 } }),
    });
    const conflict = await app.request("/v1/scopes/s/aggregates", {
      method: "POST",
      headers,
      body: JSON.stringify({ rule_ref: { rule_ref_id: "l", digest, version: "1" }, metadata: { a: 2 } }),
    });
    expect(conflict.status).toBe(409);
    const json = await conflict.json();
    expect(json.code).toBe(DENIAL_CODES.IDEMPOTENCY_CONFLICT);
  });

  test("full §17 error map codes have HTTP mapping", () => {
    for (const code of Object.values(DENIAL_CODES)) {
      expect(ERROR_HTTP_MAP[code]).toBeDefined();
    }
    expect(ERROR_HTTP_MAP[DENIAL_CODES.CHECKPOINT_PENDING]).toBe(HTTP_SEMANTIC.ACCEPTED);
    expect(ERROR_HTTP_MAP[DENIAL_CODES.IDEMPOTENCY_CONFLICT]).toBe(HTTP_SEMANTIC.CONFLICT);
  });

  test("removed POST /v1/scopes/:scope_id/checkpoints/:id/resolve returns 404", async () => {
    const { app } = makeHttpKernel();
    const res = await app.request("/v1/scopes/scp_demo/checkpoints/ckpt_demo/resolve", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(res.status).toBe(404);
  });
});
