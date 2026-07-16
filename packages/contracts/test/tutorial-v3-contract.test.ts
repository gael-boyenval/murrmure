import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  FlowManifestSchema,
  OpenChildStepBodySchema,
  StepBranchDefinitionSchema,
  StepCatalogBranchSchema,
  type FlowManifest,
} from "@murrmure/contracts";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** Exact Tutorial Part 2 manifest object (matches the part-2-flow fence). */
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
} satisfies FlowManifest;

function manifestRejects(value: unknown): boolean {
  return !FlowManifestSchema.safeParse(value).success;
}

function typescriptFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? typescriptFiles(path)
      : entry.endsWith(".ts")
        ? [path]
        : [];
  });
}

describe("Tutorial v3 canonical contracts", () => {
  test("Task 08 — nested control and child-open bodies are exact", () => {
    expect(StepBranchDefinitionSchema.safeParse({
      schema: { type: "object" },
      resume: "build",
    }).success).toBe(true);
    expect(StepBranchDefinitionSchema.safeParse({
      schema: { type: "object" },
      route: { run: "failed" },
      resume: "build",
    }).success).toBe(false);
    expect(StepBranchDefinitionSchema.safeParse({
      schema: { type: "object" },
      route: { step: "build.review", run: "failed" },
    }).success).toBe(false);
    expect(OpenChildStepBodySchema.safeParse({
      child_step_id: "build.review",
      idempotency_key: "review-1",
      input: { arbitrary: true },
    }).success).toBe(false);
  });

  test("Task 00 — shared branch and resolver projections have one definition owner", () => {
    const roots = [
      join(REPO_ROOT, "packages/contracts/src"),
      join(REPO_ROOT, "packages/hub-core/src"),
      join(REPO_ROOT, "packages/view-sdk/src"),
      join(REPO_ROOT, "packages/shell-client/src"),
      join(REPO_ROOT, "packages/shell-web/src"),
    ];
    const declarations = typescriptFiles(roots[0])
      .concat(...roots.slice(1).map(typescriptFiles))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return [
          /(?:interface|type|class|const)\s+BranchResolveContract\b/.test(source)
            ? { symbol: "BranchResolveContract", file }
            : null,
          /(?:interface|type|class|const)\s+OpenStepResolverProjection\b/.test(source)
            ? { symbol: "OpenStepResolverProjection", file }
            : null,
        ].filter((entry): entry is { symbol: string; file: string } => entry !== null);
      });

    for (const declaration of declarations) {
      const relative = declaration.file.replace(`${REPO_ROOT}/`, "");
      if (declaration.symbol === "BranchResolveContract") {
        expect(relative).toBe("packages/contracts/src/entities/step-contract.ts");
      } else {
        expect(relative).toBe("packages/contracts/src/entities/run.ts");
      }
    }
  });

  test("Task 03 — exact Part 2 manifest normalizes and compiles", () => {
    // Exact Part 2 YAML strict-parses to the canonical manifest.
    const parsed = FlowManifestSchema.safeParse(PART_2_MANIFEST);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.triggers).toMatchObject({ manual: true });
    expect(parsed.data.steps).toHaveLength(1);
    const intake = parsed.data.steps[0]!;
    expect(intake.id).toBe("intake");
    expect(intake.branches?.continue?.route).toEqual({ run: "completed" });
    expect(intake.branches?.cancel?.route).toEqual({ run: "failed" });
    expect(intake.branches?.continue?.artifact_slots?.spec?.max_bytes).toBe(1048576);

    // `triggers` is the only start-condition field and is required.
    expect(manifestRejects({ ...PART_2_MANIFEST, triggers: undefined })).toBe(true);
    // Removed `start` (including dual `start` + `triggers`) is rejected with no fallback.
    expect(manifestRejects({ ...PART_2_MANIFEST, start: { manual: true } })).toBe(true);
    // Flow-level `requires_view` is rejected; Views bind through handlers, not the flow.
    expect(
      manifestRejects({ ...PART_2_MANIFEST, requires_view: "intake-view" }),
    ).toBe(true);
    expect(
      manifestRejects({
        ...PART_2_MANIFEST,
        triggers: { manual: true, requires_view: "intake-view" },
      }),
    ).toBe(true);

    // Step contracts carry no role, presentation, or deriveRole modality.
    expect(
      manifestRejects({
        ...PART_2_MANIFEST,
        steps: [{ id: "intake", role: "agent" }],
      }),
    ).toBe(true);
    expect(
      manifestRejects({
        ...PART_2_MANIFEST,
        steps: [{ id: "intake", presentation: { view: "intake-view" } }],
      }),
    ).toBe(true);
    expect(
      manifestRejects({
        ...PART_2_MANIFEST,
        steps: [{ id: "intake", deriveRole: "from-input" }],
      }),
    ).toBe(true);

    // Explicit `branches: {}` is invalid — omit branches for defaults or
    // declare at least one branch (done gate: empty maps are rejected).
    expect(
      manifestRejects({
        ...PART_2_MANIFEST,
        steps: [{ id: "intake", branches: {} }],
      }),
    ).toBe(true);
    expect(
      manifestRejects({
        ...PART_2_MANIFEST,
        steps: [
          {
            id: "build",
            steps: [{ id: "build-loop", branches: {} }],
          },
        ],
      }),
    ).toBe(true);

    // Branch authoring is flat: wrapper shapes `payload`/`outcome` are rejected.
    expect(
      manifestRejects({
        ...PART_2_MANIFEST,
        steps: [
          {
            id: "intake",
            branches: { continue: { payload: { schema: { type: "object" } } } },
          },
        ],
      }),
    ).toBe(true);
    expect(
      manifestRejects({
        ...PART_2_MANIFEST,
        steps: [
          {
            id: "intake",
            branches: { continue: { outcome: { route: { run: "completed" } } } },
          },
        ],
      }),
    ).toBe(true);
    // Superseded routing keys (`next`, `fail_run`, `goto`, `fail`) are not branch fields.
    expect(
      StepBranchDefinitionSchema.safeParse({
        schema: { type: "object" },
        next: null,
      }).success,
    ).toBe(false);
    expect(
      StepBranchDefinitionSchema.safeParse({
        schema: { type: "object" },
        fail_run: true,
      }).success,
    ).toBe(false);

    // A linear step needs only `id`; `description` and `branches` are optional
    // (the compiler injects `completed`/`failed` defaults for omitted branches).
    const linear = FlowManifestSchema.safeParse({
      ...PART_2_MANIFEST,
      steps: [{ id: "write_spec", description: "Write the spec." }],
    });
    expect(linear.success).toBe(true);

    // `apiVersion: murrmure.flow/v1` is the sole clean target (no dual parser).
    expect(
      manifestRejects({ ...PART_2_MANIFEST, apiVersion: "murrmure.flow/v2" }),
    ).toBe(true);
  });
  test("Task 05 — every branch contract owns its payload and artifact requirements", () => {
    const branch = StepCatalogBranchSchema.parse({
      schema: { type: "object", required: ["spec"] },
      payload_required: [],
      artifact_required: ["spec"],
      artifact_slots: {
        spec: {
          extensions: ["MD"],
          min_bytes: 1,
          max_bytes: 1048576,
        },
      },
      routes: [{ engine: "advance" }],
    });
    expect(branch.payload_required).toEqual([]);
    expect(branch.artifact_required).toEqual(["spec"]);
    expect(branch.artifact_slots.spec?.extensions).toEqual([".md"]);
  });
});

