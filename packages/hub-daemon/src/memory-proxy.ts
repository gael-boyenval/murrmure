import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import type { TokenContext } from "./auth.js";
import type { DaemonContext } from "./context.js";
import { enforceReadTags, enforceRetainTags, tagGrantFromSpace } from "./memory-grants.js";
import { stripHubOnlyMemoryArgs } from "./memory-mcp-client.js";
import { bareSpaceId } from "./space-id.js";

export class MemoryProxyDenial extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: 400 | 403 | 502 | 503 = 403,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MemoryProxyDenial";
  }
}

const READ_TOOLS = new Set(["recall", "reflect", "recent"]);

export async function proxyMemoryTool(
  ctx: DaemonContext,
  auth: TokenContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!ctx.memoryMcp.isReady()) {
    throw new MemoryProxyDenial(
      MURRMURE_DENIAL_CODES.MEMORY_MCP_UNAVAILABLE,
      "Memory MCP is not connected",
      503,
    );
  }

  const bare = auth.space_id === "bootstrap" ? "" : bareSpaceId(auth.space_id);
  const space = bare ? await ctx.murrmurePersistence.getSpace(bare) : null;
  const spaceBank = space?.memory_bank?.trim();
  if (!spaceBank) {
    throw new MemoryProxyDenial(
      MURRMURE_DENIAL_CODES.MEMORY_BANK_UNKNOWN,
      "This space has no memory_bank — set it in space.yaml and apply",
      400,
    );
  }

  const requested = typeof args.bank === "string" ? args.bank.trim() : "";
  if (requested && requested !== spaceBank) {
    throw new MemoryProxyDenial(
      MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED,
      `Bank "${requested}" is outside this space's memory_bank "${spaceBank}"`,
      403,
      { capability: toolName === "retain" || toolName === "retire" ? "memory:write" : "memory:read", bank: requested },
    );
  }

  const next: Record<string, unknown> = { ...args, bank: spaceBank };
  const grant = tagGrantFromSpace(space?.memory_tags);

  if (toolName === "retain") {
    const tags = enforceRetainTags(grant, args.tags);
    if (!tags.ok) {
      throw new MemoryProxyDenial(MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED, tags.message, 403, {
        capability: "memory:write",
        tags: tags.unknown,
      });
    }
    if (tags.tags) next.tags = tags.tags;
    else delete next.tags;
  } else if (READ_TOOLS.has(toolName)) {
    const read = enforceReadTags(grant, args.tags);
    if (!read.ok) {
      throw new MemoryProxyDenial(MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED, read.message, 403, {
        capability: "memory:read",
        tags: read.unknown,
      });
    }
    if (read.filter) next.tags = read.filter;
    else delete next.tags;
  }

  const forwarded = stripHubOnlyMemoryArgs(next);
  const result = await ctx.memoryMcp.callTool(toolName, forwarded);
  if (result.isError) {
    const message =
      result.payload && typeof result.payload === "object" && "error" in result.payload
        ? String((result.payload as { error: unknown }).error)
        : "Memory engine error";
    throw new MemoryProxyDenial(MURRMURE_DENIAL_CODES.MEMORY_ENGINE_ERROR, message, 502);
  }
  return result.payload;
}
