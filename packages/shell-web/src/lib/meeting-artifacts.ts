import type { MeetingTranscript, MeetingTranscriptMessage } from "@murrmure/shell-client";

export type MeetingArtifactRef = {
  transfer_id: string;
  message_id: string;
  created_at: string;
  fromLabel: string;
  participant_id?: string;
};

function senderLabel(message: MeetingTranscriptMessage): string {
  if ("persona" in message.from && "space_id" in message.from) {
    const persona = message.from.persona;
    return persona ?? "seat";
  }
  return "human chair";
}

export function listTranscriptArtifacts(
  transcript: MeetingTranscript,
  labels?: (message: MeetingTranscriptMessage) => string,
): MeetingArtifactRef[] {
  const seen = new Set<string>();
  const rows: MeetingArtifactRef[] = [];
  for (const message of transcript.messages) {
    for (const transfer_id of message.artifacts ?? []) {
      if (seen.has(transfer_id)) continue;
      seen.add(transfer_id);
      rows.push({
        transfer_id,
        message_id: message.message_id,
        created_at: message.created_at,
        fromLabel: labels?.(message) ?? senderLabel(message),
        participant_id: "participant_id" in message.from ? message.from.participant_id : undefined,
      });
    }
  }
  return rows;
}
