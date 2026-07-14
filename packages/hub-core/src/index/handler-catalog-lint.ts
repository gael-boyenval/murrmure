import type { FlowManifest, HandlerSpec, HandlersFile } from "@murrmure/contracts";
import { parseHandlerStepBinding } from "@murrmure/contracts";
import { compileStepContractCatalog } from "../flow-engine/step-contract-compile.js";
import { buildHandlerIndex } from "./parse-handlers.js";

export interface HandlerCatalogLintWarning {
  code:
    | "HANDLER_ORPHAN_KEY"
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
  has_nested: boolean;
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
      map.set(`${flowRef}.${entry.step_id}`, {
        flow_id: flow.flow_id,
        step_id: entry.step_id,
        has_nested: parentWithChildren.has(entry.step_id),
      });
    }
  }
  return map;
}

function isOpenedStepHandler(handler: HandlerSpec): boolean {
  const binding = parseHandlerStepBinding(handler.on);
  return binding?.lifecycle === "opened";
}

export function lintHandlerCatalogCoverage(input: {
  handlers: HandlersFile;
  flows: Array<{ flow_id: string; manifest: FlowManifest }>;
}): HandlerCatalogLintWarning[] {
  const warnings: HandlerCatalogLintWarning[] = [];
  const known = collectCatalogKeys(input.flows);
  buildHandlerIndex(input.handlers); // exercise index construction for parity

  for (const handler of input.handlers.handlers) {
    // `contract_keys` is prompt scope only: each entry must be a known catalog
    // alias (`{flow_name}.{qualified_step_id}`). Unknown keys are orphan scope.
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
      handler.type !== "view_resolver" &&
      isOpenedStepHandler(handler) &&
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

    if (
      handler.type !== "view_resolver" &&
      isOpenedStepHandler(handler) &&
      handler.complete === "auto"
    ) {
      const binding = parseHandlerStepBinding(handler.on);
      const alias = binding?.alias;
      if (alias) {
        const meta = known.get(alias);
        if (meta?.has_nested) {
          warnings.push({
            code: "HANDLER_COMPLETE_AUTO_NESTED",
            contract_key: alias,
            handler_id: handler.id,
            flow_id: meta.flow_id,
            step_id: meta.step_id,
            message:
              `Handler '${handler.id}' uses complete=auto for nested step '${meta.step_id}' (${alias})`,
          });
        }
      }
    }
  }

  return warnings;
}
