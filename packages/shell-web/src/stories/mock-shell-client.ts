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
      version: 2,
      space_id: "spc_demo",
      needs_attention: [],
      active_runs: [],
      flows: [],
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
    runs: async () => ({ space_id: "spc_demo", runs: [] }),
    flowPreview: async () => ({
      version: 2,
      flow_id: "flw_demo",
      origin_space_id: "spc_demo",
      name: "Demo flow",
      digest: "sha256:demo",
      can_run: true,
      manual: true,
      triggers: { manual: true },
      graph: {
        run_id: "preview:flw_demo",
        flow_id: "flw_demo",
        flow_digest: "sha256:demo",
        mode: "preview",
        nodes: [],
        edges: [],
        lanes: [],
        step_memos: [],
      },
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
    resolveStep: async (_runId, stepId, body) => ({
      ok: true,
      run_id: "run_demo",
      step_id: stepId,
      branch: body.branch,
      status: "completed",
    }),
    openChild: async (runId, parentStepId, body) => ({
      ok: true,
      run_id: runId,
      parent_step_id: parentStepId,
      child_step_id: body.child_step_id,
      iteration: 1,
      deduplicated: false,
    }),
    createUploadIntent: async (_runId, _stepId, body) => ({
      ok: true,
      intent_id: "upi_demo",
      expires_in_ms: 3_600_000,
      files: body.files.map((file, index) => ({ index, size_bytes: file.size_bytes })),
    }),
    uploadIntentFile: async (_intentId, _index, file, options) => {
      options?.onProgress?.(file.size, file.size);
      return { received_bytes: file.size };
    },
    cancelUploadIntent: async () => {},
    retry: async () => ({ run: { run_id: "run_retry" } }),
    cancel: async () => ({ run: { run_id: "run_demo", lifecycle: "cancelled" } }),
  },
  };
}

/** Default mock client — pending_count always matches prototype notification list length. */
export const mockShellClient = createMockShellClient();
