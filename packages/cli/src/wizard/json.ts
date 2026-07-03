export type WizardStepId =
  | "connect"
  | "spaces"
  | "init"
  | "link"
  | "apply"
  | "skill"
  | "grant"
  | "status"
  | "doctor";

export interface WizardStepPlan {
  id: WizardStepId;
  command?: string;
  description: string;
}

export interface WizardStepResult {
  id: WizardStepId;
  ok: boolean;
  skipped?: boolean;
  detail?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface WizardRunResult {
  ok: boolean;
  project_path: string;
  space_id?: string;
  steps: WizardStepResult[];
  mcp_snippet?: string;
  desktop_handoff?: {
    hub_url: string;
    space_id: string;
    flow_id?: string;
  };
}

export const SETUP_STEP_PLAN: WizardStepPlan[] = [
  { id: "connect", command: "mrmr login", description: "Connect hub URL and bearer token" },
  { id: "spaces", command: "mrmr space create", description: "Create or select hub space" },
  { id: "init", command: "mrmr space init --with-skill", description: "Scaffold murrmure/ and install skill" },
  { id: "link", command: "mrmr space link --path . --space <id>", description: "Register local path binding" },
  { id: "apply", command: "mrmr space apply", description: "Index local flows to hub" },
  { id: "skill", command: "mrmr skill install", description: "Install murrmure Cursor skill (if skipped in init)" },
  { id: "grant", command: "mrmr grant mint --capabilities …", description: "Mint agent grant + MCP snippet" },
];

export const ONBOARD_STEP_PLAN: WizardStepPlan[] = [
  { id: "link", command: "mrmr space link --path . --create", description: "Link existing murrmure/ to hub space" },
  { id: "apply", command: "mrmr space apply", description: "Index local flows to hub" },
  { id: "status", command: "mrmr space status", description: "Show indexed counts and digests" },
];

export function buildSetupJsonPlan(options?: { yes?: boolean }): {
  wizard: "setup";
  interactive: boolean;
  steps: WizardStepPlan[];
} {
  return {
    wizard: "setup",
    interactive: !options?.yes,
    steps: SETUP_STEP_PLAN,
  };
}

export function buildOnboardJsonPlan(options?: { yes?: boolean }): {
  wizard: "onboard";
  interactive: boolean;
  steps: WizardStepPlan[];
} {
  return {
    wizard: "onboard",
    interactive: !options?.yes,
    steps: ONBOARD_STEP_PLAN,
  };
}
