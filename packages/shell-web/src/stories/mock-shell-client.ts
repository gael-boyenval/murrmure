import type { ShellClient } from "@murrmure/shell-client";
import { notifications as prototypeNotifications } from "./prototype-data.js";

export function createMockShellClient(
  notificationItems: typeof prototypeNotifications = prototypeNotifications,
): ShellClient {
  return {
  spaces: {
    list: async () => [
      { space_id: "spc_demo", name: "Demo space", slug: "demo" },
      { space_id: "spc_ops", name: "Ops", slug: "ops" },
    ],
    home: async () => ({
      space_id: "spc_demo",
      needs_attention: [],
      active_runs: [],
      your_flows: [],
      available_to_run: [],
      receiving_from: [],
      recent_completed: [],
      index: {
        counts: { actions: 0, executors: 0, hooks: 0, events: 0, flows: 0, declared_events: 0 },
        actions: [],
        hooks: [],
        events: [],
      },
      emittable_events: [],
    }),
    flowPreview: async () => ({
      flow_id: "flw_demo",
      name: "Demo flow",
      digest: "sha256:demo",
      start: {},
      steps: [],
    }),
    runFlow: async () => ({
      session: { session_id: "ses_demo", title: "Demo session" },
      run_id: "run_demo",
      flow_digest: "sha256:demo",
    }),
  },
  me: {
    get: async () => ({
      actor_id: "usr_demo",
      landing_space_id: "spc_demo",
      notify_email: true,
      notify_desktop: true,
    }),
    patch: async (body) => ({
      actor_id: "usr_demo",
      landing_space_id: body.landing_space_id ?? "spc_demo",
      notify_email: body.notify_email ?? true,
      notify_desktop: body.notify_desktop ?? true,
    }),
  },
  notifications: {
    list: async () => ({
      notifications: notificationItems,
      pending_count: notificationItems.length,
    }),
    dismiss: async () => {},
  },
  gates: {
    listForRun: async () => [],
    resolve: async (gate_id) => ({
      gate_id,
      run_id: "run_demo",
      session_id: "ses_demo",
      step_id: "gate:review",
      status: "resolved",
    }),
  },
  dev: {
    viewSession: async () => ({
      session: {
        view_id: "preview-review",
        dev_url: "http://localhost:5173/",
        fixtures: [{ name: "gate-round-1" }],
        started_at: new Date().toISOString(),
      },
    }),
    viewFixture: async () => ({
      context: {
        flow_id: "flw_demo",
        space_id: "spc_demo",
        hub_base_url: "http://127.0.0.1:8787",
        token: "dev",
        gate: { gate_id: "gte_dev", step_id: "review" },
      },
    }),
  },
  journal: {
    subscribe: () => () => {},
    query: async () => [],
  },
  auth: {
    mintSseTicket: async () => ({ ticket: "demo-ticket", expires_in: 3600 }),
  },
  sessions: {
    get: async () => ({ session_id: "ses_demo", title: "Demo", status: "active" }),
    listRuns: async () => ({ runs: [] }),
  },
  runs: {
    get: async () => ({
      run_id: "run_demo",
      session_id: "ses_demo",
      lifecycle: "working",
      journal_replay: [{ step_id: "plan", status: "completed" }],
    }),
    graph: async () => ({
      run_id: "run_demo",
      nodes: [],
      edges: [],
      lanes: [],
      step_memos: [],
    }),
    retry: async () => ({ run: { run_id: "run_retry" } }),
    cancel: async () => ({ run: { run_id: "run_demo", lifecycle: "cancelled" } }),
  },
  };
}

/** Default mock client — pending_count always matches prototype notification list length. */
export const mockShellClient = createMockShellClient();
