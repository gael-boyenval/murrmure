export type MeetingReplyTarget = {
  message_id?: string;
  preview: string;
  fromLabel: string;
  participant_id?: string;
  cite?: { transfer_id: string; name?: string };
};

export function replyPreview(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}
