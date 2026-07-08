import { useState } from "react";
import type { GateForm, GateItem } from "@murrmure/shell-client";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@murrmure/shell-ui";

export interface GateResolvePanelProps {
  gate: GateItem;
  onSubmit: (values: { decision: "approved" | "rejected"; form_values: Record<string, unknown> }) => Promise<void>;
  submitting?: boolean;
}

function defaultForm(): GateForm {
  return {
    id: "review.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"], required: true },
      { name: "notes", type: "string", required: false },
    ],
  };
}

export function GateResolvePanel({ gate, onSubmit, submitting }: GateResolvePanelProps) {
  const form = gate.form ?? defaultForm();
  const [values, setValues] = useState<Record<string, string>>({});

  const handleSubmit = async (decision: "approved" | "rejected") => {
    const form_values: Record<string, unknown> = { ...values, decision: decision === "approved" ? "approve" : "reject" };
    await onSubmit({ decision, form_values });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resolve gate</CardTitle>
        {gate.space_label ? (
          <p className="text-sm text-muted-foreground">
            {gate.space_hidden ? gate.space_label : gate.space_link ? gate.space_label : gate.space_label}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {form.fields.map((field) => {
          if (field.type === "enum" && field.name === "decision") {
            return null;
          }
          return (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{field.name}</Label>
              <Input
                id={field.name}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              />
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button disabled={submitting} onClick={() => void handleSubmit("approved")}>
            Approve
          </Button>
          <Button variant="outline" disabled={submitting} onClick={() => void handleSubmit("rejected")}>
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
