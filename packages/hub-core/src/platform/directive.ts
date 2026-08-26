import type { FlowIndexEntry, FlowManifest, HandlerSpec } from "@murrmure/contracts";
import { parseHandlerStepBinding } from "@murrmure/contracts";
import { compileFlowIr } from "../flow-engine/compile.js";
import { compileStepContractCatalog } from "../flow-engine/step-contract-compile.js";
import { computeContentDigest } from "../index/digest.js";

export const DIRECTIVE_FLOW_ID = "flw_mrmr_directive";
export const DIRECTIVE_FLOW_NAME = "directive";
export const DIRECTIVE_STEP_ID = "execute";
export const DIRECTIVE_STEP_ALIAS = `${DIRECTIVE_FLOW_NAME}.${DIRECTIVE_STEP_ID}`;
export const DIRECTIVE_ORIGIN_SPACE_ID = "spc_mrmr_platform";

const MESSAGE_SCHEMA = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const DIRECTIVE_FLOW_MANIFEST: FlowManifest = {
  apiVersion: "murrmure.flow/v1",
  name: DIRECTIVE_FLOW_NAME,
  description: "Operator directive — run a prompt in this space and report completed or failed.",
  triggers: { manual: true },
  steps: [
    {
      id: DIRECTIVE_STEP_ID,
      description: "Execute the operator prompt and resolve with a message.",
      branches: {
        completed: {
          schema: MESSAGE_SCHEMA,
          route: { run: "completed" },
        },
        failed: {
          schema: MESSAGE_SCHEMA,
          route: { run: "failed" },
        },
      },
    },
  ],
};

export function handlerBindsDirective(handler: HandlerSpec): boolean {
  const binding = parseHandlerStepBinding(handler.on);
  return binding?.lifecycle === "opened" && binding.alias === DIRECTIVE_STEP_ALIAS;
}

export function handlersBindDirective(handlers: HandlerSpec[] | undefined): boolean {
  return Boolean(handlers?.some(handlerBindsDirective));
}

export function buildDirectiveFlowEntry(): FlowIndexEntry {
  const ir = compileFlowIr(DIRECTIVE_FLOW_MANIFEST, DIRECTIVE_FLOW_ID);
  const { catalog } = compileStepContractCatalog(DIRECTIVE_FLOW_MANIFEST, DIRECTIVE_FLOW_ID);
  return {
    flow_id: DIRECTIVE_FLOW_ID,
    origin_space_id: DIRECTIVE_ORIGIN_SPACE_ID,
    digest: computeContentDigest(DIRECTIVE_FLOW_MANIFEST),
    name: DIRECTIVE_FLOW_NAME,
    triggers: DIRECTIVE_FLOW_MANIFEST.triggers,
    step_spaces: [],
    grants_required: [],
    ir,
    step_contract_catalog: catalog ?? undefined,
  };
}

/** Index the platform flow only when a space binds `step.opened::directive.execute`. */
export function mergePlatformFlows(
  flows: FlowIndexEntry[],
  handlers: HandlerSpec[] | undefined,
): FlowIndexEntry[] {
  if (!handlersBindDirective(handlers)) return flows;
  if (
    flows.some(
      (flow) => flow.flow_id === DIRECTIVE_FLOW_ID || flow.name === DIRECTIVE_FLOW_NAME,
    )
  ) {
    return flows;
  }
  return [...flows, buildDirectiveFlowEntry()];
}

export function flowsIncludingPlatformForHandlers<T extends { flow_id: string; manifest: FlowManifest }>(
  flows: T[],
  handlers: HandlerSpec[] | undefined,
): Array<T | { flow_id: string; manifest: FlowManifest }> {
  if (!handlersBindDirective(handlers)) return flows;
  if (
    flows.some(
      (flow) => flow.flow_id === DIRECTIVE_FLOW_ID || flow.manifest.name === DIRECTIVE_FLOW_NAME,
    )
  ) {
    return flows;
  }
  return [...flows, { flow_id: DIRECTIVE_FLOW_ID, manifest: DIRECTIVE_FLOW_MANIFEST }];
}
