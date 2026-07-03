const PREFIXES = {
  spc: "scope",
  ins: "aggregate",
  tok: "credential",
  chk: "checkpoint",
  trg: "reaction",
  evt: "entry",
  grt: "grant",
} as const;

export type PrefixKey = keyof typeof PREFIXES;

export function stripPrefix(prefixed: string): string {
  const idx = prefixed.indexOf("_");
  if (idx < 0) return prefixed;
  return prefixed.slice(idx + 1);
}

export function addPrefix(prefix: PrefixKey, bare: string): string {
  return `${prefix}_${bare}`;
}

export function stripSpaceId(space_id: string): string {
  return stripPrefix(space_id);
}

export function stripInstanceId(instance_id: string): string {
  return stripPrefix(instance_id);
}

export function stripTokenId(token_id: string): string {
  return stripPrefix(token_id);
}

export function stripGateId(gate_id: string): string {
  return stripPrefix(gate_id);
}

export function addSpaceId(bare: string): string {
  return addPrefix("spc", bare);
}

export function addInstanceId(bare: string): string {
  return addPrefix("ins", bare);
}

export function addTokenId(bare: string): string {
  return addPrefix("tok", bare);
}

export function addGateId(bare: string): string {
  return addPrefix("chk", bare);
}

export function addEventId(bare: string): string {
  return addPrefix("evt", bare);
}
