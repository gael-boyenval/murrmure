import type {
  SpaceHomeActionRow,
  SpaceHomeHandlerRow,
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
      <span>{counts.handlers} handler{counts.handlers === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{counts.declared_events ?? 0} declared event{(counts.declared_events ?? 0) === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{counts.flows} flow{counts.flows === 1 ? "" : "s"}</span>
    </div>
  );
}

function HandlerRow({ handler }: { handler: SpaceHomeHandlerRow }) {
  return (
    <div className="border-b border-border py-2 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{handler.handler_id}</p>
          {handler.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{handler.description}</p>
          ) : null}
          <p className="mt-1 font-mono text-xs text-muted-foreground">{handler.event_type}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatSource(handler.source)}</span>
      </div>
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
    index.counts.handlers === 0 &&
    (index.counts.declared_events ?? 0) === 0 &&
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

      {index.handlers.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Handlers</p>
          {index.handlers.map((handler) => (
            <HandlerRow key={handler.handler_id} handler={handler} />
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
