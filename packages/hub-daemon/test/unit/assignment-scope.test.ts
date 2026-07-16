import { describe, expect, test } from "vitest";
import { requireAssignmentScope } from "../../src/routes/config/scopes.js";
import type { TokenContext } from "../../src/auth.js";

function ephemeralToken(overrides: Partial<TokenContext> = {}): TokenContext {
  return {
    token_id: "tok_01JXEPHEMERAL0000000001",
    actor_id: "act_handler",
    space_id: "space_alpha",
    scopes: ["step:resolve"],
    harness_id: "run:run_alpha",
    scope_ref: "run_alpha:intake:write_spec_copy",
    ...overrides,
  };
}

function grantToken(overrides: Partial<TokenContext> = {}): TokenContext {
  return {
    token_id: "tok_01JXGRANT00000000000002",
    actor_id: "act_agent",
    space_id: "space_alpha",
    scopes: ["space:read", "flow:run", "step:resolve"],
    ...overrides,
  };
}

describe("requireAssignmentScope — assignment token boundary", () => {
  test("an ephemeral token for the same run/step/space is allowed", () => {
    const auth = ephemeralToken();
    expect(requireAssignmentScope(auth, { run_id: "run_alpha", step_id: "intake", space_id: "space_alpha" })).toBeNull();
  });

  test("accepts a prefixed run id when the token scope_ref is bare", () => {
    const auth = ephemeralToken({ scope_ref: "run_alpha:intake:write_spec_copy" });
    expect(requireAssignmentScope(auth, { run_id: "run_run_alpha", step_id: "intake", space_id: "space_alpha" })).toBeNull();
  });

  test("denies an ephemeral token scoped to another run (TOKEN_RUN_SCOPE_MISMATCH)", () => {
    const auth = ephemeralToken();
    const res = requireAssignmentScope(auth, { run_id: "run_beta", step_id: "intake", space_id: "space_alpha" });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
    return expect((res as Response).json()).resolves.toMatchObject({ code: "TOKEN_RUN_SCOPE_MISMATCH" });
  });

  test("denies an ephemeral token scoped to another step (TOKEN_STEP_SCOPE_MISMATCH)", () => {
    const auth = ephemeralToken();
    const res = requireAssignmentScope(auth, { run_id: "run_alpha", step_id: "build", space_id: "space_alpha" });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
    return expect((res as Response).json()).resolves.toMatchObject({ code: "TOKEN_STEP_SCOPE_MISMATCH" });
  });

  test("denies an ephemeral token scoped to another space (SCOPE_ENFORCEMENT_FAILURE)", () => {
    const auth = ephemeralToken();
    const res = requireAssignmentScope(auth, { run_id: "run_alpha", step_id: "intake", space_id: "space_beta" });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
    return expect((res as Response).json()).resolves.toMatchObject({ code: "scope_enforcement_failure" });
  });

  test("denies an ephemeral token for a prefixed run in another space", () => {
    const auth = ephemeralToken();
    const res = requireAssignmentScope(auth, { run_id: "run_run_beta", step_id: "intake", space_id: "space_beta" });
    expect((res as Response).status).toBe(403);
    return expect((res as Response).json()).resolves.toMatchObject({ code: "scope_enforcement_failure" });
  });

  test("a grant token (no scope_ref) is only space-scoped and may resolve any step in its space", () => {
    const auth = grantToken();
    expect(requireAssignmentScope(auth, { run_id: "run_any", step_id: "any_step", space_id: "space_alpha" })).toBeNull();
  });

  test("a grant token for another space is denied", () => {
    const auth = grantToken();
    const res = requireAssignmentScope(auth, { run_id: "run_any", step_id: "any_step", space_id: "space_beta" });
    expect((res as Response).status).toBe(403);
    return expect((res as Response).json()).resolves.toMatchObject({ code: "scope_enforcement_failure" });
  });

  test("a bootstrap token bypasses the space boundary", () => {
    const auth = grantToken({ space_id: "bootstrap" });
    expect(requireAssignmentScope(auth, { run_id: "run_any", step_id: "any_step", space_id: "space_any" })).toBeNull();
  });

  test("the handler segment in scope_ref does not affect run:step verification", () => {
    const auth = ephemeralToken({ scope_ref: "run_alpha:intake:some_other_handler" });
    expect(requireAssignmentScope(auth, { run_id: "run_alpha", step_id: "intake", space_id: "space_alpha" })).toBeNull();
  });
});
