import type { RunGraphNode } from "@murrmure/shell-client";
import { Badge, Button } from "@murrmure/shell-ui";

export function FlowStepMetadataPanel({
  node,
  onClose,
}: {
  node?: RunGraphNode;
  onClose?: () => void;
}) {
  const metadata = node?.metadata;
  if (!node || !metadata) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        Select a step to inspect its contract and resolver.
      </div>
    );
  }

  const branches = Array.isArray(metadata.branches) ? metadata.branches : [];

  return (
    <section
      aria-label={`Step metadata for ${node.step_id}`}
      className="scrollbar-subtle min-h-0 overflow-y-auto rounded-md border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{node.step_id}</h2>
          {metadata.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{metadata.description}</p>
          ) : null}
        </div>
        {onClose ? (
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Close step metadata">
            Close
          </Button>
        ) : null}
      </div>

      <div className="mt-5 space-y-5 text-sm">
        <div>
          <h3 className="font-medium">Resolver</h3>
          {metadata.resolver ? (
            <div className="mt-2 space-y-1 rounded border border-border p-3">
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{metadata.resolver.type}</Badge>
                <Badge variant="outline">
                  {metadata.resolver_source === "current" ? "Current binding" : "Dispatched binding"}
                </Badge>
              </div>
              <p className="font-mono text-xs">{metadata.resolver.handler_id}</p>
              {metadata.resolver.view_id ? <p>View: {metadata.resolver.view_id}</p> : null}
              <p className="break-all font-mono text-xs text-muted-foreground">
                {metadata.resolver.config_digest}
              </p>
            </div>
          ) : (
            <div className="mt-2 rounded border border-border p-3">
              <p className="font-medium">No resolver bound</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This step remains open until an authorized client resolves it.
              </p>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-medium">Branches and contracts</h3>
          <div className="mt-2 space-y-3">
            {branches.length === 0 ? (
              <p className="text-xs text-muted-foreground">No branch contracts on this step.</p>
            ) : (
              branches.map((branch) => {
                const routes = Array.isArray(branch.routes) ? branch.routes : [];
                const artifactSlots = branch.artifact_slots ?? {};
                const artifactRequired = Array.isArray(branch.artifact_required)
                  ? branch.artifact_required
                  : [];
                return (
                  <div key={branch.branch} className="rounded border border-border p-3">
                    <p className="font-medium">{branch.branch}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Route:{" "}
                      {routes.length
                        ? routes.map((route) => route.step_id ?? route.engine ?? "advance").join(", ")
                        : "—"}
                    </p>
                    {branch.schema_ref ? (
                      <p className="mt-1 font-mono text-xs">Schema: {branch.schema_ref}</p>
                    ) : null}
                    {branch.schema ? (
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">
                        {JSON.stringify(branch.schema, null, 2)}
                      </pre>
                    ) : null}
                    {Object.keys(artifactSlots).length ? (
                      <div className="mt-2">
                        <p className="text-xs font-medium">Artifacts</p>
                        <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                          {Object.entries(artifactSlots).map(([slot, constraints]) => (
                            <li key={slot}>
                              <span className="font-mono">{slot}</span>
                              {artifactRequired.includes(slot) ? " (required)" : ""}
                              {constraints && Object.keys(constraints).length
                                ? ` — ${JSON.stringify(constraints)}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
