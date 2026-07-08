import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";

export function ProfileMenu() {
  const client = useShellClient();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => client!.me.get(),
    enabled: Boolean(client),
  });

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: () => client!.spaces.list(),
    enabled: Boolean(client),
  });

  const setLanding = useMutation({
    mutationFn: (space_id: string) => client!.me.patch({ landing_space_id: space_id }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const setNotifyEmail = useMutation({
    mutationFn: (notify_email: boolean) => client!.me.patch({ notify_email }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const setNotifyDesktop = useMutation({
    mutationFn: (notify_desktop: boolean) => client!.me.patch({ notify_desktop }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const landing = meQuery.data?.landing_space_id;
  const spaces = spacesQuery.data ?? [];
  const notifyEmail = meQuery.data?.notify_email !== false;
  const notifyDesktop = meQuery.data?.notify_desktop !== false;

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={notifyEmail}
          onChange={(e) => setNotifyEmail.mutate(e.target.checked)}
        />
        Email
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={notifyDesktop}
          onChange={(e) => setNotifyDesktop.mutate(e.target.checked)}
        />
        Desktop
      </label>
      {spaces.length > 0 ? (
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={landing ?? ""}
          onChange={(e) => {
            if (e.target.value) setLanding.mutate(e.target.value);
          }}
        >
          <option value="">Landing space…</option>
          {spaces.map((s) => (
            <option key={s.space_id} value={s.space_id}>
              {s.name ?? s.slug ?? s.space_id}
            </option>
          ))}
        </select>
      ) : null}
      <Button variant="ghost" size="sm" asChild>
        <a href="/logs">Logs</a>
      </Button>
    </div>
  );
}
