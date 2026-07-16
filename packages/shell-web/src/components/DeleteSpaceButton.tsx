import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@murrmure/shell-ui";
import { ShellClientHttpError } from "@murrmure/shell-client";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { getStorageItem, setStorageItem } from "../hooks.js";

export interface DeleteSpaceButtonProps {
  spaceId: string;
  spaceLabel?: string;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function DeleteSpaceButton({
  spaceId,
  spaceLabel,
  size = "sm",
  className,
}: DeleteSpaceButtonProps) {
  const client = useShellClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = spaceLabel ?? spaceId;

  const archive = useMutation({
    mutationFn: () => client!.spaces.archive(spaceId),
    onSuccess: async () => {
      if (getStorageItem("murrmure_active_space") === spaceId) {
        setStorageItem("murrmure_active_space", "");
      }
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      await queryClient.removeQueries({ queryKey: ["space", spaceId] });
      await queryClient.removeQueries({ queryKey: ["space-home", spaceId] });
      setOpen(false);
      navigate("/spaces/new");
    },
    onError: (err) => {
      if (err instanceof ShellClientHttpError) {
        setError(err.message || `Could not delete space (${err.status})`);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not delete space");
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="destructive-outline"
        size={size}
        className={className}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Delete space
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setError(null);
            archive.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete space?</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{label}</span> from the hub.
              Local project files are kept; you can re-link later. Spaces with active instances
              cannot be deleted until those instances are cleared.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={archive.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={archive.isPending}
              onClick={() => {
                setError(null);
                archive.mutate();
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
