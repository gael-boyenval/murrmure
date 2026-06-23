#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPLACEMENTS = [
  ["LegacyCapabilityManifestSchema", "LegacyFlowManifestSchema"],
  ["LegacyCapabilityManifest", "LegacyFlowManifest"],
  ["CapabilityManifestSchema", "FlowManifestSchema"],
  ["CapabilityManifest", "FlowManifest"],
  ["CapabilityHostContextPublic", "FlowHostContextPublic"],
  ["CapabilityHostContext", "FlowHostContext"],
  ["CapabilityServerContext", "FlowServerContext"],
  ["CreateCapabilityMountOptions", "CreateFlowMountOptions"],
  ["createCapabilityMount", "createFlowMount"],
  ["CapabilityErrorBoundaryProps", "FlowErrorBoundaryProps"],
  ["CapabilityErrorBoundary", "FlowErrorBoundary"],
  ["CapabilityErrorStateProps", "FlowErrorStateProps"],
  ["CapabilityErrorState", "FlowErrorState"],
  ["CapabilityRuntimeContextValue", "FlowRuntimeContextValue"],
  ["CapabilityProviderProps", "FlowProviderProps"],
  ["CapabilityProvider", "FlowProvider"],
  ["useCapabilityContextPublic", "useFlowContextPublic"],
  ["useCapabilityContext", "useFlowContext"],
  ["useCapabilityRuntime", "useFlowRuntime"],
  ["validateCapabilityRoot", "validateFlowRoot"],
  ["buildCapabilityRoot", "buildFlowRoot"],
  ["pushCapability", "pushFlow"],
  ["InitCapabilityOptions", "InitFlowOptions"],
  ["initCapability", "initFlow"],
  ["devCapabilityLoop", "devFlowLoop"],
  ["installStudioSkill", "installMurrmureSkill"],
  ["runSkillCli", "runMurrmureSkillCli"],
  ["studioCapabilitiesRoot", "murrmureFlowsRoot"],
  ["DevSimCapabilityMount", "DevSimFlowMount"],
  ["capability-mount", "flow-mount"],
  ["capability.manifest.json", "flow.manifest.json"],
  [".push-state.json", ".flow-push-state.json"],
  ["@studio/capability-dev-kit", "@murrmure/flow-dev-kit"],
  ["@studio/capability-sdk", "@murrmure/cli"],
  ["STUDIO_DEPLOY_TOKEN", "MURRMURE_DEPLOY_TOKEN"],
  ["STUDIO_HUB_TOKEN", "MURRMURE_HUB_TOKEN"],
  ["STUDIO_HUB_URL", "MURRMURE_HUB_URL"],
  ["STUDIO_SPACE_ID", "MURRMURE_SPACE_ID"],
  ["STUDIO_TOKEN", "MURRMURE_TOKEN"],
  ["STUDIO_INSTALL_ID", "MURRMURE_INSTALL_ID"],
  ["STUDIO_PACKAGE_ID", "MURRMURE_FLOW_ID"],
  ["~/.studio/hubs", "~/.murrmure/hubs"],
  ["~/.studio/", "~/.murrmure/"],
  [".studio", ".murrmure"],
  ["/capabilities/", "/flows/"],
  ["capability:install", "flow:install"],
  ["studio-capability", "murrmure-flow"],
  ["studio capability", "mrmr flow"],
  ["studio skill", "mrmr skill"],
  ["usage: studio", "usage: mrmr"],
  ["validate:capability", "validate:flow"],
  ["build:capability", "build:flow"],
  ["dev:capability", "dev:flow"],
  ["studio.capability.yaml", "murrmure.flow.yaml"],
  ["package_id", "flow_id"],
  ["packageId", "flowId"],
  ["package:", "flow:"],
  ["Capability canvas", "Flow canvas"],
  ["Capability failed to render", "Flow failed to render"],
  ["Capability runtime error", "Flow runtime error"],
  ["Retry capability", "Retry flow"],
  ["Capability runtime context", "Flow runtime context"],
  ["capability-sdk", "murrmure-cli"],
  ["capability build assets", "flow build assets"],
  ["capability-sdk", "murrmure-cli"],
  ["sdk_version", "cli_version"],
  ["SDK_VERSION", "CLI_VERSION"],
  ["DEVKIT_SDK_VERSION_MISMATCH", "DEVKIT_CLI_VERSION_MISMATCH"],
  ["DEVKIT_SDK", "DEVKIT_CLI"],
  ["studio-hub-mcp", "murrmure-mcp"],
  ["studio-hub", "murrmure-hub"],
  ["SimulatedStudioMachine", "SimulatedMurrmureMachine"],
  ["simulated-studio-machine", "simulated-murrmure-machine"],
  ["capabilityCanvasFrame", "flowCanvasFrame"],
  ["#capability-canvas", "#flow-canvas"],
  ["CAPABILITY_SIM_PORT", "FLOW_SIM_PORT"],
  ["examples/capabilities", "templates/flows"],
  ["examplesRoot", "templatesRoot"],
  ["../../../examples/capabilities", "../../templates/flows"],
];

function transform(content) {
  let out = content;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

function walk(dir, exts) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(path, exts);
      continue;
    }
    if (!exts.some((ext) => name.endsWith(ext))) continue;
    writeFileSync(path, transform(readFileSync(path, "utf-8")));
  }
}

for (const target of process.argv.slice(2)) {
  walk(target, [".ts", ".tsx", ".md", ".json", ".yaml", ".html", ".mjs"]);
  console.log("transformed", target);
}
