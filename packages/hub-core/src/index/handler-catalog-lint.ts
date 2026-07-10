import type { FlowManifest, HandlerSpec, HandlersFile } from "@murrmure/contracts";
import { compileStepContractCatalog } from "../flow-engine/step-contract-compile.js";
import { buildHandlerIndex } from "./parse-handlers.js";

export interface HandlerCatalogLintWarning {
  code:
    | "HANDLER_ORPHAN_KEY"
    | "HANDLER_MISSING"
    | "STEP_UNCOVERED"
    | "HANDLER_KEY_CONFLICT"
    | "HANDLER_COMPLETE_CLI_NO_RESOLVE"
    | "HANDLER_COMPLETE_AUTO_NESTED";
  message: string;
  handler_id?: string;
  contract_key: string;
  flow_id?: string;
  step_id?: string;
}

interface CatalogKeyMeta {
  flow_id: string;
  step_id: string;
  role: "agent" | "human" | "system";
  has_nested: boolean;
}

function keyFromFlowRef(flow_ref: string, step_id: string): string {
  return `${flow_ref}.${step_id}`;
}

function collectCatalogKeys(
  flows: Array<{ flow_id: string; manifest: FlowManifest }>,
): Map<string, CatalogKeyMeta> {
  const map = new Map<string, CatalogKeyMeta>();
  for (const flow of flows) {
    const { catalog } = compileStepContractCatalog(flow.manifest, flow.flow_id);
    if (!catalog) continue;
    const flowRef = flow.manifest.name;
    const parentWithChildren = new Set(
      catalog.entries
        .map((entry) => entry.parent_id)
        .filter((parentId): parentId is string => typeof parentId === "string" && parentId.length > 0),
    );
    for (const entry of catalog.entries) {
      map.set(keyFromFlowRef(flowRef, entry.step_id), {
        flow_id: flow.flow_id,
        step_id: entry.step_id,
        role: entry.role,
        has_nested: parentWithChildren.has(entry.step_id),
      });
    }
  }
  return map;
}

function stepOpenedContractKeys(handler: HandlerSpec): string[] {
  if (handler.on !== "step.opened") return [];
  return handler.contract_keys ?? [];
}

export function lintHandlerCatalogCoverage(input: {
  handlers: HandlersFile;
  flows: Array<{ flow_id: string; manifest: FlowManifest }>;
}): HandlerCatalogLintWarning[] {
  const warnings: HandlerCatalogLintWarning[] = [];
  const known = collectCatalogKeys(input.flows);
  const index = buildHandlerIndex(input.handlers);

  for (const handler of input.handlers.handlers) {
    for (const key of handler.contract_keys ?? []) {
      if (known.has(key)) continue;
      warnings.push({
        code: "HANDLER_ORPHAN_KEY",
        contract_key: key,
        handler_id: handler.id,
        message: `Handler '${handler.id}' references unknown contract key '${key}'`,
      });
    }

    if (
      handler.on === "step.opened" &&
      handler.complete === "cli" &&
      (typeof handler.command !== "string" ||
        !/\bmrmr\s+step\s+resolve\b/.test(handler.command))
    ) {
      warnings.push({
        code: "HANDLER_COMPLETE_CLI_NO_RESOLVE",
        contract_key: (handler.contract_keys ?? [handler.id])[0] ?? handler.id,
        handler_id: handler.id,
        message:
          `Handler '${handler.id}' uses complete=cli but command does not call 'mrmr step resolve'`,
      });
    }

    if (handler.on === "step.opened" && handler.complete === "auto") {
      for (const key of handler.contract_keys ?? []) {
        const meta = known.get(key);
        if (!meta?.has_nested) continue;
        warnings.push({
          code: "HANDLER_COMPLETE_AUTO_NESTED",
          contract_key: key,
          handler_id: handler.id,
          flow_id: meta.flow_id,
          step_id: meta.step_id,
          message:
            `Handler '${handler.id}' uses complete=auto for nested step '${meta.step_id}' (${key})`,
        });
      }
    }
  }

  for (const [contract_key, meta] of known.entries()) {
    if (meta.role !== "agent") continue;
    const matches = index.step_opened_by_key[contract_key] ?? [];
    if (matches.length === 0) {
      warnings.push({
        code: "HANDLER_MISSING",
        contract_key,
        flow_id: meta.flow_id,
        step_id: meta.step_id,
        message: `Agent step '${meta.step_id}' has no step.opened handler for '${contract_key}'`,
      });
      continue;
    }
    if (matches.length > 1) {
      warnings.push({
        code: "HANDLER_KEY_CONFLICT",
        contract_key,
        flow_id: meta.flow_id,
        step_id: meta.step_id,
        message: `Contract key '${contract_key}' matches multiple step.opened handlers (${matches.map((h) => h.id).join(", ")})`,
      });
    }
  }

  return warnings;
}
