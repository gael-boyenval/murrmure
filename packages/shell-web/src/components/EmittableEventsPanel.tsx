import type { SpaceHomeEmittableEventRow } from "@murrmure/shell-client";

function ListenerRow({
  listener,
}: {
  listener: SpaceHomeEmittableEventRow["listeners"][number];
}) {
  const target = listener.action ?? listener.flow_id ?? listener.hook_id;
  return (
    <li className="text-xs text-muted-foreground">
      {listener.space_id} → {target}
    </li>
  );
}

function EmittableEventRow({ event }: { event: SpaceHomeEmittableEventRow }) {
  return (
    <div className="border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <p className="font-mono text-sm">{event.event_type}</p>
        {event.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
        )}
      </div>
      {event.payload_hints.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Payload: {event.payload_hints.join(", ")}
        </p>
      )}
      {event.payload_schema?.required?.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Required: {event.payload_schema.required.join(", ")}
        </p>
      ) : null}
      {event.listeners.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {event.listeners.map((listener) => (
            <ListenerRow key={`${listener.space_id}-${listener.hook_id}`} listener={listener} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmittableEventsPanel({ events }: { events: SpaceHomeEmittableEventRow[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No cross-space listeners match this space as a source yet.
      </p>
    );
  }

  return (
    <div>
      {events.map((event) => (
        <EmittableEventRow key={event.event_type} event={event} />
      ))}
    </div>
  );
}
