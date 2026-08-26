import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MeetingSeatActivity } from "@murrmure/shell-client";
import { Badge, cn } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { meetingSeatLabel, type SpaceLabelMap } from "./MeetingTranscriptPane.js";
import { SeatTerminal } from "./SeatTerminal.js";

export function MeetingAgentActivity({
  sessionId,
  spaceLabels,
}: {
  sessionId: string;
  spaceLabels: SpaceLabelMap;
}) {
  const client = useShellClient();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [ptyText, setPtyText] = useState("");
  const [ptyLive, setPtyLive] = useState(false);
  const [ptyEpoch, setPtyEpoch] = useState(0);

  const seatsQuery = useQuery({
    queryKey: ["session-seats", sessionId],
    queryFn: () => client!.sessions.listSeats(sessionId),
    enabled: Boolean(client && sessionId),
    refetchInterval: 2_000,
  });

  const seats = seatsQuery.data?.seats ?? [];
  const selected = seats.find((seat) => seat.participant_id === selectedId) ?? seats[0];

  useEffect(() => {
    if (!selectedId && seats[0]) setSelectedId(seats[0].participant_id);
  }, [seats, selectedId]);

  useEffect(() => {
    if (!client || !selected) {
      setPtyText("");
      setPtyLive(false);
      return;
    }
    setPtyText("");
    setPtyLive(selected.live);
    setPtyEpoch((n) => n + 1);
    return client.sessions.subscribeSeatPty(sessionId, selected.participant_id, (event) => {
      if (event.type === "snapshot") {
        setPtyText(event.text);
        setPtyLive(event.live);
        setPtyEpoch((n) => n + 1);
        return;
      }
      setPtyText((prior) => `${prior}${event.text}`);
      setPtyLive(true);
    });
  }, [client, sessionId, selected?.participant_id]);

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
      <ul className="w-56 shrink-0 overflow-auto rounded-md border border-border bg-card p-1">
        {seats.length === 0 ? (
          <li className="px-2 py-3 text-xs text-muted-foreground">No seats on this room yet.</li>
        ) : (
          seats.map((seat) => (
            <SeatRow
              key={seat.participant_id}
              seat={seat}
              selected={seat.participant_id === selected?.participant_id}
              label={meetingSeatLabel(seat, spaceLabels)}
              onSelect={() => setSelectedId(seat.participant_id)}
            />
          ))
        )}
      </ul>
      {selected ? (
        <SeatTerminal
          key={`${selected.participant_id}:${ptyEpoch}`}
          text={ptyText}
          live={ptyLive}
          emptyLabel={
            selected.live
              ? "Waiting for this seat’s process…"
              : "No PTY recording for this seat. Convene or resume to start one."
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">Pick a seat.</p>
      )}
    </div>
  );
}

function SeatRow({
  seat,
  selected,
  label,
  onSelect,
}: {
  seat: MeetingSeatActivity;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs",
          selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="truncate font-medium">{label}</span>
          <Badge variant={seat.live ? "success" : "outline"}>{seat.live ? "live" : "idle"}</Badge>
        </span>
        <span className="truncate font-mono text-[10px] text-zinc-500">
          {seat.handler_id ?? "no process"}
        </span>
      </button>
    </li>
  );
}
