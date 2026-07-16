import { describe, expect, test } from "vitest";
import { addTokenId } from "@murrmure/hub-core";
import { createTemporaryHub } from "../../../../../test-utils/tutorial-v3/helpers.js";

const INTAKE_FLOW = {
  apiVersion: "murrmure.flow/v1",
  name: "my-dev-flow",
  description: "Intake flow",
  triggers: { manual: true },
  steps: [
    {
      id: "intake",
      description: "Human attaches one spec markdown file.",
      branches: {
        continue: { schema: { type: "object", required: ["spec"] }, route: { run: "completed" } },
        cancel: { schema: { type: "object" }, route: { run: "failed" } },
      },
    },
  ],
};

function builtView(viewId = "intake") {
  return {
    view_id: viewId,
    rel_path: `views/${viewId}`,
    digest: `sha256:${viewId}`,
    manifest: { apiVersion: "murrmure.view/v1", id: viewId, entry: "./dist/index.html", shell_route: "murrmure/intake" },
    build: { dist_present: true, entry_present: true },
  };
}

function viewResolverBundle(overrides: {
  viewId?: string;
  view?: ReturnType<typeof builtView> | null;
  handlerView?: string;
} = {}) {
  const view = overrides.view === null ? undefined : overrides.view ?? builtView(overrides.viewId);
  return {
    actions: { digest: "sha256:vr-actions", file: { version: 1, actions: { hello: { executor: "shell" } } } },
    hooks: { digest: "sha256:vr-hooks", file: { version: 1, hooks: {} } },
    flows: [
      {
        flow_id: "flw_my_dev_flow",
        rel_path: "flows/my-dev-flow/flow.manifest.yaml",
        digest: "sha256:vr-flow",
        manifest: INTAKE_FLOW,
        raw: INTAKE_FLOW,
      },
    ],
    views: view ? [view] : [],
    handlers: {
      digest: "sha256:vr-handlers",
      file: {
        version: 1,
        handlers: [
          {
            id: "intake-view",
            on: "step.opened::my-dev-flow.intake",
            type: "view_resolver",
            view: overrides.handlerView ?? overrides.viewId ?? "intake",
            contract_keys: [],
          },
        ],
      },
    },
  };
}

describe("http/spaces/apply-view-resolver", () => {
  test("strict-apply binds a built view_resolver and projects it on the open step", async () => {
    const hub = await createTemporaryHub();
    try {
      const auth = {
        Authorization: `Bearer ${addTokenId(hub.bootstrapToken)}`,
        "Content-Type": "application/json",
      };

      const created = await fetch(`${hub.baseUrl}/v1/spaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ slug: "intake-space", name: "Intake Space" }),
      });
      const spaceId = ((await created.json()) as { space_id: string }).space_id;

      const applied = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/apply`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle: viewResolverBundle() }),
      });
      expect(applied.status).toBe(200);
      const appliedBody = (await applied.json()) as { summary: { views: number; hooks: number } };
      expect(appliedBody.summary.views).toBe(1);
      expect(appliedBody.summary.hooks).toBe(1);

      const grantRes = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/grants`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ label: "resolver", capabilities: ["space:read", "flow:run", "step:resolve"] }),
      });
      const resolveToken = ((await grantRes.json()) as { token: string }).token;
      const resolverAuth = {
        Authorization: `Bearer ${resolveToken}`,
        "Content-Type": "application/json",
      };

      const started = await fetch(`${hub.baseUrl}/v1/flows/flw_my_dev_flow/run`, {
        method: "POST",
        headers: resolverAuth,
        body: JSON.stringify({ space_id: spaceId, input: {} }),
      });
      expect(started.status).toBe(201);
      const runId = ((await started.json()) as { run_id: string }).run_id;

      const detail = (await (
        await fetch(`${hub.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: resolverAuth })
      ).json()) as {
        open_steps?: Array<{
          step_id: string;
          resolver: { handler_id: string; type: string; view_id?: string } | null;
          view?: { view_id: string; origin_space_id: string; entry?: string; shell_route?: string };
        }>;
      };
      expect(detail.open_steps).toHaveLength(1);
      expect(detail.open_steps?.[0]?.step_id).toBe("intake");
      expect(detail.open_steps?.[0]?.resolver).toEqual({
        handler_id: "intake-view",
        type: "view_resolver",
        view_id: "intake",
      });
      expect(detail.open_steps?.[0]?.view?.view_id).toBe("intake");
      expect(detail.open_steps?.[0]?.view?.entry).toBe("./dist/index.html");
      // Sanitized: no command/prompt/secret on the resolver descriptor.
      const resolver = detail.open_steps?.[0]?.resolver as Record<string, unknown> | null;
      expect(resolver).not.toHaveProperty("command");
      expect(resolver).not.toHaveProperty("prompt");
    } finally {
      await hub.stop();
    }
  });

  test("missing view reference fails apply with VIEW_RESOLVER_VIEW_NOT_FOUND and preserves prior index", async () => {
    const hub = await createTemporaryHub();
    try {
      const auth = {
        Authorization: `Bearer ${addTokenId(hub.bootstrapToken)}`,
        "Content-Type": "application/json",
      };
      const created = await fetch(`${hub.baseUrl}/v1/spaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ slug: "intake-space-missing", name: "Intake Space Missing" }),
      });
      const spaceId = ((await created.json()) as { space_id: string }).space_id;

      const ok = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/apply`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle: viewResolverBundle() }),
      });
      expect(ok.status).toBe(200);

      // Reference a view that does not exist in the candidate index.
      const bad = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/apply`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle: viewResolverBundle({ handlerView: "ghost" }) }),
      });
      expect(bad.status).toBe(400);
      const badBody = (await bad.json()) as { code: string };
      expect(badBody.code).toBe("VIEW_RESOLVER_VIEW_NOT_FOUND");

      // Prior index preserved: the previously applied action is still present.
      const actions = await (
        await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/actions`, { headers: auth })
      ).json() as { actions: Array<{ name: string }> };
      expect(actions.actions.map((a) => a.name)).toContain("hello");
    } finally {
      await hub.stop();
    }
  });

  test("unbuilt view fails apply with VIEW_RESOLVER_BUILD_MISSING", async () => {
    const hub = await createTemporaryHub();
    try {
      const auth = {
        Authorization: `Bearer ${addTokenId(hub.bootstrapToken)}`,
        "Content-Type": "application/json",
      };
      const created = await fetch(`${hub.baseUrl}/v1/spaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ slug: "intake-space-unbuilt", name: "Intake Space Unbuilt" }),
      });
      const spaceId = ((await created.json()) as { space_id: string }).space_id;

      const unbuilt = {
        view_id: "intake",
        rel_path: "views/intake",
        digest: "sha256:unbuilt",
        manifest: { apiVersion: "murrmure.view/v1", id: "intake", entry: "./dist/index.html" },
        build: { dist_present: false, entry_present: false },
      };
      const res = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/apply`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle: viewResolverBundle({ view: unbuilt }) }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VIEW_RESOLVER_BUILD_MISSING");
    } finally {
      await hub.stop();
    }
  });

  test("unbound step projects resolver null (no fallback form synthesized)", async () => {
    const hub = await createTemporaryHub();
    try {
      const auth = {
        Authorization: `Bearer ${addTokenId(hub.bootstrapToken)}`,
        "Content-Type": "application/json",
      };
      const created = await fetch(`${hub.baseUrl}/v1/spaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ slug: "intake-space-unbound", name: "Intake Space Unbound" }),
      });
      const spaceId = ((await created.json()) as { space_id: string }).space_id;

      // Same flow, no handler → unbound intake step.
      const unboundBundle = {
        ...viewResolverBundle(),
        handlers: { digest: "sha256:none", file: { version: 1, handlers: [] } },
      };
      const applied = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/apply`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle: unboundBundle }),
      });
      expect(applied.status).toBe(200);

      const grantRes = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/grants`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ label: "resolver", capabilities: ["space:read", "flow:run", "step:resolve"] }),
      });
      const resolveToken = ((await grantRes.json()) as { token: string }).token;
      const resolverAuth = {
        Authorization: `Bearer ${resolveToken}`,
        "Content-Type": "application/json",
      };

      const started = await fetch(`${hub.baseUrl}/v1/flows/flw_my_dev_flow/run`, {
        method: "POST",
        headers: resolverAuth,
        body: JSON.stringify({ space_id: spaceId, input: {} }),
      });
      const runId = ((await started.json()) as { run_id: string }).run_id;

      const detail = (await (
        await fetch(`${hub.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: resolverAuth })
      ).json()) as {
        open_steps?: Array<{ step_id: string; resolver: unknown; view?: unknown }>;
      };
      expect(detail.open_steps?.[0]?.resolver).toBeNull();
      expect(detail.open_steps?.[0]?.view).toBeUndefined();
    } finally {
      await hub.stop();
    }
  });
});
