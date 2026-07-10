import type { ZodError } from "zod";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; details?: ZodError };
