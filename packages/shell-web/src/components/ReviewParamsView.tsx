import { useState } from "react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@murrmure/shell-ui";
import { formatSchemaLabel } from "./schema-label.js";

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
        <Label htmlFor="topic">{formatSchemaLabel({ name: "topic", required: true })}</Label>
        <Input
          id="topic"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should this run review?"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="depth">{formatSchemaLabel({ name: "depth" })}</Label>
        <Select value={depth} onValueChange={setDepth}>
          <SelectTrigger id="depth">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quick">quick</SelectItem>
            <SelectItem value="standard">standard</SelectItem>
            <SelectItem value="deep">deep</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={submitting}>
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
