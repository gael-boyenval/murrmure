import { stableStringify } from "@murrmure/runtime-contracts";

export function toCanonicalJson(value: unknown): string {
  return stableStringify(value);
}

export function fromJson<T>(json: string): T {
  return JSON.parse(json) as T;
}

export function projectionKey(name: string, scope_id: string, aggregate_id?: string): string {
  return `${name}:${scope_id}:${aggregate_id ?? "_"}`;
}
