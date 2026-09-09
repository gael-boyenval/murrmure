export interface MemoryToolDef {
  name: string;
  package_id: "memory";
  required_scope: "memory:read" | "memory:write";
  description: string;
  inputSchema: Record<string, unknown>;
}

const tagFilter = {
  type: "object",
  additionalProperties: false,
  required: ["tags"],
  description:
    "Visibility scopes. Omit to read every scope. Empty tags is the empty scope, not 'no filter'.",
  properties: {
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Scope names. Same set as retain.tags.",
    },
    match: {
      type: "string",
      enum: ["any", "all", "exact"],
      description: "any = overlap (default), all = containment, exact = equality.",
    },
    untagged: {
      type: "string",
      enum: ["include", "exclude"],
      description: "Whether unscoped facts match. Default include. exact ignores this.",
    },
  },
} as const;

const subjects = {
  type: "array",
  items: { type: "string" },
  minItems: 1,
  description:
    "Ranking hints, not a permission. On retain they are stored on every extracted fact. On recall/reflect they tilt ranking.",
} as const;

const factTypes = {
  type: "array",
  items: { type: "string", enum: ["world", "experience", "observation"] },
  description: "Which fact kinds to read. Omit for the tool default.",
} as const;

const when = {
  type: "object",
  additionalProperties: false,
  required: ["from", "to"],
  description: "ISO-8601 window the question is about.",
  properties: {
    from: { type: "string" },
    to: { type: "string" },
  },
} as const;

export const MEMORY_TOOLS: MemoryToolDef[] = [
  {
    name: "recall",
    package_id: "memory",
    required_scope: "memory:read",
    description:
      "Search one bank and return ranked facts. Use for 'what do we know about X?'. " +
      "For an answer written from those facts, use reflect. Never mixes banks.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["bank", "query"],
      properties: {
        bank: { type: "string", description: "Bank id (from space.yaml memory_bank)" },
        query: { type: "string" },
        limit: { type: "integer", exclusiveMinimum: 0 },
        when,
        tags: tagFilter,
        subjects,
        factTypes,
      },
    },
  },
  {
    name: "reflect",
    package_id: "memory",
    required_scope: "memory:read",
    description:
      "Answer a question from one bank. Use for 'what should I do about X?' or a summary. " +
      "Recall if you want the rows themselves. Writes nothing.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["bank", "query"],
      properties: {
        bank: { type: "string", description: "Bank id (from space.yaml memory_bank)" },
        query: { type: "string" },
        limit: { type: "integer", exclusiveMinimum: 0 },
        includeBasedOn: {
          type: "boolean",
          description: "When true, include evidence rows as basedOn.",
        },
        tags: tagFilter,
        subjects,
        factTypes,
      },
    },
  },
  {
    name: "recent",
    package_id: "memory",
    required_scope: "memory:read",
    description:
      "List the latest extracted facts in one bank, newest first. Not a search — use recall for that.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["bank"],
      properties: {
        bank: { type: "string", description: "Bank id (from space.yaml memory_bank)" },
        limit: { type: "integer", exclusiveMinimum: 0 },
        tags: tagFilter,
        factTypes,
      },
    },
  },
  {
    name: "retain",
    package_id: "memory",
    required_scope: "memory:write",
    description:
      "Store text in a bank as extracted facts. Use when something should be remembered. " +
      "`bank` is required — this write lands only in that bank.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["bank", "content"],
      properties: {
        bank: { type: "string", description: "Bank id (from space.yaml memory_bank)" },
        content: { type: "string" },
        context: { type: "string", description: "Optional framing stored with each fact." },
        documentId: { type: "string", description: "Revision anchor. Same id twice revises." },
        mentionedAt: { type: "string", description: "ISO-8601 when the text was said." },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Visibility scopes on every extracted fact. Omit for unscoped (shared). Not inferred from text.",
        },
        subjects,
      },
    },
  },
  {
    name: "retire",
    package_id: "memory",
    required_scope: "memory:write",
    description:
      "Take a fact out of one bank without deleting it. Use when a fact is wrong. " +
      "It leaves recall and can be restored later. Destructive.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["bank", "id"],
      properties: {
        bank: { type: "string", description: "Bank id (from space.yaml memory_bank)" },
        id: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
];

export const MEMORY_TOOL_NAMES = new Set(MEMORY_TOOLS.map((tool) => tool.name));

export function isMemoryTool(name: string): boolean {
  return MEMORY_TOOL_NAMES.has(name);
}

export type MemoryDiscovery = {
  /** `null` = all scopes. `[]` = empty grant. */
  grantedTags: string[] | null;
  subjectNames: string[];
};

export function memoryToolsForDiscovery(discovery: MemoryDiscovery): MemoryToolDef[] {
  return MEMORY_TOOLS.map((tool) => {
    const inputSchema = structuredClone(tool.inputSchema) as Record<string, unknown>;
    enrichMemorySchema(inputSchema, tool.name, discovery);
    return {
      ...tool,
      description: discoveryBlurb(tool.description, discovery),
      inputSchema,
    };
  });
}

function discoveryBlurb(base: string, discovery: MemoryDiscovery): string {
  const parts = [base];
  if (discovery.grantedTags === null) {
    parts.push("Tag grant: all scopes. Omit tags for unscoped/shared.");
  } else if (discovery.grantedTags.length === 0) {
    parts.push("Tag grant: empty. Omit tags (unscoped only).");
  } else {
    parts.push(`Granted tags: ${discovery.grantedTags.join(", ")}.`);
  }
  if (discovery.subjectNames.length > 0) {
    parts.push(`Subjects (shared handbook): ${discovery.subjectNames.join(", ")}.`);
  }
  return parts.join(" ");
}

function enrichMemorySchema(
  schema: Record<string, unknown>,
  toolName: string,
  discovery: MemoryDiscovery,
): void {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return;

  if (properties.tags) {
    applyTagDiscovery(properties.tags, discovery.grantedTags, toolName === "retain");
  }
  if (properties.subjects) {
    applySubjectDiscovery(properties.subjects, discovery.subjectNames);
    if (discovery.subjectNames.length > 0 && toolName === "retain") {
      const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
      if (!required.includes("subjects")) {
        schema.required = [...required, "subjects"];
      }
    }
  }
}

function applyTagDiscovery(
  field: Record<string, unknown>,
  grantedTags: string[] | null,
  retain: boolean,
): void {
  if (grantedTags === null) {
    field.description = retain
      ? "Any tag (this space granted all scopes). Omit for unscoped/shared."
      : "Any tag (this space granted all scopes). Omit to use the grant default.";
    return;
  }
  if (grantedTags.length === 0) {
    field.description = retain
      ? "Empty tag grant. Omit tags — unscoped/shared only."
      : "Empty tag grant. Hub will read unscoped facts only.";
    return;
  }
  const items = { type: "string", enum: grantedTags };
  if (field.type === "array") {
    field.items = items;
    field.description = `Granted tags: ${grantedTags.join(", ")}. Omit for unscoped/shared.`;
    return;
  }
  const props = field.properties as Record<string, Record<string, unknown>> | undefined;
  if (props?.tags) {
    props.tags.items = items;
    props.tags.description = `Granted tags: ${grantedTags.join(", ")}.`;
  }
  field.description = `Visibility filter. Allowed tags: ${grantedTags.join(", ")}. Omit to apply this space's grant (any + untagged shared).`;
}

function applySubjectDiscovery(field: Record<string, unknown>, names: string[]): void {
  if (names.length === 0) {
    field.description =
      "Ranking hints. Shared handbook is not loaded — free strings. Not a permission.";
    return;
  }
  field.items = { type: "string", enum: names };
  field.description = `Handbook subjects: ${names.join(", ")}. Ranking tilt, not a permission.`;
}
