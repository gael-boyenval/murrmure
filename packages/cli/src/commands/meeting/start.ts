import { defineCommand } from "citty";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { hubJson } from "../../lib/hub-request.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { emitFlowResult } from "../../lib/flow-output.js";

function parseSeat(raw: string): { space_id: string; persona?: string } | { human: true } {
  if (raw === "human") return { human: true };
  const idx = raw.indexOf(":");
  if (idx < 0) return { space_id: raw };
  return { space_id: raw.slice(0, idx), persona: raw.slice(idx + 1) };
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

export const meetingStartCommand = defineCommand({
  meta: {
    name: "start",
    description: "Convene a meeting (Requires: flow:run)",
  },
  args: {
    ...globalArgs,
    title: {
      type: "string",
      description: "Meeting title",
      required: true,
    },
    goal: {
      type: "string",
      description: "Opaque meeting goal",
    },
    chair: {
      type: "string",
      description: "Chair as space[:persona] or human",
      required: true,
    },
    participant: {
      type: "string",
      description: "Invitee space[:persona] (repeatable)",
    },
    session: {
      type: "string",
      description: "Existing session id (optional)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth } = await runScopePreflight(flags, "flow:run");

    const participants = asList(args.participant).map((raw) => {
      const seat = parseSeat(raw);
      if ("human" in seat) {
        emitFlowResult({ ok: false, code: "INVALID_INPUT", message: "--participant cannot be human" });
        return { space_id: "" };
      }
      return seat;
    });
    if (participants.length === 0 || participants.some((seat) => !seat.space_id)) {
      emitFlowResult({
        ok: false,
        code: "INVALID_INPUT",
        message: "At least one --participant space[:persona] is required",
      });
      return;
    }

    const body: Record<string, unknown> = {
      title: String(args.title),
      participants,
      chair: parseSeat(String(args.chair)),
    };
    if (args.goal) body.goal = String(args.goal);
    if (args.session) body.session_id = String(args.session);

    const result = await hubJson(auth, "/v1/meetings", {
      method: "POST",
      json: body,
    });

    if (!result.ok) {
      emitFlowResult({ ok: false, ...(result.body as Record<string, unknown>) });
      return;
    }

    emitFlowResult({ ok: true, ...(result.data as Record<string, unknown>) });
  },
});
