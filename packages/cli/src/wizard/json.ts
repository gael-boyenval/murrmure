export type WizardStepId =
  | "connect"
  | "spaces"
  | "init"
  | "link"
  | "apply"
  | "skill"
  | "connection"
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
  { id: "spaces", command: "mrmr space create", description: "Confirm name and slug; create one space" },
  { id: "init", command: "mrmr space init", description: "Scaffold the empty .mrmr/ tree" },
  { id: "link", command: "mrmr space link --path . --space <id>", description: "Register local path binding" },
  { id: "apply", command: "mrmr space apply", description: "Index local flows to hub" },
  { id: "skill", command: "mrmr skill install", description: "Optionally install Murrmure skills" },
  {
    id: "connection",
    command: "mrmr connection create",
    description: "Optionally connect selected local tools with one least-privilege connection",
  },
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

