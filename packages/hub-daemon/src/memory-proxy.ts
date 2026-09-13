import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import type { TokenContext } from "./auth.js";
import type { DaemonContext } from "./context.js";
import { assertBankRead, assertBankWrite, type BankAccessResult } from "./memory-bank-access.js";
import { appendMemoryBankAudit, MEMORY_BANK_GRANT_JOURNAL } from "./memory-bank-grants.js";
import { enforceReadTags, enforceRetainTags, tagGrantFromSpace } from "./memory-grants.js";
import { stripHubOnlyMemoryArgs } from "./memory-mcp-client.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";

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
const WRITE_TOOLS = new Set(["retain", "retire"]);

function denialFromAccess(access: Extract<BankAccessResult, { ok: false }>): MemoryProxyDenial {
  return new MemoryProxyDenial(access.code, access.message, access.code === MURRMURE_DENIAL_CODES.MEMORY_BANK_UNKNOWN ? 400 : 403, {
    capability: access.capability,
    bank: access.bank,
  });
}

async function auditAccess(
  ctx: DaemonContext,
  auth: TokenContext,
  input: {
    tool: string;
    target_bank: string;
    decision: "allowed" | "denied";
    capability: "memory:read" | "memory:write";
    grant_id?: string;
    outcome: string;
  },
): Promise<void> {
  const spaceId = auth.space_id === "bootstrap" ? "" : prefixedSpaceId(bareSpaceId(auth.space_id));
  if (!spaceId) return;
  try {
    await appendMemoryBankAudit(ctx, {
      space_id: spaceId,
      actor_id: auth.actor_id,
      token_id: auth.token_id,
      type: MEMORY_BANK_GRANT_JOURNAL.accessed,
      data: {
        caller_space_id: spaceId,
        target_bank: input.target_bank,
        decision: input.decision,
        tool: input.tool,
        capability: input.capability,
        grant_id: input.grant_id,
        outcome: input.outcome,
      },
    });
  } catch {
    // Audit must not block the Memory call or leak engine errors as facts.
  }
}

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
  const requested = typeof args.bank === "string" ? args.bank.trim() : "";
  const write = WRITE_TOOLS.has(toolName);
  const capability = write ? "memory:write" : "memory:read";

  const access = write
    ? await assertBankWrite(ctx.murrmurePersistence, space, requested)
    : await assertBankRead(ctx.murrmurePersistence, space, requested);

  if (!access.ok) {
    await auditAccess(ctx, auth, {
      tool: toolName,
      target_bank: access.bank || requested,
      decision: "denied",
      capability,
      outcome: access.code,
    });
    throw denialFromAccess(access);
  }

  const next: Record<string, unknown> = { ...args, bank: access.bank };
  // Tag allowlists are own-bank inbound grants. A memory bank grant is bank-scoped
  // and read-only — do not apply the caller's tags to a foreign bank.
  if (access.own) {
    const grant = tagGrantFromSpace(space?.memory_tags);

    if (toolName === "retain") {
      const tags = enforceRetainTags(grant, args.tags);
      if (!tags.ok) {
        await auditAccess(ctx, auth, {
          tool: toolName,
          target_bank: access.bank,
          decision: "denied",
          capability: "memory:write",
          grant_id: access.grant_id,
          outcome: MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED,
        });
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
        await auditAccess(ctx, auth, {
          tool: toolName,
          target_bank: access.bank,
          decision: "denied",
          capability: "memory:read",
          grant_id: access.grant_id,
          outcome: MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED,
        });
        throw new MemoryProxyDenial(MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED, read.message, 403, {
          capability: "memory:read",
          tags: read.unknown,
        });
      }
      if (read.filter) next.tags = read.filter;
      else delete next.tags;
    }
  }

  await auditAccess(ctx, auth, {
    tool: toolName,
    target_bank: access.bank,
    decision: "allowed",
    capability,
    grant_id: access.grant_id,
    outcome: "ok",
  });

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
