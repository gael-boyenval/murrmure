import { describe, expect, test } from "vitest";
import {
  type AuthContext,
  hasScope,
  requireAnyScope,
  requireScope,
  requireTokenForSpace,
  resolveScopesForSpace,
  selectPreflightMode,
} from "../src/lib/scope.js";

const bootstrapEmptyHubCtx: AuthContext = {
  tokenScopes: ["space:admin"],
  tokenSpaceId: "bootstrap",
  whoami: { spaces: [] },
};

const singleSpaceCtx: AuthContext = {
  tokenScopes: ["space:read", "event:read"],
  tokenSpaceId: "spc_ui_sandbox",
  whoami: {
    spaces: [{ space_id: "spc_ui_sandbox", scopes: ["space:read", "event:read"] }],
  },
};

describe("scope preflight", () => {
  test("hasScope grants space:admin for any required scope", () => {
    expect(hasScope(["space:admin"], "flow:install")).toBe(true);
    expect(hasScope(["space:read"], "flow:install")).toBe(false);
    expect(hasScope(["space:read", "space:admin"], "trigger:register")).toBe(true);
  });

  test("bootstrap token with empty whoami.spaces resolves tokenScopes for space create", () => {
    const scopes = resolveScopesForSpace(bootstrapEmptyHubCtx, "spc_new");
    expect(scopes).toEqual(["space:admin"]);
    expect(requireScope(bootstrapEmptyHubCtx, "spc_new", "space:admin")).toBeUndefined();
  });

  test("bootstrap token with empty whoami falls back to tokenScopes for any space", () => {
    expect(resolveScopesForSpace(bootstrapEmptyHubCtx, "spc_first")).toEqual(["space:admin"]);
  });

  test("empty whoami on single-space token resolves only matching space", () => {
    const ctx: AuthContext = {
      tokenScopes: ["space:read", "event:read"],
      tokenSpaceId: "spc_ui_sandbox",
      whoami: { spaces: [] },
    };
    expect(resolveScopesForSpace(ctx, "spc_ui_sandbox")).toEqual(["space:read", "event:read"]);
    expect(resolveScopesForSpace(ctx, "spc_other")).toMatchObject({ code: "SCOPE_UNKNOWN_SPACE" });
  });

  test("unknown space fails scope resolution when whoami lists other spaces", () => {
    const result = resolveScopesForSpace(singleSpaceCtx, "spc_other");
    expect(result).toMatchObject({ code: "SCOPE_UNKNOWN_SPACE" });
  });

  test("requireScope blocks missing scope on config routes", () => {
    const result = requireScope(singleSpaceCtx, "spc_ui_sandbox", "space:admin");
    expect(result).toMatchObject({ code: "SCOPE_MISSING", requiredScope: "space:admin" });
  });

  test("requireTokenForSpace allows bootstrap without space row", () => {
    expect(requireTokenForSpace(bootstrapEmptyHubCtx, "spc_new")).toBeUndefined();
  });

  test("requireTokenForSpace blocks wrong-space token", () => {
    const result = requireTokenForSpace(singleSpaceCtx, "spc_other");
    expect(result).toMatchObject({ code: "TOKEN_WRONG_SPACE" });
  });

  test("selectPreflightMode maps route kinds to hub enforcement", () => {
    expect(selectPreflightMode("config")).toBe("requireScope");
    expect(selectPreflightMode("product")).toBe("requireTokenForSpace");
  });

  test("requireAnyScope allows bootstrap and checks any listed space", () => {
    expect(requireAnyScope(bootstrapEmptyHubCtx, "space:admin")).toBeUndefined();
    expect(requireAnyScope(singleSpaceCtx, "space:read")).toBeUndefined();
    expect(requireAnyScope(singleSpaceCtx, "space:admin")).toMatchObject({
      code: "SCOPE_MISSING",
    });
  });

  test("runtime product routes use requireTokenForSpace not requireScope(space:read)", () => {
    const readOnlyCtx: AuthContext = {
      tokenScopes: ["event:read"],
      tokenSpaceId: "spc_ui_sandbox",
      whoami: {
        spaces: [{ space_id: "spc_ui_sandbox", scopes: ["event:read"] }],
      },
    };
    expect(requireTokenForSpace(readOnlyCtx, "spc_ui_sandbox")).toBeUndefined();
    expect(requireScope(readOnlyCtx, "spc_ui_sandbox", "space:read")).toMatchObject({
      code: "SCOPE_MISSING",
    });
  });
});
