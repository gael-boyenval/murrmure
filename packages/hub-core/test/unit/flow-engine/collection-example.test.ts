import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  artifactPathsForInputs,
  buildArtifactMurrmureBindings,
  compileStepContractCatalog,
  mergeArtifactsIntoExecContext,
  parseFlowManifest,
  type RunArtifactsBag,
} from "@murrmure/hub-core";

const FIXTURE_ROOT = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "test-utils",
  "spaces",
  "collection-example",
);

function readFixture(rel: string): string {
  return readFileSync(resolve(FIXTURE_ROOT, rel), "utf8");
}

function collectionExecContext(): Record<string, unknown> {
  return mergeArtifactsIntoExecContext({}, "intake", [
    {
      slot: "assets",
      cardinality: "collection",
      files: [
        { name: "01-openapi.json", path: ".mrmr/dev/runs/run_X/steps/intake/assets/01-openapi.json", transfer_id: "xfr_01", digest: "sha256:a", size_bytes: 10 },
        { name: "02-paths.json", path: ".mrmr/dev/runs/run_X/steps/intake/assets/02-paths.json", transfer_id: "xfr_02", digest: "sha256:b", size_bytes: 20 },
      ],
    },
  ]);
}

describe("collection example fixture (local + remote)", () => {
  test("manifest declares a bounded collection slot and compiles", () => {
    const manifest = parseFlowManifest(parseYaml(readFixture(".mrmr/flows/api-contract-review/flow.manifest.yaml")));
    expect(manifest.ok, "manifest parses").toBe(true);
    if (!manifest.ok) return;
    const { catalog, warnings } = compileStepContractCatalog(manifest.value, "flw_api_contract_review");
    expect(catalog, "catalog compiles").not.toBeNull();
    if (!catalog) return;

    const intake = catalog.entries.find((e) => e.step_id === "intake");
    expect(intake).toBeDefined();
    const slot = intake?.branches?.["continue"]?.artifact_slots?.assets;
    expect(slot).toBeDefined();
    expect(slot?.max_files).toBe(4);
    expect(slot?.min_files).toBe(1);
    expect(slot?.max_total_bytes).toBe(1048576);
    // The fixture manifest has no cardinality-mismatched artifact tokens.
    expect(warnings.some((w) => w.code === "ARTIFACT_TOKEN_CARDINALITY_MISMATCH")).toBe(false);
  });

  test("handler binds the collection with .directory, never .path", () => {
    const handlersYaml = readFixture(".mrmr/space/handlers.yaml");
    expect(handlersYaml).toContain("{{murrmure.step.intake.artifact.assets.directory}}");
    expect(handlersYaml).not.toMatch(/artifact\.assets\.path/);
  });

  test("local bindings emit .directory for the collection and no .path", () => {
    const bindings = buildArtifactMurrmureBindings(
      (collectionExecContext().artifacts ?? {}) as RunArtifactsBag,
    );
    expect(bindings["step.intake.artifact.assets.directory"]).toBeDefined();
    expect(bindings["step.intake.artifact.assets.path"]).toBeUndefined();
  });

  test("remote projection carries ordered references, not producer host paths", () => {
    const projected = artifactPathsForInputs(collectionExecContext());
    const files = projected["steps.intake.artifact.assets.files"] as Array<{
      name: string;
      transfer_id?: string;
      digest?: string;
      size_bytes?: number;
    }>;
    expect(Array.isArray(files)).toBe(true);
    expect(files.map((f) => f.name)).toEqual(["01-openapi.json", "02-paths.json"]);
    expect(files.map((f) => f.transfer_id)).toEqual(["xfr_01", "xfr_02"]);
    expect(projected["steps.intake.artifact.assets.transfer_ids"]).toEqual(["xfr_01", "xfr_02"]);
    // References are immutable refs + digest/size; no absolute host path leaks.
    const blob = JSON.stringify(projected);
    expect(blob).not.toContain("/tmp/");
    expect(blob).not.toMatch(/[A-Za-z]:\\/);
  });

  test("compile-time lint rejects .path on a collection slot", () => {
    // A manifest that references the collection slot with the singleton .path
    // token lints as a cardinality mismatch.
    const manifest = parseFlowManifest(
      parseYaml(
        readFixture(".mrmr/flows/api-contract-review/flow.manifest.yaml").replace(
          "Human attaches 1–4 ordered OpenAPI fragment files.",
          "Human attaches 1–4 ordered OpenAPI fragment files. See {{murrmure.step.intake.artifact.assets.path}}",
        ),
      ),
    );
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;
    const { warnings } = compileStepContractCatalog(manifest.value, "flw_api_contract_review");
    expect(
      warnings.some(
        (w) =>
          w.code === "ARTIFACT_TOKEN_CARDINALITY_MISMATCH" &&
          w.message.includes("assets"),
      ),
    ).toBe(true);
  });
});
