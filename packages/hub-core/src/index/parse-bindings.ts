import type {
  BindingsFile,
  FlowBindingRef,
  ViewBindingRef,
} from "@murrmure/contracts";
import { BindingsFileSchema } from "@murrmure/contracts";
import type { ParseResult } from "./parse-result.js";

export type ResolvedBindingSource =
  | { kind: "catalog" }
  | { kind: "local"; path: string }
  | { kind: "space"; space_id: string };

export interface ResolvedFlowBindingRef extends Omit<FlowBindingRef, "source"> {
  source: ResolvedBindingSource;
}

export interface ResolvedViewBindingRef extends Omit<ViewBindingRef, "source"> {
  source: ResolvedBindingSource;
}

export interface ResolvedBindingsFile {
  version: 1;
  flows: ResolvedFlowBindingRef[];
  views: ResolvedViewBindingRef[];
}

function invalidSource(source: string): ParseResult<ResolvedBindingSource> {
  return {
    ok: false,
    code: "INVALID_BINDINGS_SOURCE",
    message: `Unsupported bindings source '${source}' (expected local:, space:, or catalog)`,
  };
}

export function resolveBindingSource(source: string): ParseResult<ResolvedBindingSource> {
  if (source === "catalog") {
    return { ok: true, value: { kind: "catalog" } };
  }

  if (source.startsWith("local:")) {
    const path = source.slice("local:".length).trim();
    if (!path) return invalidSource(source);
    return { ok: true, value: { kind: "local", path } };
  }

  if (source.startsWith("space:")) {
    const space_id = source.slice("space:".length).trim();
    if (!space_id) return invalidSource(source);
    return { ok: true, value: { kind: "space", space_id } };
  }

  return invalidSource(source);
}

export function parseBindingsFile(raw: unknown): ParseResult<BindingsFile> {
  const parsed = BindingsFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_BINDINGS",
      message: "bindings.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}

export function resolveBindingsFile(file: BindingsFile): ParseResult<ResolvedBindingsFile> {
  const flows: ResolvedFlowBindingRef[] = [];
  for (const flow of file.flows) {
    const source = resolveBindingSource(flow.source);
    if (!source.ok) return source;
    flows.push({ ...flow, source: source.value });
  }

  const views: ResolvedViewBindingRef[] = [];
  for (const view of file.views) {
    const source = resolveBindingSource(view.source);
    if (!source.ok) return source;
    views.push({ ...view, source: source.value });
  }

  return {
    ok: true,
    value: {
      version: 1,
      flows,
      views,
    },
  };
}
