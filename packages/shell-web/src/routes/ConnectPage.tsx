import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { AppShell } from "../layout/AppShell.js";

export function ConnectPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connect local tools</h1>
          <CardDescription className="mt-2">
            Local connection credentials never appear in Desktop. Create one
            trust-boundary connection from the CLI.
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
              Select integration contexts, reload them, then call
              murrmure_space_status. Credentials stay in the OS store.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
