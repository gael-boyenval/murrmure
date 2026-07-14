import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, test } from "vitest";
import {
  compareTutorialFence,
  verifyTutorialV3Docs,
  type TutorialFenceRegistry,
} from "./helpers/tutorial-v3-docs.js";
import {
  createFakeAgent,
  createTemporaryGitRepository,
  createTemporaryTutorialSpace,
  createTemporaryUserData,
  packagedAppFixture,
} from "../../../test-utils/tutorial-v3/helpers.js";
import {
  loadTutorialSnapshot,
  type TutorialSnapshot,
} from "../../../test-utils/tutorial-v3/snapshots.js";
import {
  buildRunGraph,
  buildStepContractSlice,
  compileFlowIr,
  compileStepContractCatalog,
  parseFlowManifest,
} from "@murrmure/hub-core";
import type { FlowManifest } from "@murrmure/contracts";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const FIXTURE_ROOT = join(REPO_ROOT, "test-utils/spaces/tutorial-v3");

function expectOnlyKeys(
  value: unknown,
  allowed: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  expect(value, label).toBeTypeOf("object");
  expect(value, label).not.toBeNull();
  expect(Array.isArray(value), label).toBe(false);
  const unknown = Object.keys(value as Record<string, unknown>).filter(
    (key) => !allowed.includes(key),
  );
  expect(unknown, `${label} unknown keys`).toEqual([]);
}

describe("Tutorial v3 harness", () => {
  test("Task 00 — progressive snapshots materialize the clean target", () => {
    const snapshots = [2, 3, 5, 6].map((part) =>
      loadTutorialSnapshot(part as 2 | 3 | 5 | 6),
    );
    expect(snapshots.map((snapshot) => snapshot.part)).toEqual([2, 3, 5, 6]);
    for (let index = 1; index < snapshots.length; index += 1) {
      for (const path of Object.keys(snapshots[index - 1].files)) {
        expect(snapshots[index].files[path], `Part ${snapshots[index].part}: ${path}`).toBeDefined();
      }
    }

    for (const snapshot of snapshots) {
      const manifest = parseYaml(
        snapshot.files[".mrmr/flows/my-dev-flow/flow.manifest.yaml"],
      ) as Record<string, unknown>;
      expect(manifest).toHaveProperty("triggers");
      expect(manifest).not.toHaveProperty("start");
      expectOnlyKeys(
        manifest,
        ["apiVersion", "name", "description", "triggers", "steps"],
        `Part ${snapshot.part} manifest`,
      );
      expectOnlyKeys(
        manifest.triggers,
        ["manual", "flow_call", "events", "schedule", "idempotency"],
        `Part ${snapshot.part} triggers`,
      );
      for (const [stepIndex, step] of (
        manifest.steps as Array<Record<string, unknown>>
      ).entries()) {
        expectOnlyKeys(
          step,
          ["id", "description", "branches", "steps"],
          `Part ${snapshot.part} step ${stepIndex}`,
        );
        for (const [branchName, branch] of Object.entries(
          (step.branches as Record<string, unknown> | undefined) ?? {},
        )) {
          expectOnlyKeys(
            branch,
            ["schema", "artifact_slots", "route", "resume"],
            `Part ${snapshot.part} branch ${branchName}`,
          );
        }
      }
      const handlers = parseYaml(
        snapshot.files[".mrmr/space/handlers.yaml"],
      ) as Record<string, unknown>;
      expectOnlyKeys(
        handlers,
        ["version", "run_policies", "handlers"],
        `Part ${snapshot.part} handlers file`,
      );
      for (const handler of handlers.handlers as Array<Record<string, unknown>>) {
        expectOnlyKeys(
          handler,
          [
            "id",
            "on",
            "type",
            "view",
            "contract_keys",
            "complete",
            "prompt",
            "command",
            "cwd",
            "timeout_ms",
            "delivery",
          ],
          `Part ${snapshot.part} handler ${handler.id}`,
        );
      }
      const aggregate = Object.values(snapshot.files).join("\n");
      expect(aggregate).not.toMatch(
        /\b(?:role|presentation|requires_view|kill_on|fail_run|next):|awaiting_human|active_human_step/,
      );
    }
  });

  test("Task 03 — progressive contract keys flow through every downstream representation", () => {
    // Exact progressive fixture assertion: as tutorial stages activate, the
    // compiled catalog accumulates contract keys (write_spec/build at Part 5,
    // cleanup at Part 6), and every step appears in IR, catalog, graph, and the
    // runtime step-contract slice with a stable `graph_digest`.
    const expectedKeys: Record<number, string[]> = {
      2: ["my-dev-flow.intake"],
      3: ["my-dev-flow.intake"],
      5: ["my-dev-flow.intake", "my-dev-flow.write_spec", "my-dev-flow.build"],
      6: [
        "my-dev-flow.intake",
        "my-dev-flow.write_spec",
        "my-dev-flow.build",
        "my-dev-flow.cleanup",
      ],
    };

    const digests = new Map<number, string>();
    let previousKeys: string[] = [];

    for (const part of [2, 3, 5, 6] as const) {
      const snapshot = loadTutorialSnapshot(part);
      const raw = parseYaml(
        snapshot.files[".mrmr/flows/my-dev-flow/flow.manifest.yaml"],
      ) as Record<string, unknown>;

      // Schema: the clean manifest strict-parses.
      const parsed = parseFlowManifest(raw);
      expect(parsed.ok, `Part ${part} parses`).toBe(true);
      if (!parsed.ok) continue;
      const manifest = parsed.value as FlowManifest;
      const flowId = "flw_my_dev_flow";

      // Catalog + IR + graph + slice — the downstream representations.
      const { catalog } = compileStepContractCatalog(manifest, flowId);
      expect(catalog, `Part ${part} compiles a catalog`).not.toBeNull();
      if (!catalog) continue;
      const ir = compileFlowIr(manifest, flowId);
      const graph = buildRunGraph({
        run_id: "run_progressive",
        flow_id: flowId,
        step_contract_catalog: catalog,
        step_memos: [],
      });

      // Contract keys = `<flow_name>.<step_id>` — the stable protocol address.
      const keys = catalog.entries.map(
        (entry) => `${manifest.name}.${entry.step_id}`,
      );
      expect(keys, `Part ${part} contract keys`).toEqual(expectedKeys[part]);

      // Progressive accumulation: each stage is a superset of the previous;
      // write_spec/build activate at Part 5, cleanup at Part 6.
      expect(keys).toEqual(expect.arrayContaining(previousKeys));
      if (part === 5) {
        expect(keys).toContain("my-dev-flow.write_spec");
        expect(keys).toContain("my-dev-flow.build");
      }
      if (part === 6) {
        expect(keys).toContain("my-dev-flow.cleanup");
      }
      previousKeys = keys;

      // graph_digest is a stable sha256 per stage; it changes as steps activate.
      expect(catalog.graph_digest).toMatch(/^sha256:/);
      digests.set(part, catalog.graph_digest);

      // Every step appears in every downstream representation.
      for (const stepId of catalog.step_ids) {
        const contractKey = `${manifest.name}.${stepId}`;
        expect(keys, `Part ${part} key for ${stepId}`).toContain(contractKey);
        expect(
          ir.steps.some((s) => s.id === stepId),
          `Part ${part} IR has ${stepId}`,
        ).toBe(true);
        expect(
          graph.nodes.some((n) => n.step_id === stepId),
          `Part ${part} graph has ${stepId}`,
        ).toBe(true);

        const entry = catalog.entries.find((e) => e.step_id === stepId);
        expect(entry, `Part ${part} catalog entry for ${stepId}`).toBeDefined();
        const slice = buildStepContractSlice({
          entry: entry!,
          exec_context: {},
          run_id: "run_progressive",
          space_root: "/tmp/space",
        });
        expect(slice.step_id, `Part ${part} slice has ${stepId}`).toBe(stepId);
      }
    }

    // Graph evolves as stages activate: Part 5 and 6 introduce new steps, so
    // their digests differ from Part 2. Part 2 and 3 share the same manifest.
    expect(digests.get(2)).toBe(digests.get(3));
    expect(digests.get(5)).not.toBe(digests.get(2));
    expect(digests.get(6)).not.toBe(digests.get(5));
  });

  test("Task 00 — temporary resources isolate user, credentials, spaces, runs, and repositories", () => {
    const firstUser = createTemporaryUserData();
    const secondUser = createTemporaryUserData();
    const firstSpace = createTemporaryTutorialSpace(2);
    const secondSpace = createTemporaryTutorialSpace(2);
    const firstRepo = createTemporaryGitRepository();
    const secondRepo = createTemporaryGitRepository();
    const agent = createFakeAgent();
    try {
      expect(firstUser.home).not.toBe(secondUser.home);
      expect(firstUser.credentialStore).not.toBe(secondUser.credentialStore);
      expect(firstSpace.spaceRoot).not.toBe(secondSpace.spaceRoot);
      expect(firstSpace.runRoot).not.toBe(secondSpace.runRoot);
      expect(firstRepo.repository).not.toBe(secondRepo.repository);
      expect(realpathSync(firstRepo.git("rev-parse", "--show-toplevel"))).toBe(
        realpathSync(firstRepo.repository),
      );
      expect(realpathSync(secondRepo.git("rev-parse", "--show-toplevel"))).toBe(
        realpathSync(secondRepo.repository),
      );
      agent.record({
        protocol: "murrmure.agent/v1",
        runId: "run_fixture",
        stepId: "build",
        prompt: "fixture",
      });
      expect(agent.read()).toHaveLength(1);
      expect(packagedAppFixture().require).toBeTypeOf("function");
    } finally {
      firstUser.cleanup();
      secondUser.cleanup();
      firstSpace.cleanup();
      secondSpace.cleanup();
      firstRepo.cleanup();
      secondRepo.cleanup();
      agent.cleanup();
    }
  });

  test("Task 00 — docs-proof registers every v3 page and matches fixture fences", () => {
    expect(verifyTutorialV3Docs(REPO_ROOT)).toEqual([]);
  });

  test("Task 00 — fence proof rejects missing, duplicate, missing-target, and drift cases", () => {
    const root = mkdtempSync(join(tmpdir(), "tutorial-v3-doc-proof-"));
    const page = "page.md";
    const registration = {
      id: "example",
      page,
      part: 2 as const,
      snippet: "expected",
      compare: "exact" as const,
    };
    const registry = (fences = [registration]): TutorialFenceRegistry => ({
      schemaVersion: 1,
      pages: [page],
      fences,
    });
    const snapshot = (snippets: Record<string, string>): TutorialSnapshot => ({
      part: 2,
      source: "synthetic",
      files: {},
      snippets,
    });
    try {
      writeFileSync(join(root, page), "# no fence\n", "utf8");
      expect(verifyTutorialV3Docs(root, registry(), () => snapshot({ expected: "ok\n" }))).toContain(
        "missing tutorial fence id: example",
      );

      writeFileSync(
        join(root, page),
        "<!-- tutorial-v3-fence:example -->\n```text\nok\n```\n<!-- tutorial-v3-fence:example -->\n```text\nok\n```\n",
        "utf8",
      );
      expect(verifyTutorialV3Docs(root, registry(), () => snapshot({ expected: "ok\n" }))).toContain(
        "duplicate tutorial fence id: example",
      );

      writeFileSync(
        join(root, page),
        "<!-- tutorial-v3-fence:example -->\n```text\nok\n```\n",
        "utf8",
      );
      expect(verifyTutorialV3Docs(root, registry(), () => snapshot({}))).toContain(
        "missing fixture target: part 2 expected",
      );
      expect(verifyTutorialV3Docs(root, registry(), () => snapshot({ expected: "different\n" }))).toContain(
        "tutorial fence drift: example",
      );
      expect(compareTutorialFence("b: 2\na: 1\n", "a: 1\nb: 2\n", "yaml")).toBe(true);
      expect(
        compareTutorialFence('{"b":2,"a":1}\n', '{"a":1,"b":2}\n', "json"),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Task 00 — every skeleton is skipped with an owning task ID", () => {
    const skeletons = [
      "packages/contracts/test/tutorial-v3-contract.test.ts",
      "packages/hub-daemon/test/http/tutorial-v3-http.test.ts",
      "packages/mcp-bridge/test/tutorial-v3-mcp.test.ts",
      "packages/cli/test/tutorial-v3-cli.test.ts",
      "packages/view-sdk/test/tutorial-v3-view.test.ts",
      "packages/hub-core/test/tutorial-v3-handler.test.ts",
      "packages/executors/conformance/tutorial-v3-repository.test.ts",
      "packages/shell-web/src/tutorial-v3-shell-ui.test.tsx",
      "apps/desktop/test/tutorial-v3-packaged.test.ts",
    ];
    for (const relative of skeletons) {
      const path = join(REPO_ROOT, relative);
      expect(existsSync(path), relative).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source, relative).toMatch(/test\.skip\("Task (?:0[1-9]|1[0-4]) —/);
      expect(source, relative).not.toMatch(/test\.(?:fails|todo)|describe\.skip/);
    }
  });

  test("Task 00 — acceptance schema and beat map cover Parts 1–6", () => {
    const schema = JSON.parse(
      readFileSync(join(FIXTURE_ROOT, "manual-acceptance.schema.json"), "utf8"),
    ) as { required: string[] };
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "task",
        "tutorial_chapters",
        "environment",
        "product_build",
        "commands",
        "run_ids",
        "evidence",
        "result",
        "blockers",
      ]),
    );
    const beatMap = JSON.parse(
      readFileSync(join(FIXTURE_ROOT, "tutorial-beats.json"), "utf8"),
    ) as { beats: Array<{ chapters: number[]; automated: string[]; manual_only: string[] }> };
    expect(new Set(beatMap.beats.flatMap((beat) => beat.chapters))).toEqual(
      new Set([1, 2, 3, 4, 5, 6]),
    );
    for (const beat of beatMap.beats) {
      expect(beat.automated.length + beat.manual_only.length).toBeGreaterThan(0);
    }
  });
});

