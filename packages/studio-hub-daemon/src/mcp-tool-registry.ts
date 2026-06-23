import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";
import type { TokenContext } from "./auth.js";
import type { MountRegistry } from "./mount-registry.js";

export interface ToolDef {
  name: string;
  package_id?: string;
  description?: string;
  required_scope?: string;
  harness_allow?: string[];
}

export type ToolHandler = (args: Record<string, unknown>, ctx: TokenContext) => Promise<unknown>;

const PLATFORM_TOOLS: Array<{
  name: string;
  required_scope: string;
  description: string;
  harness_allow?: string[];
}> = [
  { name: "get_space_state", required_scope: "space:read", description: "Get instance state and pending gates" },
  { name: "contract_versions", required_scope: "space:read", description: "Return pinned contract versions" },
  { name: "transition", required_scope: "state:transition", description: "Apply a state transition on a hub instance" },
  { name: "wait_for_state", required_scope: "state:transition", description: "Register a wait and poll until matched" },
  { name: "emit_event", required_scope: "event:emit", description: "Append a custom event to an instance journal" },
  { name: "query_ask", required_scope: "space:read", description: "Cross-space typed query (spec_summary@1, etc.)" },
];

export class McpToolRegistry {
  private readonly handlers = new Map<string, ToolHandler>();

  constructor(
    private readonly mountRegistry: MountRegistry,
    private readonly studio: StudioPersistencePort,
  ) {}

  registerHandler(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async rebuild(spaceId: string): Promise<void> {
    void spaceId;
  }

  async resolveCapabilityAcl(ctx: TokenContext): Promise<string[] | undefined> {
    if (ctx.capability_acl) return ctx.capability_acl;
    if (ctx.space_id === "bootstrap") return undefined;
    const grants = await this.studio.listGrants(bareSpaceId(ctx.space_id));
    const match = grants.find(
      (g) =>
        g.status === "active" &&
        g.actor_id === ctx.actor_id &&
        (g.harness ?? undefined) === (ctx.harness_id ?? undefined),
    );
    return match?.capability_acl;
  }

  async listForToken(ctx: TokenContext): Promise<ToolDef[]> {
    const acl = await this.resolveCapabilityAcl(ctx);
    const bareSpace = ctx.space_id === "bootstrap" ? "" : bareSpaceId(ctx.space_id);
    const out: ToolDef[] = [];

    for (const tool of PLATFORM_TOOLS) {
      if (this.hasScope(ctx, tool.required_scope) && this.harnessOk(ctx, tool.harness_allow)) {
        out.push({
          name: tool.name,
          description: tool.description,
          required_scope: tool.required_scope,
          harness_allow: tool.harness_allow,
        });
      }
    }

    for (const mount of this.mountRegistry.listAll()) {
      if (bareSpace && bareSpaceId(mount.space_id) !== bareSpace) continue;
      if (acl && !acl.includes(mount.package_id)) continue;
      for (const name of mount.mcp_tools) {
        out.push({
          name,
          package_id: mount.package_id,
          required_scope: "state:transition",
        });
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

  private hasScope(ctx: TokenContext, scope: string): boolean {
    if (ctx.space_id === "bootstrap") return true;
    return ctx.scopes.includes(scope) || ctx.scopes.includes("space:admin");
  }

  private harnessOk(ctx: TokenContext, harnessAllow?: string[]): boolean {
    if (!harnessAllow || harnessAllow.length === 0) return true;
    if (!ctx.harness_id) return false;
    return harnessAllow.includes(ctx.harness_id);
  }
}
