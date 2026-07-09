import { Button } from "@murrmure/shell-ui";

export function ProfileMenu() {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" asChild>
        <a href="/logs">Logs</a>
      </Button>
    </div>
  );
}
