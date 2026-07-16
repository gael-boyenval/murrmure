import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { PrototypeShell } from "../prototype-shell.js";

export function ConnectPrototype() {
  return (
    <PrototypeShell activePath="/connect" spaces={[]} headerVariant="disconnected">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connect local tools</h1>
          <CardDescription className="mt-2">
            Create a least-privilege connection from the CLI. Credentials stay
            in the operating system store.
          </CardDescription>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hub connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <code className="block rounded-md bg-muted px-3 py-2 text-sm">
              mrmr connection create --space spc_…
            </code>
            <p className="text-sm text-muted-foreground">
              Select integration contexts, reload them, then verify with
              murrmure_space_status.
            </p>
          </CardContent>
        </Card>
      </div>
    </PrototypeShell>
  );
}
