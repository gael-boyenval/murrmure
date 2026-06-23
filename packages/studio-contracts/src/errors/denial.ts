import { z } from "zod";
import { SpaceIdSchema } from "../ids.js";

export const MurrmureDenialSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
  hint: z
    .object({
      nearest_space_id: SpaceIdSchema.optional(),
      required_scope: z.string().optional(),
      required_package: z.string().optional(),
      install_policy: z.string().optional(),
      legal_transitions: z.array(z.string()).optional(),
    })
    .optional(),
});

export type MurrmureDenial = z.infer<typeof MurrmureDenialSchema>;

export const MURRMURE_DENIAL_CODES = {
  TOKEN_DENIED: "token_denied",
  SCOPE_ENFORCEMENT_FAILURE: "scope_enforcement_failure",
  TRANSITION_DENIED: "transition_denied",
  GATE_RESOLUTION_DENIED: "gate_resolution_denied",
  CONTRACT_VALIDATION_DENIED: "contract_validation_denied",
  HARNESS_MISMATCH: "harness_mismatch",
  GRANT_DENIED: "grant_denied",
  QUERY_FAILED: "query_failed",
  QUERY_POLICY_DENIED: "QUERY_POLICY_DENIED",
  FEDERATION_DENIED: "federation_denied",
  INSTALL_POLICY_VIOLATION: "INSTALL_POLICY_VIOLATION",
  TOOL_NOT_AUTHORIZED: "TOOL_NOT_AUTHORIZED",
  LIVE_APPLY_FAILED: "LIVE_APPLY_FAILED",
  TRANSITION_GUARD_FAILED: "TRANSITION_GUARD_FAILED",
  BUNDLE_DIGEST_MISMATCH: "BUNDLE_DIGEST_MISMATCH",
  BUNDLE_NOT_FOUND: "BUNDLE_NOT_FOUND",
  LOCAL_PATH_DENIED: "LOCAL_PATH_DENIED",
  MANIFEST_INVALID: "MANIFEST_INVALID",
  MCP_TOOL_COLLISION: "MCP_TOOL_COLLISION",
  ROUTE_PREFIX_COLLISION: "ROUTE_PREFIX_COLLISION",
} as const;

/** @deprecated use MurrmureDenialSchema */
export const StudioDenialSchema = MurrmureDenialSchema;
/** @deprecated use MurrmureDenial */
export type StudioDenial = MurrmureDenial;
/** @deprecated use MURRMURE_DENIAL_CODES */
export const STUDIO_DENIAL_CODES = MURRMURE_DENIAL_CODES;
