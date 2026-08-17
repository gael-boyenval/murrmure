export type SessionPane = "transcript" | "review" | "flowchart" | "journal";

export function defaultSessionPane(input: {
  operatorMode: boolean;
  isMeeting: boolean;
  meetingResolved: boolean;
  hasView: boolean;
}): SessionPane {
  if (input.operatorMode) return "flowchart";
  if (!input.meetingResolved) return "flowchart";
  if (input.isMeeting) return "transcript";
  if (input.hasView) return "review";
  return "flowchart";
}

export function sessionPanes(input: { isMeeting: boolean; hasView: boolean }): SessionPane[] {
  return [
    ...(input.isMeeting ? (["transcript"] as const) : []),
    ...(input.hasView ? (["review"] as const) : []),
    "flowchart",
    "journal",
  ];
}
