import {
  JOURNAL_EVENT_TYPES,
  MURRMURE_DENIAL_CODES,
  PersonaIdSchema,
  type Capability,
  type MeetingChair,
  type MeetingConveneBody,
  type MeetingRosterSeat,
} from "@murrmure/contracts";
import { z } from "zod";
import type { MeetingRosterSeatRow, MeetingSnapshotChair } from "@murrmure/hub-persistence";
import { stripSpaceId } from "../bridge/ids.js";
import type { HookDispatchDeps } from "../hooks/dispatch.js";
import { createSession, type SessionRunDeps } from "../run/service.js";
import { dispatchMeetingConveneTargets } from "./dispatch.js";
import { meetingAlreadyOpen, meetingDenial, personaNotFound, sessionNotFound, type MeetingDenial } from "./errors.js";
import { appendMeetingEvent } from "./journal.js";
import { mintRoster, prefixedSpace, rejectDuplicateSeats, resolveChair, rosterSpaceIds } from "./roster.js";
import { loadMeeting, writeMeetingSnapshot } from "./snapshot.js";

const ConveneRuntimeSchema = z.object({
  title: z.string().min(1),
  goal: z.string().optional(),
  session_id: z.string().min(1).optional(),
  participants: z
    .array(
      z.object({
        space_id: z.string().min(1),
        persona: PersonaIdSchema.optional(),
      }),
    )
    .min(1),
  chair: z.union([
    z.object({ human: z.literal(true) }).strict(),
    z.object({ space_id: z.string().min(1), persona: PersonaIdSchema.optional() }).strict(),
  ]),
});

export type ConveneMeetingInput = MeetingConveneBody & {
  actor_id: string;
  token_id: string;
  convenor_space_id?: string;
  bound_run_id?: string;
  bound_step_id?: string;
  capabilities?: Capability[];
};

export type ConveneMeetingResult =
  | {
      ok: true;
      session_id: string;
      status: "open";
      title: string;
      goal?: string;
      chair: MeetingSnapshotChair;
      roster: MeetingRosterSeatRow[];
      convene_meeting_seq: number;
    }
  | MeetingDenial;

async function resolveInvitee(
  deps: SessionRunDeps,
  seat: MeetingRosterSeat,
): Promise<MeetingDenial | null> {
  const bare = stripSpaceId(seat.space_id);
  const space =
    (await deps.studio.getSpace(bare)) ??
    (await deps.studio.getSpace(seat.space_id)) ??
    (await deps.studio.getSpace(prefixedSpace(bare)));
  if (!space) {
    return meetingDenial(MURRMURE_DENIAL_CODES.PERSONA_NOT_FOUND, `Unknown space ${seat.space_id}`);
  }
  if (!seat.persona) return null;
  const personas = await deps.studio.listIndexedPersonas(bare);
  if (!personas.some((row) => row.id === seat.persona)) {
    return personaNotFound(seat.persona, prefixedSpace(bare));
  }
  return null;
}

function canDispatchSeats(deps: SessionRunDeps): deps is HookDispatchDeps {
  return "invokeAction" in deps && typeof (deps as HookDispatchDeps).invokeAction === "function";
}

function mergeSpacesTouched(existing: string[], roster: MeetingRosterSeatRow[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const space of [...existing, ...roster.map((seat) => stripSpaceId(seat.space_id))]) {
    const bare = stripSpaceId(space);
    if (seen.has(bare)) continue;
    seen.add(bare);
    merged.push(bare);
  }
  return merged;
}

export async function conveneMeeting(
  deps: SessionRunDeps,
  input: ConveneMeetingInput,
): Promise<ConveneMeetingResult> {
  const parsed = ConveneRuntimeSchema.safeParse({
    title: input.title,
    goal: input.goal,
    session_id: input.session_id,
    participants: input.participants,
    chair: input.chair,
  });
  if (!parsed.success) {
    return meetingDenial(
      MURRMURE_DENIAL_CODES.CONTRACT_VALIDATION_DENIED,
      parsed.error.issues[0]?.message ?? "Invalid convene body",
    );
  }

  const duplicates = rejectDuplicateSeats(parsed.data.participants);
  if (duplicates) return duplicates;

  for (const seat of parsed.data.participants) {
    const denied = await resolveInvitee(deps, seat);
    if (denied) return denied;
  }

  const roster = mintRoster(parsed.data.participants, deps.ids.ulid);
  const chair = resolveChair(roster, parsed.data.chair as MeetingChair);
  if ("ok" in chair && chair.ok === false) return chair;

  let sessionId = parsed.data.session_id;
  if (sessionId) {
    const existing = await deps.studio.getSession(sessionId);
    if (!existing) return sessionNotFound();
  } else {
    const convenor =
      input.convenor_space_id ?? parsed.data.participants[0]?.space_id;
    const created = await createSession(deps, {
      title: parsed.data.title,
      subject: parsed.data.goal,
      actor_id: input.actor_id,
      token_id: input.token_id,
      space_id: convenor,
    });
    sessionId = created.session_id;
  }

  const open = await loadMeeting(deps.studio, sessionId);
  if (open?.status === "open") return meetingAlreadyOpen();

  const convenorSpace = prefixedSpace(
    input.convenor_space_id ?? parsed.data.participants[0]!.space_id,
  );
  const journaled = await appendMeetingEvent(deps, {
    space_id: convenorSpace,
    type: JOURNAL_EVENT_TYPES.MEETING_CONVENED,
    actor_id: input.actor_id,
    token_id: input.token_id,
    session_id: sessionId,
    data: {
      title: parsed.data.title,
      goal: parsed.data.goal,
      roster,
      chair,
    },
  });

  const session = await deps.studio.getSession(sessionId);
  await deps.studio.updateSessionSpacesTouched(
    sessionId,
    mergeSpacesTouched(session?.spaces_touched ?? [], roster),
  );

  const written = await writeMeetingSnapshot(deps.studio, {
    session_id: sessionId,
    status: "open",
    title: parsed.data.title,
    goal: parsed.data.goal,
    chair: chair as MeetingSnapshotChair,
    roster,
    convene_entry_id: journaled.entry_id,
    convene_meeting_seq: journaled.meeting_seq,
    bound_run_id: input.bound_run_id,
    bound_step_id: input.bound_step_id,
    updated_at: deps.clock.nowIso(),
  });
  if (!written.ok) return written;

  if (canDispatchSeats(deps)) {
    await dispatchMeetingConveneTargets(deps, {
      session_id: sessionId,
      event_id: journaled.entry_id,
      convenor_space_id: convenorSpace,
      title: parsed.data.title,
      goal: parsed.data.goal,
      roster,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities ?? [],
    });
  }

  return {
    ok: true,
    session_id: sessionId.startsWith("ses_") ? sessionId : `ses_${sessionId}`,
    status: "open",
    title: parsed.data.title,
    goal: parsed.data.goal,
    chair: chair as MeetingSnapshotChair,
    roster,
    convene_meeting_seq: journaled.meeting_seq,
  };
}

export function rosterSpaceIdsForAcl(roster: MeetingRosterSeatRow[]): string[] {
  return rosterSpaceIds(roster);
}
