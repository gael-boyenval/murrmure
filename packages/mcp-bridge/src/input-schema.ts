/** Cursor rejects the entire tools/list if any inputSchema.type is not "object". */
export function ensureObjectInputSchema(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", additionalProperties: true };
  }
  if (schema.type === "object") return schema;
  return { ...schema, type: "object" };
}
