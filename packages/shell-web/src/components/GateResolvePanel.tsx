import { useState } from "react";
import type { GateForm, GateItem } from "@murrmure/shell-client";
import { Button, Card, CardContent, Input, Label } from "@murrmure/shell-ui";
import { GateHeader } from "./GateHeader.js";
import { formatSchemaLabel } from "./schema-label.js";

export interface GateResolvePanelProps {
  gate: GateItem;
  onSubmit: (values: { decision: "approved" | "rejected"; form_values: Record<string, unknown> }) => Promise<void>;
  submitting?: boolean;
  /** Shown above Approve for high-stakes gates (e.g. orchestration bind). */
  approveConsequence?: string;
  /** Omit blocked-work summary in header (e.g. when parent card already shows it). */
  hideHeaderSummary?: boolean;
  /** Omit the entire header (e.g. when a parent card already renders GateHeader). */
  hideHeader?: boolean;
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

export function GateResolvePanel({ gate, onSubmit, submitting, approveConsequence, hideHeaderSummary, hideHeader }: GateResolvePanelProps) {
  const form = gate.form ?? defaultForm();
  const [values, setValues] = useState<Record<string, string>>({});

  const handleSubmit = async (decision: "approved" | "rejected") => {
    const form_values: Record<string, unknown> = { ...values, decision: decision === "approved" ? "approve" : "reject" };
    await onSubmit({ decision, form_values });
  };

  return (
    <Card>
      {!hideHeader ? <GateHeader gate={gate} hideSummary={hideHeaderSummary} /> : null}
      <CardContent className="space-y-4">
        {form.fields.map((field) => {
          if (field.type === "enum" && field.name === "decision") {
            return null;
          }
          return (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{formatSchemaLabel(field)}</Label>
              {field.description ? (
                <p className="text-sm text-muted-foreground">{field.description}</p>
              ) : null}
              <Input
                id={field.name}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              />
            </div>
          );
        })}
        {approveConsequence ? (
          <p
            id="gate-resolve-approve-consequence"
            className="rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
          >
            {approveConsequence}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            loading={submitting}
            aria-describedby={approveConsequence ? "gate-resolve-approve-consequence" : undefined}
            onClick={() => void handleSubmit("approved")}
          >
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
