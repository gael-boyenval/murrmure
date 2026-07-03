import type {
  SpaceHomeActionRow,
  SpaceHomeEventRow,
  SpaceHomeHookRow,
  SpaceHomeIndexSection,
} from "@murrmure/shell-client";

function formatSource(source?: string | string[]): string {
  if (!source) return "any source";
  return Array.isArray(source) ? source.join(", ") : source;
}

function IndexCounts({ counts }: { counts: SpaceHomeIndexSection["counts"] }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
      <span>{counts.actions} action{counts.actions === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{counts.executors} executor{counts.executors === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{counts.hooks} hook{counts.hooks === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{counts.declared_events ?? 0} declared event{(counts.declared_events ?? 0) === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{counts.flows} flow{counts.flows === 1 ? "" : "s"}</span>
    </div>
  );
}

function HookRow({ hook }: { hook: SpaceHomeHookRow }) {
  return (
    <div className="border-b border-border py-2 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{hook.hook_id}</p>
          <p className="font-mono text-xs text-muted-foreground">{hook.event_type}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatSource(hook.source)}</span>
      </div>
      {hook.actions.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {hook.actions.map((action, index) => (
            <li key={`${hook.hook_id}-${index}`}>
              {action.kind}: {action.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({ event }: { event: SpaceHomeEventRow }) {
  const label =
    event.kind === "hook_listener"
      ? `hook ${event.hook_id ?? "?"}`
      : `flow ${event.flow_id ?? "?"}`;
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <p className="font-mono text-sm">{event.event_type}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatSource(event.source)}</span>
    </div>
  );
}

function ActionRow({ action }: { action: SpaceHomeActionRow }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <span className="font-medium">{action.name}</span>
      <span className="font-mono text-xs text-muted-foreground">{action.executor}</span>
    </div>
  );
}

export function SpaceIndexPanel({ index }: { index: SpaceHomeIndexSection }) {
  const empty =
    index.counts.actions === 0 &&
    index.counts.executors === 0 &&
    index.counts.hooks === 0 &&
    index.counts.flows === 0;

  if (empty) {
    return (
      <p className="text-sm text-muted-foreground">
        No index applied — run <code className="font-mono">mrmr space apply</code>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <IndexCounts counts={index.counts} />

      {index.hooks.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Hooks</p>
          {index.hooks.map((hook) => (
            <HookRow key={hook.hook_id} hook={hook} />
          ))}
        </div>
      )}

      {index.events.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Events</p>
          {index.events.map((event, index) => (
            <EventRow key={`${event.event_type}-${event.kind}-${event.hook_id ?? event.flow_id ?? index}`} event={event} />
          ))}
        </div>
      )}

      {index.actions.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Actions</p>
          {index.actions.map((action) => (
            <ActionRow key={action.name} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}
