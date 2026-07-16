import type { HandlerSpec } from "@murrmure/contracts";
import { parseHandlerStepBinding } from "@murrmure/contracts";

export type HandlerBindingValidation =
  | { ok: true }
  | { ok: false; code: string; message: string; handler_id?: string };

/** Post-apply flow descriptor for alias resolution. */
export interface BindingFlow {
  /** Readable flow name — the `{flow_name}` prefix of `on::key` aliases. */
  name: string;
  /** Canonical step ids offered by the flow. */
  step_ids: string[];
}

/** Candidate View descriptor for `view_resolver.view` resolution. */
export interface BindingView {
  view_id: string;
  build?: { dist_present: boolean; entry_present: boolean };
}

export interface ValidateHandlerBindingsInput {
  handlers: HandlerSpec[];
  flows: BindingFlow[];
  views: BindingView[];
}

function buildAliasIndex(flows: BindingFlow[]): {
  aliases: Map<string, { flow_name: string; step_id: string }>;
  duplicateFlowNames: string[];
} {
  const seenFlowNames = new Map<string, number>();
  for (const flow of flows) {
    seenFlowNames.set(flow.name, (seenFlowNames.get(flow.name) ?? 0) + 1);
  }
  const duplicateFlowNames = [...seenFlowNames.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  const aliases = new Map<string, { flow_name: string; step_id: string }>();
  for (const flow of flows) {
    for (const stepId of flow.step_ids) {
      aliases.set(`${flow.name}.${stepId}`, { flow_name: flow.name, step_id: stepId });
    }
  }
  return { aliases, duplicateFlowNames };
}

function buildViewIndex(views: BindingView[]): Map<string, BindingView> {
  const index = new Map<string, BindingView>();
  for (const view of views) {
    index.set(view.view_id, view);
  }
  return index;
}

/**
 * Validate handler bindings against the post-apply flow + View index before the
 * applied index is replaced. This is the atomic pre-commit gate:
 *
 * - duplicate flow names fail (aliases would be ambiguous);
 * - `step.(opened|resolved)::{alias}` must resolve to a candidate step
 *   (stale/orphan aliases hard-fail and never continue targeting a prior name);
 * - at most one `step.opened` resolver may bind a canonical step (zero valid);
 * - `view_resolver` must bind `step.opened` and reference a built candidate View
 *   (`VIEW_RESOLVER_VIEW_NOT_FOUND` / `VIEW_RESOLVER_BUILD_MISSING`).
 *
 * `flows` and `views` are the post-apply sets (local + bound + preserved), so
 * partial applies that reference already-applied flows/views still resolve. On
 * failure the caller must not replace the previous applied index.
 */
export function validateHandlerBindings(input: ValidateHandlerBindingsInput): HandlerBindingValidation {
  const handlers = input.handlers;
  if (handlers.length === 0) return { ok: true };

  const { aliases, duplicateFlowNames } = buildAliasIndex(input.flows);
  if (duplicateFlowNames.length > 0) {
    return {
      ok: false,
      code: "DUPLICATE_FLOW_NAME",
      message: `Duplicate flow name(s) make handler aliases ambiguous: ${duplicateFlowNames.join(", ")}`,
    };
  }

  const views = buildViewIndex(input.views);
  const openedResolversByAlias = new Map<string, HandlerSpec>();

  for (const handler of handlers) {
    const binding = parseHandlerStepBinding(handler.on);
    if (!binding) continue; // event handler — not a step binding

    if (!aliases.has(binding.alias)) {
      return {
        ok: false,
        code: "HANDLER_ORPHAN_ALIAS",
        handler_id: handler.id,
        message: `Handler '${handler.id}' references unknown or stale step alias '${binding.alias}'`,
      };
    }

    if (binding.lifecycle === "opened") {
      const prior = openedResolversByAlias.get(binding.alias);
      if (prior) {
        return {
          ok: false,
          code: "HANDLER_RESOLVER_CONFLICT",
          handler_id: handler.id,
          message: `Step '${binding.alias}' already has a step.opened resolver '${prior.id}'; at most one resolver may bind a canonical step`,
        };
      }
      openedResolversByAlias.set(binding.alias, handler);
    }

    if (handler.type === "view_resolver") {
      if (binding.lifecycle !== "opened") {
        return {
          ok: false,
          code: "VIEW_RESOLVER_NOT_OPENED",
          handler_id: handler.id,
          message: `view_resolver '${handler.id}' must bind step.opened (got step.resolved)`,
        };
      }
      const view = views.get(handler.view);
      if (!view) {
        return {
          ok: false,
          code: "VIEW_RESOLVER_VIEW_NOT_FOUND",
          handler_id: handler.id,
          message: `view_resolver '${handler.id}' references unknown view '${handler.view}'`,
        };
      }
      const build = view.build;
      if (!build || !build.dist_present || !build.entry_present) {
        return {
          ok: false,
          code: "VIEW_RESOLVER_BUILD_MISSING",
          handler_id: handler.id,
          message: `view_resolver '${handler.id}' references view '${handler.view}' whose built entry is missing — run npm run build before apply`,
        };
      }
    }
  }

  return { ok: true };
}
