export interface SchemaValidation {
  valid: boolean;
  errors?: string[];
}

export interface SchemaPort {
  validate(schema: Record<string, unknown>, data: unknown): Promise<SchemaValidation>;
}
