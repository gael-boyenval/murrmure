import { useState } from "react";
import type { GateForm } from "@murrmure/shell-client";
import { Button, Input, Label } from "@murrmure/shell-ui";

export interface ViewParamFormProps {
  form: GateForm;
  onSubmit: (params: Record<string, unknown>) => void;
  onCancel?: () => void;
  submitting?: boolean;
}

/** GateFormSchema-style fallback when a custom view bundle is missing. */
export function ViewParamForm({ form, onSubmit, onCancel, submitting }: ViewParamFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, unknown> = {};
    for (const field of form.fields) {
      if (field.type === "enum" && field.values?.length) {
        params[field.name] = values[field.name] ?? field.values[0];
      } else {
        params[field.name] = values[field.name] ?? "";
      }
    }
    onSubmit(params);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {form.fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name}>
            {field.name}
            {field.required ? " *" : ""}
          </Label>
          {field.type === "enum" && field.values?.length ? (
            <select
              id={field.name}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={values[field.name] ?? field.values[0]}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
            >
              {field.values.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={field.name}
              required={field.required}
              value={values[field.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
            />
          )}
        </div>
      ))}
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
