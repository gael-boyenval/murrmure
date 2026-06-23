import type { CommandResult, DenialCode, HttpSemantic } from "@murrmure/runtime-contracts";
import { DENIAL_CODES, HTTP_SEMANTIC } from "@murrmure/runtime-contracts";

export const ERROR_HTTP_MAP: Record<DenialCode, HttpSemantic> = {
  [DENIAL_CODES.POLICY_DENIED]: HTTP_SEMANTIC.FORBIDDEN,
  [DENIAL_CODES.NOT_FOUND]: HTTP_SEMANTIC.NOT_FOUND,
  [DENIAL_CODES.REVISION_CONFLICT]: HTTP_SEMANTIC.CONFLICT,
  [DENIAL_CODES.TRANSITION_DENIED]: HTTP_SEMANTIC.CONFLICT,
  [DENIAL_CODES.TRANSITION_STALE]: HTTP_SEMANTIC.CONFLICT,
  [DENIAL_CODES.CHECKPOINT_PENDING]: HTTP_SEMANTIC.ACCEPTED,
  [DENIAL_CODES.CHECKPOINT_DENIED]: HTTP_SEMANTIC.FORBIDDEN,
  [DENIAL_CODES.CHECKPOINT_ALREADY_RESOLVED]: HTTP_SEMANTIC.CONFLICT,
  [DENIAL_CODES.VALIDATION_DENIED]: HTTP_SEMANTIC.FORBIDDEN,
  [DENIAL_CODES.IDEMPOTENCY_REPLAY]: HTTP_SEMANTIC.OK,
  [DENIAL_CODES.IDEMPOTENCY_CONFLICT]: HTTP_SEMANTIC.CONFLICT,
};

export function resultToResponse(result: CommandResult): Response {
  const status = result.http_semantic ?? ERROR_HTTP_MAP[result.code as DenialCode] ?? 400;
  return Response.json(
    {
      outcome: result.outcome,
      code: result.code,
      body: result.body,
      journal_entry_id: result.journal_entry_id,
      seq: result.seq,
    },
    { status },
  );
}

export function commandIdFromRequest(req: Request): string | undefined {
  return req.headers.get("Idempotency-Key") ?? req.headers.get("idempotency-key") ?? undefined;
}

export function bearerCredential(req: Request): { actor_id: string; credential_id: string } {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "anonymous";
  return { actor_id: `actor:${token}`, credential_id: `cred:${token}` };
}
