import { MURRMURE_DENIAL_CODES, type HandlerSpec } from "@murrmure/contracts";

export type PersonaHandlerValidation =
  | { ok: true }
  | { ok: false; code: string; message: string; handler_id?: string };

const MEETING_SAID = "mrmr.meeting.said";

export interface ValidatePersonaHandlersInput {
  handlers: HandlerSpec[];
  personaIds: string[];
}

/**
 * Apply-time gate for meeting `said` handlers. Dispatch still matches a
 * missing `participant` (this check is the gate). Non-meeting handlers are
 * unchanged.
 */
export function validatePersonaHandlers(input: ValidatePersonaHandlersInput): PersonaHandlerValidation {
  const personaSet = new Set(input.personaIds);

  for (const handler of input.handlers) {
    if (typeof handler.on === "string") continue;
    if (handler.on.event.type !== MEETING_SAID) continue;

    const participant = handler.on.event.participant;
    if (input.personaIds.length > 0 && !participant) {
      return {
        ok: false,
        code: MURRMURE_DENIAL_CODES.PERSONA_HANDLER_UNSCOPED,
        handler_id: handler.id,
        message: `Handler '${handler.id}' listens for ${MEETING_SAID} without on.event.participant`,
      };
    }

    if (handler.type !== "view_resolver" && handler.complete === "auto") {
      return {
        ok: false,
        code: MURRMURE_DENIAL_CODES.MEETING_HANDLER_COMPLETE_AUTO,
        handler_id: handler.id,
        message: `Handler '${handler.id}' uses complete: auto on ${MEETING_SAID}; use complete: explicit`,
      };
    }

    if (participant && !personaSet.has(participant)) {
      return {
        ok: false,
        code: MURRMURE_DENIAL_CODES.PERSONA_NOT_FOUND,
        handler_id: handler.id,
        message: `Handler '${handler.id}' references unknown persona '${participant}'`,
      };
    }
  }

  return { ok: true };
}
