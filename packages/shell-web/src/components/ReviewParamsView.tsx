import { useState } from "react";
import { Button, Input, Label } from "@murrmure/shell-ui";

export interface ReviewParamsViewProps {
  onSubmit: (params: Record<string, unknown>) => void;
  onCancel?: () => void;
  submitting?: boolean;
}

/** Built-in shell route `murrmure/review-params` for tests and demos. */
export function ReviewParamsView({ onSubmit, onCancel, submitting }: ReviewParamsViewProps) {
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState("standard");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ topic, depth });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="topic">Topic *</Label>
        <Input
          id="topic"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should this run review?"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="depth">Depth</Label>
        <select
          id="depth"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={depth}
          onChange={(e) => setDepth(e.target.value)}
        >
          <option value="quick">quick</option>
          <option value="standard">standard</option>
          <option value="deep">deep</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          Start run
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
