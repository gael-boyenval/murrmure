/** Field metadata for human-readable form labels (GateFormSchema / JSON Schema). */
export interface SchemaLabelField {
  name: string;
  title?: string;
  description?: string;
  required?: boolean;
}

/** Convert a schema property key to sentence case (e.g. `my_field` → "My field"). */
export function humanizeSchemaKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return key;
  const words = spaced.split(/\s+/);
  const [first, ...rest] = words;
  const head = first!.charAt(0).toUpperCase() + first!.slice(1).toLowerCase();
  if (rest.length === 0) return head;
  return [head, ...rest.map((word) => word.toLowerCase())].join(" ");
}

/** Label text: schema `title` when present, otherwise humanized key; marks required/optional. */
export function formatSchemaLabel(field: SchemaLabelField): string {
  const base = field.title?.trim() || humanizeSchemaKey(field.name);
  if (field.required === true) return `${base} *`;
  if (field.required === false) return `${base} (optional)`;
  return base;
}
