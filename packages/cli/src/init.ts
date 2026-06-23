import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { templatesRoot } from "./paths.js";
import { installMurrmureSkill } from "./skill/install.js";

const SCAFFOLD_DEPENDENCY_VERSIONS = {
  "@murrmure/flow-dev-kit": "0.1.0",
  react: "18.3.1",
  "react-dom": "18.3.1",
};

const SCAFFOLD_DEV_DEPENDENCY_VERSIONS = {
  "@playwright/test": "1.55.0",
  "@murrmure/cli": "0.1.0",
  "@types/react": "18.3.11",
  "@types/react-dom": "18.3.0",
  typescript: "5.6.3",
  vitest: "3.2.4",
};

const DEFAULT_MANIFEST = (id: string) => ({
  schemaVersion: "1",
  id,
  version: "0.1.0",
  routes_prefix: `/api/${id}`,
  ui: {
    entry: "ui/entry.js",
    canvas_route: `/spaces/:spaceId/instances/:instanceId/canvas/${id}`,
  },
  server: { mount_module: "server/mount.mjs" },
  mcp_tools_by_version: { "0.1.0": ["ping"] },
  config_schema: "contract/config.schema.json",
  tests: { contract: "tests/contract/reachability.test.ts" },
});

const DEFAULT_CONTRACT = {
  schemaVersion: "2.0",
  id: "demo-flow",
  version: "0.1.0",
  initial_state: "draft",
  terminal_states: ["done"],
  metadata_schema: { type: "object", properties: { title: { type: "string" } } },
  states: [
    { id: "draft", kind: "active" },
    { id: "review", kind: "active" },
    { id: "done", kind: "terminal" },
  ],
  transitions: [
    {
      id: "submit",
      from: "draft",
      to: "review",
      event: "submit",
      actors: ["agent:*", "human:*"],
      condition: null,
      gate: null,
      emit: ["submitted"],
    },
    {
      id: "approve",
      from: "review",
      to: "done",
      event: "approve",
      actors: ["human:*"],
      condition: null,
      gate: null,
      emit: ["completed"],
    },
    {
      id: "reject",
      from: "review",
      to: "draft",
      event: "reject",
      actors: ["human:*"],
      condition: null,
      gate: null,
      emit: [],
    },
  ],
  events: {
    declarations: [
      { type: "submitted", schema: { type: "object" } },
      { type: "completed", schema: { type: "object" } },
    ],
  },
};

const DEFAULT_MCP = {
  tools: {
    ping: {
      description: "Health check",
      http: { method: "GET", path: "/health" },
      input_schema: { type: "object", properties: {} },
    },
  },
};

const DEFAULT_CONFIG_SCHEMA = {
  type: "object",
  properties: {
    production_gate_enabled: { type: "boolean", default: true },
  },
};

const ROOT_PACKAGE_JSON = (id: string) => ({
  name: id,
  private: true,
  type: "module",
  scripts: {
    "validate:flow": "mrmr flow validate .",
    "build:flow": "mrmr flow build .",
    "dev:flow": "mrmr flow dev . --sim",
    "test:unit": "vitest run",
    "test:e2e": "playwright test",
  },
  dependencies: SCAFFOLD_DEPENDENCY_VERSIONS,
  devDependencies: SCAFFOLD_DEV_DEPENDENCY_VERSIONS,
});

const UI_APP = `import { useFlowContextPublic, useHubBridgeClient } from "@murrmure/flow-dev-kit/react";
import { useCallback, useEffect, useState } from "react";
import { FlowErrorState } from "./components/error/FlowErrorState";

type InstallSnapshot = {
  install: {
    state: string;
    revision: number;
  };
  fixture: string;
};

function toErrorMessage(value: unknown): string {
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message: unknown }).message);
  }
  return "Unknown simulator error";
}

export function App() {
  const ctx = useFlowContextPublic();
  const bridge = useHubBridgeClient();
  const [snapshot, setSnapshot] = useState<InstallSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTransitionCode, setLastTransitionCode] = useState<string | null>(null);

  const refreshInstall = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await bridge.fetch("/sim/install");
      const body = (await response.json()) as InstallSnapshot & { error?: { code?: string; message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to load install state");
      }
      setSnapshot(body);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [bridge]);

  const transitionInstall = useCallback(
    async (action: string) => {
      setError(null);
      setLastTransitionCode(null);
      try {
        const response = await bridge.fetch("/sim/install/transition", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const body = (await response.json()) as {
          install?: InstallSnapshot["install"];
          error?: { code?: string; message?: string };
        };
        if (!response.ok) {
          setLastTransitionCode(body.error?.code ?? null);
          throw new Error(body.error?.message ?? "Transition failed");
        }
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                install: body.install ?? prev.install,
              }
            : prev,
        );
      } catch (nextError) {
        setError(toErrorMessage(nextError));
      }
    },
    [bridge],
  );

  useEffect(() => {
    void refreshInstall();
  }, [refreshInstall]);

  if (error) {
    return (
      <FlowErrorState
        title="Simulator unavailable"
        message={error}
        details={lastTransitionCode ? \`code: \${lastTransitionCode}\` : undefined}
        onRetry={() => void refreshInstall()}
      />
    );
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Flow canvas</h1>
        <p style={{ margin: 0 }}>
          <strong>{ctx.flowId}</strong> in <strong>{ctx.spaceId}</strong> / instance{" "}
          <strong>{ctx.instanceId}</strong>
        </p>
      </header>

      {isLoading || !snapshot ? (
        <p>Loading simulated install state...</p>
      ) : (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "0.75rem",
            padding: "0.875rem",
            background: "#f9fafb",
          }}
        >
          <p style={{ marginTop: 0 }}>
            <strong>State:</strong> {snapshot.install.state} (revision {snapshot.install.revision})
          </p>
          <p>
            <strong>Fixture:</strong> {snapshot.fixture}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void transitionInstall("validate")}>
              Validate
            </button>
            <button type="button" onClick={() => void transitionInstall("test")}>
              Test
            </button>
            <button type="button" onClick={() => void transitionInstall("promote")}>
              Promote
            </button>
            <button type="button" onClick={() => void transitionInstall("apply")}>
              Apply
            </button>
            <button type="button" onClick={() => void refreshInstall()}>
              Refresh
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
`;

const UI_MOUNT = `import type { FlowHostContext } from "@murrmure/flow-dev-kit/host";
import { createFlowMount } from "@murrmure/flow-dev-kit";
import { App } from "./App";
import { FlowErrorBoundary } from "./components/error/FlowErrorBoundary";

const mountReactApp = createFlowMount({
  App,
  Boundary: FlowErrorBoundary,
});

export function mount(root: HTMLElement, ctx: FlowHostContext): () => void {
  return mountReactApp(root, ctx);
}
`;

const UI_SHELL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Capability</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import { mount } from "./entry.js";

      const root = document.getElementById("root");
      if (!root) {
        throw new Error("Missing #root mount element");
      }

      let seq = 0;
      let cleanup = null;
      const pending = new Map();

      const bridgeFetch = (path, init) =>
        new Promise((resolve, reject) => {
          const id = \`hub-fetch-\${seq++}\`;
          pending.set(id, { resolve, reject });
          window.parent.postMessage({ type: "hub-fetch", id, path, init }, "*");
          window.setTimeout(() => {
            if (!pending.has(id)) {
              return;
            }
            pending.delete(id);
            reject(new Error("hub-fetch timeout"));
          }, 10000);
        });

      window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || typeof data !== "object") {
          return;
        }

        if (data.type === "hub-fetch-result" && typeof data.id === "string") {
          const request = pending.get(data.id);
          if (!request) {
            return;
          }
          pending.delete(data.id);
          request.resolve(
            new Response(data.body ?? null, {
              status: typeof data.status === "number" ? data.status : 500,
              headers: typeof data.headers === "object" && data.headers ? data.headers : {},
            }),
          );
          return;
        }

        if (data.type === "reload") {
          window.location.reload();
          return;
        }

        if (data.type === "init" && data.ctx && typeof data.ctx === "object") {
          if (typeof cleanup === "function") {
            cleanup();
          }
          cleanup = mount(root, {
            ...data.ctx,
            postMessage: (msg) => window.parent.postMessage(msg, "*"),
            hubFetch: bridgeFetch,
          });
        }
      });

      window.parent.postMessage({ type: "shell-ready" }, "*");
    </script>
  </body>
</html>
`;

const CAPABILITY_ERROR_STATE = `import {
  FlowErrorState as DevKitFlowErrorState,
  type FlowErrorStateProps,
} from "@murrmure/flow-dev-kit/react";

export function FlowErrorState(props: FlowErrorStateProps) {
  return (
    <DevKitFlowErrorState
      title={props.title ?? "Flow runtime error"}
      message={props.message}
      details={props.details}
      retryLabel={props.retryLabel}
      onRetry={props.onRetry}
    />
  );
}
`;

const CAPABILITY_ERROR_BOUNDARY = `import { FlowErrorBoundary as DevKitFlowErrorBoundary } from "@murrmure/flow-dev-kit/react";
import type { ReactNode } from "react";
import { FlowErrorState } from "./FlowErrorState";

export function FlowErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <DevKitFlowErrorBoundary
      fallback={({ error, reset }) => (
        <FlowErrorState
          message={error.message}
          details={error.stack}
          onRetry={reset}
          retryLabel="Retry flow"
        />
      )}
    >
      {children}
    </DevKitFlowErrorBoundary>
  );
}
`;

const SERVER_INDEX = `import type { Hono } from "hono";
import type { FlowServerContext } from "@murrmure/flow-dev-kit/server";

export function mountRoutes(app: Hono, ctx: FlowServerContext): void {
  app.get("/health", (c) => c.json({ ok: true, flow: ctx.flowId }));
}
`;

const PLAYWRIGHT_CONFIG = `import { defineConfig } from "@playwright/test";

const port = Number(process.env.FLOW_SIM_PORT ?? 4310);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: \`http://127.0.0.1:\${port}\`,
  },
  webServer: {
    command: \`npm run dev:flow -- --port \${port}\`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
`;

const E2E_HARNESS_SIMULATED_SHELL = `import type { FrameLocator, Page } from "@playwright/test";

export function flowCanvasFrame(page: Page): FrameLocator {
  return page.frameLocator("#flow-canvas");
}
`;

const E2E_HARNESS_SIMULATED_MURRMURE_MACHINE = `import type { APIRequestContext } from "@playwright/test";

export async function applyFixture(request: APIRequestContext, fixture: string): Promise<void> {
  const response = await request.post(\`/sim/fixtures/\${fixture}/apply\`);
  if (!response.ok()) {
    throw new Error(\`Unable to apply fixture: \${fixture}\`);
  }
}
`;

const E2E_CANVAS_SPEC = `import { expect, test } from "@playwright/test";
import { flowCanvasFrame } from "./harness/simulated-shell";
import { applyFixture } from "./harness/simulated-murrmure-machine";

test("renders flow canvas from simulator", async ({ page, request }) => {
  await applyFixture(request, "live-install-ready");
  await page.goto("/");
  const frame = flowCanvasFrame(page);
  await expect(frame.getByRole("heading", { name: "Flow canvas" })).toBeVisible();
  await expect(frame.getByText(/State:\\s*live/)).toBeVisible();
});

test("executes deterministic install transition", async ({ page, request }) => {
  await applyFixture(request, "pending-review");
  await page.goto("/");
  const frame = flowCanvasFrame(page);
  await frame.getByRole("button", { name: "Validate" }).click();
  await expect(frame.getByText(/State:\\s*validated/)).toBeVisible();
});
`;

export interface InitFlowOptions {
  install?: boolean;
  packageManager?: "npm";
  fromExample?: string;
  withSkill?: boolean;
}

export function listExamples(): string[] {
  const root = templatesRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => {
    try {
      return statSync(join(root, name, "flow.manifest.json")).isFile();
    } catch {
      return false;
    }
  });
}

const EXAMPLE_SKIP = new Set(["node_modules", "dist", ".murrmure", ".git"]);

function rewriteJsonId(file: string, from: string, to: string): void {
  if (!existsSync(file)) return;
  const replaced = readFileSync(file, "utf-8").split(from).join(to);
  writeFileSync(file, replaced);
}

function initFromExample(
  id: string,
  dir: string,
  example: string,
  opts?: InitFlowOptions,
): { ok: boolean; path: string; installed: boolean } {
  const source = join(templatesRoot(), example);
  if (!existsSync(join(source, "flow.manifest.json"))) {
    throw new Error(`Unknown example: ${example}. Available: ${listExamples().join(", ") || "none"}`);
  }

  cpSync(source, dir, {
    recursive: true,
    filter: (src) => !EXAMPLE_SKIP.has(src.split(/[\\/]/).pop() ?? ""),
  });

  if (id !== example) {
    rewriteJsonId(join(dir, "flow.manifest.json"), example, id);
    rewriteJsonId(join(dir, "package.json"), `"name": "${example}"`, `"name": "${id}"`);
    rewriteJsonId(join(dir, "contract", "contract.json"), `"id": "${example}"`, `"id": "${id}"`);
    writeFileSync(
      join(dir, "murrmure.flow.yaml"),
      `name: ${id}\ndescription: Forked from the ${example} example flow.\n`,
    );
  }

  let installed = false;
  if (opts?.install) {
    const result = spawnSync(opts.packageManager ?? "npm", ["install"], {
      cwd: dir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      throw new Error(`Install failed in ${dir}`);
    }
    installed = true;
  }

  if (opts?.withSkill) {
    installMurrmureSkill(process.cwd());
  }

  return { ok: true, path: dir, installed };
}

export function initFlow(
  id: string,
  dir: string,
  opts?: InitFlowOptions,
): { ok: boolean; path: string; installed: boolean } {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(id)) {
    throw new Error(`Invalid package id: ${id}`);
  }
  if (existsSync(dir)) {
    throw new Error(`Directory already exists: ${dir}`);
  }
  if (opts?.fromExample) {
    return initFromExample(id, dir, opts.fromExample, opts);
  }
  mkdirSync(join(dir, "contract"), { recursive: true });
  mkdirSync(join(dir, "ui", "src", "components", "error"), { recursive: true });
  mkdirSync(join(dir, "server"), { recursive: true });
  mkdirSync(join(dir, "tests", "contract"), { recursive: true });
  mkdirSync(join(dir, "tests", "e2e", "harness"), { recursive: true });

  writeFileSync(join(dir, "package.json"), JSON.stringify(ROOT_PACKAGE_JSON(id), null, 2) + "\n");
  writeFileSync(join(dir, "flow.manifest.json"), JSON.stringify(DEFAULT_MANIFEST(id), null, 2));
  writeFileSync(join(dir, "contract", "contract.json"), JSON.stringify({ ...DEFAULT_CONTRACT, id }, null, 2));
  writeFileSync(join(dir, "contract", "mcp-tools.json"), JSON.stringify(DEFAULT_MCP, null, 2));
  writeFileSync(join(dir, "contract", "config.schema.json"), JSON.stringify(DEFAULT_CONFIG_SCHEMA, null, 2));
  writeFileSync(join(dir, "ui", "shell.html"), UI_SHELL_HTML);
  writeFileSync(join(dir, "ui", "src", "App.tsx"), UI_APP);
  writeFileSync(join(dir, "ui", "src", "mount.tsx"), UI_MOUNT);
  writeFileSync(
    join(dir, "ui", "src", "components", "error", "FlowErrorState.tsx"),
    CAPABILITY_ERROR_STATE,
  );
  writeFileSync(
    join(dir, "ui", "src", "components", "error", "FlowErrorBoundary.tsx"),
    CAPABILITY_ERROR_BOUNDARY,
  );
  writeFileSync(join(dir, "server", "index.ts"), SERVER_INDEX);
  writeFileSync(join(dir, "playwright.config.ts"), PLAYWRIGHT_CONFIG);
  writeFileSync(join(dir, "tests", "e2e", "canvas.spec.ts"), E2E_CANVAS_SPEC);
  writeFileSync(
    join(dir, "tests", "e2e", "harness", "simulated-shell.ts"),
    E2E_HARNESS_SIMULATED_SHELL,
  );
  writeFileSync(
    join(dir, "tests", "e2e", "harness", "simulated-murrmure-machine.ts"),
    E2E_HARNESS_SIMULATED_MURRMURE_MACHINE,
  );
  writeFileSync(
    join(dir, "murrmure.flow.yaml"),
    `name: ${id}\ndescription: User-authored flow\n`,
  );
  writeFileSync(
    join(dir, "tests", "contract", "reachability.test.ts"),
    `import { describe, expect, test } from "vitest";\n\ndescribe("contract", () => {\n  test("placeholder", () => expect(true).toBe(true));\n});\n`,
  );

  let installed = false;
  if (opts?.install) {
    const result = spawnSync(opts.packageManager ?? "npm", ["install"], {
      cwd: dir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      throw new Error(`Install failed in ${dir}`);
    }
    installed = true;
  }

  if (opts?.withSkill) {
    installMurrmureSkill(process.cwd());
  }

  return { ok: true, path: dir, installed };
}
