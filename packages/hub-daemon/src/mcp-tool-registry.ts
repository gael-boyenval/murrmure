import type { Capability } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import {
  hasCapability,
  resolveEffectiveCapabilities,
  buildEmittableEventsCatalog,
  buildEmitEventInputSchema,
} from "@murrmure/hub-core";
import { bareSpaceId } from "./space-id.js";
import type { TokenContext } from "./auth.js";

export interface ToolDef {
  name: string;
  package_id?: string;
  description?: string;
  required_scope?: string;
  harness_allow?: string[];
  inputSchema?: Record<string, unknown>;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: TokenContext) => Promise<unknown>;

const PLATFORM_TOOLS: Array<{
  name: string;
  required_scope: string;
  description: string;
  harness_allow?: string[];
}> = [
  { name: "query_ask", required_scope: "space:read", description: "Cross-space typed query (spec_summary@1, etc.)" },
  { name: "murrmure_apply_space", required_scope: "space:write", description: "Re-index murrmure/ files for a space" },
  { name: "murrmure_space_status", required_scope: "space:read", description: "Indexed digests and counts for a space" },
  { name: "murrmure_grant_mint", required_scope: "space:admin", description: "Mint an agent grant (CLI preferred in v2)" },
  { name: "murrmure_invoke_action", required_scope: "action:invoke", description: "Invoke a space-indexed action" },
  // Deprecated for flow step completion (VS-8 removes) — use murrmure_resolve_step for step_contract flows.
  { name: "murrmure_complete_action", required_scope: "action:invoke", description: "[deprecated] Report completion for a dispatched invoke step — prefer murrmure_resolve_step" },
  { name: "murrmure_resolve_step", required_scope: "step:resolve", description: "Resolve an active flow step (branch + payload + optional artifacts_out)" },
  { name: "murrmure_list_emittable_events", required_scope: "space:read", description: "List event types this space can emit (derived from global hook index)" },
  { name: "murrmure_emit_event", required_scope: "event:emit", description: "Emit a platform event from the caller space (source inferred)" },
  { name: "murrmure_create_session", required_scope: "flow:run", description: "Create a correlation session" },
  { name: "murrmure_list_sessions", required_scope: "space:read", description: "List sessions (filtered by grant)" },
  { name: "murrmure_get_session", required_scope: "space:read", description: "Get session by id" },
  { name: "murrmure_create_run", required_scope: "flow:run", description: "Start a run in a session" },
  { name: "murrmure_get_run", required_scope: "space:read", description: "Get run describe document" },
  { name: "murrmure_list_step_contracts", required_scope: "space:read", description: "List active step contract slice + graph_digest for a run" },
  { name: "murrmure_get_run_graph", required_scope: "flow:read", description: "Get run flowchart graph (manifest overlay + step memo)" },
  { name: "murrmure_attach_orchestration", required_scope: "flow:run", description: "Agent-push murrmure.flow.attach/v1; creates orchestration.validate gate" },
  { name: "murrmure_cancel_run", required_scope: "gate:resolve", description: "Cancel an in-flight run" },
  { name: "murrmure_wait_for_gate", required_scope: "space:read", description: "Long-poll pending gates on run/session" },
  { name: "murrmure_resolve_gate", required_scope: "gate:resolve", description: "Resolve a pending gate" },
  { name: "murrmure_wait_for_run", required_scope: "space:read", description: "Long-poll until run reaches terminal lifecycle" },
  { name: "murrmure_journal_query", required_scope: "journal:read", description: "Query journal entries with filters" },
];

export class McpToolRegistry {
  private readonly handlers = new Map<string, ToolHandler>();

  constructor(private readonly studio: StudioPersistencePort) {}

  registerHandler(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async rebuild(spaceId: string): Promise<void> {
    void spaceId;
  }

  async resolveCapabilityAcl(ctx: TokenContext): Promise<string[] | undefined> {
    if (ctx.flow_acl) return ctx.flow_acl;
    if (ctx.space_id === "bootstrap") return undefined;
    const grants = await this.studio.listGrants(bareSpaceId(ctx.space_id));
    const match = grants.find(
      (g) =>
        g.status === "active" &&
        g.actor_id === ctx.actor_id &&
        (g.harness ?? undefined) === (ctx.harness_id ?? undefined),
    );
    return match?.flow_acl;
  }

  async resolveEffectiveCaps(ctx: TokenContext): Promise<Capability[]> {
    if (ctx.space_id === "bootstrap") {
      return resolveEffectiveCapabilities({ scopes: ctx.scopes });
    }
    const token = await this.studio.getToken(ctx.token_id.replace(/^tok_/, ""));
    return resolveEffectiveCapabilities({
      scopes: token?.scopes ?? ctx.scopes,
      capabilities: token?.capabilities,
    });
  }

  async listForToken(ctx: TokenContext): Promise<ToolDef[]> {
    const effective = await this.resolveEffectiveCaps(ctx);
    const acl = await this.resolveCapabilityAcl(ctx);
    const bareSpace = ctx.space_id === "bootstrap" ? "" : bareSpaceId(ctx.space_id);
    const out: ToolDef[] = [];
    let emitCatalog: Awaited<ReturnType<typeof buildEmittableEventsCatalog>> | undefined;

    void acl;

    for (const tool of PLATFORM_TOOLS) {
      if (this.hasRequiredCapability(effective, tool.required_scope) && this.harnessOk(ctx, tool.harness_allow)) {
        const def: ToolDef = {
          name: tool.name,
          description: tool.description,
          required_scope: tool.required_scope,
          harness_allow: tool.harness_allow,
        };
        if (tool.name === "murrmure_emit_event" && bareSpace) {
          emitCatalog ??= await buildEmittableEventsCatalog(this.studio, bareSpace);
          def.inputSchema = buildEmitEventInputSchema(emitCatalog);
        }
        out.push(def);
      }
    }

    return out;
  }

  async authorizeTool(ctx: TokenContext, toolName: string): Promise<{ ok: true; tool: ToolDef } | { ok: false; hint: Record<string, unknown> }> {
    const tools = await this.listForToken(ctx);
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      const platform = PLATFORM_TOOLS.find((t) => t.name === toolName);
      if (platform) {
        return {
          ok: false,
          hint: { required_scope: platform.required_scope },
        };
      }
      return { ok: false, hint: {} };
    }
    return { ok: true, tool };
  }

  getHandler(toolName: string): ToolHandler | undefined {
    return this.handlers.get(toolName);
  }

  private hasRequiredCapability(effective: Capability[], requiredScope: string): boolean {
    switch (requiredScope) {
      case "space:admin":
        return hasCapability(effective, "hub:admin");
      case "space:write":
        return hasCapability(effective, "space:write");
      case "space:read":
        return hasCapability(effective, ["space:read", "journal:read"]);
      case "state:transition":
        return hasCapability(effective, ["flow:run", "action:invoke"]);
      case "event:emit":
        return hasCapability(effective, "action:invoke");
      case "action:invoke":
        return hasCapability(effective, "action:invoke");
      case "flow:run":
        return hasCapability(effective, ["flow:run", "action:invoke"]);
      case "flow:read":
        return hasCapability(effective, ["flow:read", "flow:run"]);
      case "gate:resolve":
        return hasCapability(effective, "gate:resolve");
      case "step:resolve":
        return hasCapability(effective, "step:resolve");
      case "journal:read":
        return hasCapability(effective, "journal:read");
      default:
        return hasCapability(effective, requiredScope as Capability);
    }
  }

  private harnessOk(ctx: TokenContext, harnessAllow?: string[]): boolean {
    if (!harnessAllow || harnessAllow.length === 0) return true;
    if (!ctx.harness_id) return false;
    return harnessAllow.includes(ctx.harness_id);
  }
}
