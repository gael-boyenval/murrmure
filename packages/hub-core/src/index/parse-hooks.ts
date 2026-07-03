import { HooksFileSchema, type HooksFile } from "@murrmure/contracts";
import type { ParseResult } from "./parse-actions.js";

export function parseHooksFile(raw: unknown): ParseResult<HooksFile> {
  const parsed = HooksFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_HOOKS",
      message: "hooks.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}
