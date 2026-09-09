export type MemoryTagGrant = {
  /** `null` = all scopes (space omitted `memory_tags`). `[]` = empty grant. */
  tags: string[] | null;
};

export type TagFilterArgs = {
  tags?: unknown;
  match?: unknown;
  untagged?: unknown;
};

export type MemoryGrantDenial = {
  ok: false;
  unknown: string[];
  message: string;
};

export type RetainTagsResult =
  | { ok: true; tags?: string[] }
  | MemoryGrantDenial;

export type ReadTagsResult =
  | { ok: true; filter?: { tags: string[]; match?: "any" | "all" | "exact"; untagged?: "include" | "exclude" } }
  | MemoryGrantDenial;

export function tagGrantFromSpace(memory_tags: string[] | undefined): MemoryTagGrant {
  return { tags: memory_tags === undefined ? null : memory_tags };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function outsideGrant(grant: string[], requested: string[]): string[] {
  const allowed = new Set(grant);
  return requested.filter((tag) => !allowed.has(tag));
}

export function enforceRetainTags(grant: MemoryTagGrant, requested: unknown): RetainTagsResult {
  const tags = stringList(requested);
  if (tags.length === 0) {
    return { ok: true };
  }
  if (grant.tags === null) {
    return { ok: true, tags };
  }
  const unknown = outsideGrant(grant.tags, tags);
  if (unknown.length > 0) {
    return {
      ok: false,
      unknown,
      message: `Tags not granted to this space: ${unknown.join(", ")}`,
    };
  }
  return { ok: true, tags };
}

export function parseTagFilter(raw: unknown): TagFilterArgs | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as TagFilterArgs;
}

export function enforceReadTags(grant: MemoryTagGrant, requested: unknown): ReadTagsResult {
  const filter = parseTagFilter(requested);
  const requestedTags = filter ? stringList(filter.tags) : undefined;
  const match =
    filter?.match === "any" || filter?.match === "all" || filter?.match === "exact" ? filter.match : undefined;
  const untagged =
    filter?.untagged === "include" || filter?.untagged === "exclude" ? filter.untagged : undefined;

  if (grant.tags === null) {
    if (!filter) return { ok: true };
    return {
      ok: true,
      filter: {
        tags: requestedTags ?? [],
        ...(match ? { match } : {}),
        ...(untagged ? { untagged } : {}),
      },
    };
  }

  if (requestedTags && requestedTags.length > 0) {
    const unknown = outsideGrant(grant.tags, requestedTags);
    if (unknown.length > 0) {
      return {
        ok: false,
        unknown,
        message: `Tags not granted to this space: ${unknown.join(", ")}`,
      };
    }
    return {
      ok: true,
      filter: {
        tags: requestedTags,
        ...(match ? { match } : {}),
        ...(untagged ? { untagged } : {}),
      },
    };
  }

  if (requestedTags && requestedTags.length === 0) {
    return {
      ok: true,
      filter: {
        tags: [],
        match: match ?? "exact",
        untagged: untagged ?? "include",
      },
    };
  }

  if (grant.tags.length === 0) {
    return { ok: true, filter: { tags: [], match: "exact", untagged: "include" } };
  }

  return {
    ok: true,
    filter: {
      tags: grant.tags,
      match: "any",
      untagged: "include",
    },
  };
}
