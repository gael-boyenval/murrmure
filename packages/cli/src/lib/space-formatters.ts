export interface SpaceSummary {
  space_id: string;
  slug: string;
  name?: string;
  install_policy?: string;
  preview_policy?: string;
  status: string;
  description?: string;
  parent_space_id?: string;
  query_policy?: unknown;
}

export function formatSpaceListTable(spaces: SpaceSummary[]): string {
  if (spaces.length === 0) return "(no spaces)";

  const idWidth = Math.max(8, ...spaces.map((s) => s.space_id.length));
  const nameWidth = Math.max(4, ...spaces.map((s) => (s.name ?? s.slug).length));
  const slugWidth = Math.max(4, ...spaces.map((s) => s.slug.length));

  const lines = [
    `${"SPACE_ID".padEnd(idWidth)}  ${"NAME".padEnd(nameWidth)}  ${"SLUG".padEnd(slugWidth)}  STATUS`,
  ];

  for (const space of spaces) {
    lines.push(
      `${space.space_id.padEnd(idWidth)}  ${(space.name ?? space.slug).padEnd(nameWidth)}  ${space.slug.padEnd(slugWidth)}  ${space.status}`,
    );
  }

  return lines.join("\n");
}

export function formatSpaceShow(space: SpaceSummary): string {
  const lines = [
    `space_id: ${space.space_id}`,
    `slug: ${space.slug}`,
    `name: ${space.name ?? "—"}`,
    `status: ${space.status}`,
  ];
  if (space.install_policy) lines.push(`install_policy: ${space.install_policy}`);
  if (space.preview_policy) lines.push(`preview_policy: ${space.preview_policy}`);
  if (space.description) lines.push(`description: ${space.description}`);
  if (space.parent_space_id) lines.push(`parent_space_id: ${space.parent_space_id}`);
  return lines.join("\n");
}
