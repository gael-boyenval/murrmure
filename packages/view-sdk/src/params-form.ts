import type { GateForm } from "@murrmure/contracts";

/** Default param form when view bundle is missing (GateFormSchema-style fallback). */
export function defaultRunParamsForm(): GateForm {
  return {
    id: "run.params.v1",
    fields: [{ name: "topic", type: "string", required: true }],
  };
}

/** Convert a minimal JSON Schema object to GateForm fields for shell fallback. */
export function paramsSchemaToGateForm(schema: unknown): GateForm {
  if (!schema || typeof schema !== "object") return defaultRunParamsForm();
  const s = schema as {
    properties?: Record<
      string,
      { type?: string; enum?: string[]; title?: string; description?: string }
    >;
    required?: string[];
  };
  const props = s.properties ?? {};
  const fields = Object.entries(props).map(([name, prop]) => ({
    name,
    type: prop.enum?.length ? "enum" : (prop.type ?? "string"),
    values: prop.enum,
    required: s.required?.includes(name) ?? false,
    title: prop.title,
    description: prop.description,
  }));
  if (!fields.length) return defaultRunParamsForm();
  return { id: "run.params.v1", fields };
}
