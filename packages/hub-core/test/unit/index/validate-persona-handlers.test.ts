import { describe, expect, test } from "vitest";
import { MURRMURE_DENIAL_CODES, type HandlerSpec } from "@murrmure/contracts";
import { validatePersonaHandlers } from "../../../src/index/validate-persona-handlers.js";

function saidHandler(overrides: Partial<HandlerSpec> & { id: string; participant?: string }): HandlerSpec {
  const { participant, ...rest } = overrides;
  return {
    contract_keys: [],
    on: { event: { type: "mrmr.meeting.said", ...(participant ? { participant } : {}) } },
    type: "mcp_session",
    complete: "explicit",
    ...rest,
  } as HandlerSpec;
}

describe("index/validate-persona-handlers", () => {
  test("rejects unscoped said handler when personas exist", () => {
    const result = validatePersonaHandlers({
      handlers: [saidHandler({ id: "meeting-all" })],
      personaIds: ["designer"],
    });
    expect(result).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.PERSONA_HANDLER_UNSCOPED,
      handler_id: "meeting-all",
    });
  });

  test("rejects complete: auto on said handlers", () => {
    const result = validatePersonaHandlers({
      handlers: [saidHandler({ id: "meeting-designer", participant: "designer", complete: "auto" })],
      personaIds: ["designer"],
    });
    expect(result).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEETING_HANDLER_COMPLETE_AUTO,
      handler_id: "meeting-designer",
    });
  });

  test("rejects participant not in persona ids", () => {
    const result = validatePersonaHandlers({
      handlers: [saidHandler({ id: "meeting-qa", participant: "qa" })],
      personaIds: ["designer"],
    });
    expect(result).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.PERSONA_NOT_FOUND,
      handler_id: "meeting-qa",
    });
  });

  test("accepts scoped explicit said handler", () => {
    expect(
      validatePersonaHandlers({
        handlers: [saidHandler({ id: "meeting-designer", participant: "designer" })],
        personaIds: ["designer"],
      }),
    ).toEqual({ ok: true });
  });

  test("unscoped said handler is allowed when the space has no personas", () => {
    expect(
      validatePersonaHandlers({
        handlers: [saidHandler({ id: "meeting-default" })],
        personaIds: [],
      }),
    ).toEqual({ ok: true });
  });

  test("non-meeting handlers are unchanged", () => {
    const handler: HandlerSpec = {
      id: "brief-wake",
      contract_keys: [],
      on: { event: { type: "brief.requested" } },
      type: "mcp_session",
      complete: "auto",
    };
    expect(validatePersonaHandlers({ handlers: [handler], personaIds: ["designer"] })).toEqual({ ok: true });
  });
});
