import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

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

  test.skip("Task 03 — exact Part 2 manifest normalizes and compiles", () => {});
  test.skip("Task 05 — every branch compiles one BranchResolveContract", () => {});
  test.skip("Task 11 — artifact collections retain local/federated boundaries", () => {});
});

