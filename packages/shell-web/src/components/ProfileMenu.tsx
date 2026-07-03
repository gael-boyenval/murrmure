import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@murrmure/shell-ui";
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
      <fieldset className="flex flex-col gap-0.5 border-0 p-0">
        <legend className="sr-only">Notifications</legend>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="notify-email"
              checked={notifyEmail}
              onCheckedChange={(checked) => setNotifyEmail.mutate(checked === true)}
            />
            <Label htmlFor="notify-email" className="text-xs font-normal text-muted-foreground">
              Email
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="notify-desktop"
              checked={notifyDesktop}
              onCheckedChange={(checked) => setNotifyDesktop.mutate(checked === true)}
            />
            <Label htmlFor="notify-desktop" className="text-xs font-normal text-muted-foreground">
              Desktop
            </Label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Alerts for gates and failed runs.</p>
      </fieldset>
      {spaces.length > 0 ? (
        <Select
          value={landing ?? undefined}
          onValueChange={(space_id) => setLanding.mutate(space_id)}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Landing space">
            <SelectValue placeholder="Landing space…" />
          </SelectTrigger>
          <SelectContent>
            {spaces.map((s) => (
              <SelectItem key={s.space_id} value={s.space_id}>
                {s.name ?? s.slug ?? s.space_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button variant="ghost" size="sm" asChild>
        <a href="/logs">Logs</a>
      </Button>
    </div>
  );
}
