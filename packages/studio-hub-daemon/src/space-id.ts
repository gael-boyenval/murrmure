/** Strip only the spc_ prefix — do not use stripSpaceId from hub-core on bare slugs with underscores. */
export function bareSpaceId(space_id: string): string {
  if (space_id === "bootstrap") return space_id;
  return space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
}

export function prefixedSpaceId(space_id: string): string {
  return space_id.startsWith("spc_") ? space_id : `spc_${space_id}`;
}
