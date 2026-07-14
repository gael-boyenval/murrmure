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

