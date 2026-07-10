import { ViewManifestSchema, type ViewManifest } from "@murrmure/contracts";
import type { ParseResult } from "./parse-result.js";

export function parseViewManifest(raw: unknown): ParseResult<ViewManifest> {
  const parsed = ViewManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_VIEW_MANIFEST",
      message: "view.manifest.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}
