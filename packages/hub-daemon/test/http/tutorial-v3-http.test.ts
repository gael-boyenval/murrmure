import { describe, expect, test } from "vitest";
import { addTokenId } from "@murrmure/hub-core";
import { createTemporaryHub } from "../../../../test-utils/tutorial-v3/helpers.js";

const PART_2_MANIFEST = {
  apiVersion: "murrmure.flow/v1",
  name: "my-dev-flow",
  description: "My first dev workflow",
  triggers: { manual: true },
  steps: [
    {
      id: "intake",
      description: "Human attaches one spec markdown file.",
      branches: {
        continue: {
          schema: { type: "object", required: ["spec"] },
          artifact_slots: {
            spec: {
              description: "The spec markdown file",
              media_types: ["text/markdown", "text/plain"],
              extensions: [".md", ".markdown", ".txt"],
              min_bytes: 1,
              max_bytes: 1048576,
            },
          },
          route: { run: "completed" },
        },
        cancel: { schema: { type: "object" }, route: { run: "failed" } },
      },
    },
  ],
};

function part2Bundle() {
  return {
    actions: { digest: "sha256:t3-actions", file: { version: 1, actions: {} } },
    hooks: { digest: "sha256:t3-hooks", file: { version: 1, hooks: {} } },
    flows: [
      {
        flow_id: "flw_my_dev_flow",
        rel_path: "flows/my-dev-flow/flow.manifest.yaml",
        digest: "sha256:t3-flow",
        manifest: PART_2_MANIFEST,
        raw: PART_2_MANIFEST,
      },
    ],
    views: [],
  };
}

describe("Tutorial v3 HTTP conformance", () => {
  test("Task 00 — temporary Hub roots and ports are isolated", async () => {
    const first = await createTemporaryHub();
    const second = await createTemporaryHub();
    try {
      expect(first.root).not.toBe(second.root);
      expect(first.dataDir).not.toBe(second.dataDir);
      expect(first.baseUrl).not.toBe(second.baseUrl);
    } finally {
      await Promise.all([first.stop(), second.stop()]);
    }
  });

  test("Task 01 — a fresh Hub has zero persisted product objects", async () => {
    const hub = await createTemporaryHub();
    try {
      expect(hub.productCounts()).toEqual({
        spaces: 0,
        contracts: 0,
        installs: 0,
        flows: 0,
      });
    } finally {
      await hub.stop();
    }
  });

  test("Task 03 — start and externally resolve the Part 2 flow", async () => {
    const hub = await createTemporaryHub();
    try {
      const bootstrapAuth = {
        Authorization: `Bearer ${addTokenId(hub.bootstrapToken)}`,
        "Content-Type": "application/json",
      };

      const created = await fetch(`${hub.baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrapAuth,
        body: JSON.stringify({ slug: "my-first-space", name: "My First Space" }),
      });
      const spaceId = ((await created.json()) as { space_id: string }).space_id;

      const applied = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/apply`, {
        method: "POST",
        headers: bootstrapAuth,
        body: JSON.stringify({ bundle: part2Bundle() }),
      });
      expect(applied.status).toBe(200);

      const grantRes = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/grants`, {
        method: "POST",
        headers: bootstrapAuth,
        body: JSON.stringify({
          label: "resolver",
          capabilities: ["space:read", "flow:run", "step:resolve"],
        }),
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

      // Generic open-step projection: intake is open, unbound (resolver: null).
      const detail = (await (
        await fetch(`${hub.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: resolverAuth })
      ).json()) as {
        lifecycle: string;
        open_steps?: Array<{ step_id: string; resolver: string | null; branches: unknown[] }>;
      };
      expect(detail.lifecycle).toBe("working");
      expect(detail.open_steps).toHaveLength(1);
      expect(detail.open_steps?.[0]?.step_id).toBe("intake");
      expect(detail.open_steps?.[0]?.resolver).toBeNull();

      // External protocol resolution of the unbound step (cancel -> run failed).
      const resolveRes = await fetch(
        `${hub.baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/intake/resolve`,
        {
          method: "POST",
          headers: resolverAuth,
          body: JSON.stringify({ branch: "cancel" }),
        },
      );
      expect(resolveRes.status).toBe(200);

      const after = (await (
        await fetch(`${hub.baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: resolverAuth })
      ).json()) as { lifecycle: string; open_steps?: unknown[] };
      expect(after.lifecycle).toBe("failed");
      expect(after.open_steps).toHaveLength(0);

      // Authorization: a token without step:resolve cannot resolve an open step.
      const noResolveGrant = await fetch(`${hub.baseUrl}/v1/spaces/${spaceId}/grants`, {
        method: "POST",
        headers: bootstrapAuth,
        body: JSON.stringify({
          label: "runner-only",
          capabilities: ["space:read", "flow:run"],
        }),
      });
      const runnerToken = ((await noResolveGrant.json()) as { token: string }).token;
      const runnerAuth = {
        Authorization: `Bearer ${runnerToken}`,
        "Content-Type": "application/json",
      };
      const secondRun = ((await (
        await fetch(`${hub.baseUrl}/v1/flows/flw_my_dev_flow/run`, {
          method: "POST",
          headers: runnerAuth,
          body: JSON.stringify({ space_id: spaceId, input: {} }),
        })
      ).json()) as { run_id: string }).run_id;
      const denied = await fetch(
        `${hub.baseUrl}/v1/runs/${encodeURIComponent(secondRun)}/steps/intake/resolve`,
        {
          method: "POST",
          headers: runnerAuth,
          body: JSON.stringify({ branch: "cancel" }),
        },
      );
      expect(denied.status).toBe(403);
    } finally {
      await hub.stop();
    }
  });
  test.skip("Task 05 — upload intent and resolve errors are transport-neutral", () => {});
  test.skip("Task 09 — run admission and apply quiescence are atomic", () => {});
  test.skip("Task 11 — retained local artifacts never expose host paths", () => {});
});

