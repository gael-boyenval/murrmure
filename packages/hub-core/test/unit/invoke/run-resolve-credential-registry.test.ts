import { afterEach, describe, expect, test } from "vitest";
import {
  clearResolveCredentialRegistry,
  listRegisteredResolveCredentials,
  registerResolveCredential,
  revokeAllResolveCredentials,
  revokeRunResolveCredentials,
  revokeStepResolveCredentials,
  setResolveCredentialRevoker,
} from "../../../src/invoke/run-resolve-credential-registry.js";

describe("run-resolve-credential-registry", () => {
  afterEach(() => {
    clearResolveCredentialRegistry();
  });

  test("registers a step credential and revokes it on step resolve", () => {
    const revoked: string[] = [];
    setResolveCredentialRevoker((id) => revoked.push(id));

    registerResolveCredential("run_01JX", "write_spec", "tok_01AAA");
    expect(listRegisteredResolveCredentials()).toEqual([
      { run_id: "run_01JX", step_id: "write_spec", token_ids: ["01AAA"] },
    ]);

    const count = revokeStepResolveCredentials("run_01JX", "write_spec");
    expect(count).toBe(1);
    expect(revoked).toEqual(["01AAA"]);
    expect(listRegisteredResolveCredentials()).toEqual([]);
  });

  test("normalizes a bare run id and tok_ prefix", () => {
    setResolveCredentialRevoker(() => {});
    registerResolveCredential("01JX", "build", "01BBB");
    // run_id is normalized to run_01JX on lookup.
    expect(revokeStepResolveCredentials("run_01JX", "build")).toBe(1);
  });

  test("run terminal revokes every step credential for that run", () => {
    const revoked: string[] = [];
    setResolveCredentialRevoker((id) => revoked.push(id));
    registerResolveCredential("run_x", "write_spec", "tok_A");
    registerResolveCredential("run_x", "build", "tok_B");
    registerResolveCredential("run_y", "build", "tok_C");

    expect(revokeRunResolveCredentials("run_x")).toBe(2);
    expect(revoked.sort()).toEqual(["A", "B"]);
    // The other run's credential survives until its own terminal path.
    expect(listRegisteredResolveCredentials()).toEqual([
      { run_id: "run_y", step_id: "build", token_ids: ["C"] },
    ]);
  });

  test("shutdown revokes all registered credentials across runs", () => {
    const revoked: string[] = [];
    setResolveCredentialRevoker((id) => revoked.push(id));
    registerResolveCredential("run_x", "write_spec", "tok_A");
    registerResolveCredential("run_y", "build", "tok_B");

    expect(revokeAllResolveCredentials()).toBe(2);
    expect(revoked.sort()).toEqual(["A", "B"]);
    expect(listRegisteredResolveCredentials()).toEqual([]);
  });

  test("revocation is best-effort when no revoker is installed", () => {
    setResolveCredentialRevoker(undefined);
    registerResolveCredential("run_x", "write_spec", "tok_A");
    expect(() => revokeStepResolveCredentials("run_x", "write_spec")).not.toThrow();
    expect(listRegisteredResolveCredentials()).toEqual([]);
  });

  test("cross-step revocation does not touch a sibling step", () => {
    setResolveCredentialRevoker(() => {});
    registerResolveCredential("run_x", "write_spec", "tok_A");
    registerResolveCredential("run_x", "build", "tok_B");
    revokeStepResolveCredentials("run_x", "write_spec");
    expect(listRegisteredResolveCredentials()).toEqual([
      { run_id: "run_x", step_id: "build", token_ids: ["B"] },
    ]);
  });
});
