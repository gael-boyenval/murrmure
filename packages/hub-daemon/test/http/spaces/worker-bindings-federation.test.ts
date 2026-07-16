import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/spaces/worker-bindings-federation", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let catalogSpaceId = "";
  let workerSpaceId = "";
  let workerRoot = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "worker-bindings-federation-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000081",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;
    workerRoot = fixture.dataDir;

    catalogSpaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "catalog-space",
      name: "Catalog Space",
    });
    workerSpaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "worker-space",
      name: "Worker Space",
    });

    const workerLink = await fetch(`${baseUrl}/v1/spaces/${workerSpaceId}/link`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        host: "local",
        path: workerRoot,
        primary: true,
      }),
    });
    expect(workerLink.status).toBe(200);

    const catalogFlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "catalog-flow",
      triggers: { manual: true },
      steps: [
        {
          id: "write_spec",
          branches: {
            completed: { schema: { type: "object" }, route: { run: "completed" } },
          },
        },
      ],
    };

    const catalogApply = await fetch(`${baseUrl}/v1/spaces/${catalogSpaceId}/apply`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        bundle: {
          actions: { digest: "sha256:catalog-actions-empty", file: { version: 1, actions: {} } },
          hooks: { digest: "sha256:catalog-hooks-empty", file: { version: 1, hooks: {} } },
          flows: [
            {
              flow_id: "flw_catalog_flow",
              rel_path: "flows/catalog-flow/flow.manifest.yaml",
              digest: "sha256:catalog-flow",
              manifest: catalogFlowManifest,
              raw: catalogFlowManifest,
            },
          ],
          views: [],
        },
      }),
    });
    expect(catalogApply.status).toBe(200);
  });

  afterAll(() => cleanup?.());

  test("worker applies bindings from catalog and runs bound flow locally", async () => {
    const workerApply = await fetch(`${baseUrl}/v1/spaces/${workerSpaceId}/apply`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:worker-actions",
            file: {
              version: 1,
              actions: {
                "write-spec": {
                  executor: "shell",
                  command: "echo worker-write-spec",
                },
              },
            },
          },
          executors: {
            digest: "sha256:worker-executors",
            file: {
              executors: {
                shell: {
                  binding: {
                    type: "shell_spawn",
                    executor_id: "shell",
                  },
                },
              },
            },
          },
          handlers: {
            digest: "sha256:worker-handlers",
            file: {
              version: 1,
              handlers: [
                {
                  id: "write-spec",
                  contract_keys: ["catalog-flow.write_spec"],
                  on: "step.opened::catalog-flow.write_spec",
                  type: "shell_spawn",
                  complete: "explicit",
                  command: "echo worker-handler",
                },
              ],
            },
          },
          hooks: {
            digest: "sha256:worker-hooks-empty",
            file: { version: 1, hooks: {} },
          },
          bindings: {
            digest: "sha256:worker-bindings",
            file: {
              version: 1,
              flows: [{ ref: "flw_catalog_flow", source: `space:${catalogSpaceId}` }],
              views: [],
            },
          },
          flows: [],
          views: [],
        },
      }),
    });
    expect(workerApply.status).toBe(200);
    const workerApplyBody = (await workerApply.json()) as {
      status?: { counts?: { flows?: number } };
      warnings?: Array<{ code: string }>;
    };
    expect(workerApplyBody.status?.counts?.flows).toBe(1);
    expect(workerApplyBody.warnings?.some((warning) => warning.code === "BINDINGS_UNRESOLVED")).toBe(false);

    const indexedFlows = await fetch(`${baseUrl}/v1/spaces/${workerSpaceId}/index/flows`, {
      headers: bootstrapAuth(bootstrapToken),
    }).then((res) => res.json() as Promise<{ flows: Array<{ flow_id: string }> }>);
    expect(indexedFlows.flows.map((flow) => flow.flow_id)).toContain("flw_catalog_flow");

    const runRes = await fetch(`${baseUrl}/v1/flows/flw_catalog_flow/run`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        space_id: workerSpaceId,
        input: { spec: "demo" },
      }),
    });
    expect(runRes.status).toBe(201);
    const runBody = (await runRes.json()) as { run_id: string };
    expect(runBody.run_id).toMatch(/^run_/);
  });
});
