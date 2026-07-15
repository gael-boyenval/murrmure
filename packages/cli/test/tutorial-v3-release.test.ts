import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const FIXTURE_ROOT = join(REPO_ROOT, "test-utils/spaces/tutorial-v3");

type SchemaNode = {
  type?: string;
  enum?: unknown[];
  required?: string[];
  additionalProperties?: boolean | SchemaNode;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  minItems?: number;
  uniqueItems?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  pattern?: string;
};

/** Focused JSON-Schema (draft 2020-12 subset) validator for the tutorial v3
 * manual-acceptance schema. Self-contained so the release gate does not depend
 * on a transitive ajv dependency; the schema uses only the keywords below. */
function validateSchema(
  value: unknown,
  schema: SchemaNode,
  path: string,
  errors: string[],
): void {
  if (schema.type) {
    const t = schema.type;
    const ok =
      (t === "object" &&
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)) ||
      (t === "array" && Array.isArray(value)) ||
      (t === "string" && typeof value === "string") ||
      (t === "integer" &&
        typeof value === "number" &&
        Number.isInteger(value)) ||
      (t === "number" && typeof value === "number");
    if (!ok) {
      errors.push(
        `${path}: expected ${t}, got ${
          Array.isArray(value) ? "array" : value === null ? "null" : typeof value
        }`,
      );
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(
      `${path}: ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`,
    );
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) errors.push(`${path}: missing required "${key}"`);
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = schema.properties ? Object.keys(schema.properties) : [];
      for (const key of Object.keys(obj)) {
        if (!allowed.includes(key)) {
          errors.push(`${path}: additional property "${key}" not allowed`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in obj) validateSchema(obj[key], sub, `${path}.${key}`, errors);
      }
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: expected minItems ${schema.minItems}, got ${value.length}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set<string>();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push(`${path}: duplicate item ${key}`);
        seen.add(key);
      }
    }
    if (schema.items) {
      value.forEach((item, i) =>
        validateSchema(item, schema.items!, `${path}[${i}]`, errors),
      );
    }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: expected minLength ${schema.minLength}, got ${value.length}`);
    }
    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) {
        errors.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
      }
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: expected minimum ${schema.minimum}, got ${value}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: expected maximum ${schema.maximum}, got ${value}`);
    }
  }
}

const SIGNED_RELEASE_MANUAL = [
  "signed-release:notarization-gatekeeper",
  "signed-release:keychain-locked-prompt",
  "signed-release:actual-upgrade",
  "signed-release:integration-reload-verification",
];

describe("Tutorial v3 release acceptance (Task 14)", () => {
  test("Task 14 — manual acceptance template validates against the schema", () => {
    const schemaPath = join(FIXTURE_ROOT, "manual-acceptance.schema.json");
    const templatePath = join(FIXTURE_ROOT, "manual-acceptance.template.json");
    expect(existsSync(schemaPath), "schema exists").toBe(true);
    expect(existsSync(templatePath), "template exists").toBe(true);

    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as SchemaNode;
    const template = JSON.parse(readFileSync(templatePath, "utf8")) as Record<
      string,
      unknown
    >;

    const errors: string[] = [];
    validateSchema(template, schema, "<template>", errors);
    expect(errors, errors.join("\n")).toEqual([]);

    // The release template exercises the full Parts 1–6 acceptance path and
    // names every signed-release-only evidence kind the contracts limit manual
    // release evidence to (matched by human-readable concept, not slug).
    expect(template.tutorial_chapters).toEqual([1, 2, 3, 4, 5, 6]);
    expect(template.environment).toMatchObject({
      execution: "signed-release",
    });
    const summaries = (template.evidence as Array<{ summary?: string }>)
      .map((e) => e.summary ?? "")
      .join("\n");
    const signedReleaseConcepts = [
      "notarization",
      "Keychain",
      "upgrade",
      "integration",
    ];
    for (const concept of signedReleaseConcepts) {
      expect(
        summaries,
        `template references signed-release ${concept}`,
      ).toContain(concept);
    }
  });

  test("Task 14 — docs navigation treats Tutorial v3 as the canonical introductory path", () => {
    const configPath = join(REPO_ROOT, "apps/docs/.vitepress/config.ts");
    const config = readFileSync(configPath, "utf8");
    // The v3 tutorial is listed before the v2 full tutorial in the sidebar.
    const v3Index = config.indexOf("01-local-preview-review-v3/");
    const v2FullIndex = config.indexOf("01-local-preview-review/");
    expect(v3Index, "v3 tutorial is in the sidebar").toBeGreaterThan(-1);
    expect(v2FullIndex, "v2 full tutorial is in the sidebar").toBeGreaterThan(-1);
    expect(v3Index, "v3 tutorial precedes the v2 full tutorial").toBeLessThan(
      v2FullIndex,
    );
    expect(config).toContain("1a — First flow (v3)");

    const tutorialsIndex = readFileSync(
      join(REPO_ROOT, "apps/docs/guide/tutorials/index.md"),
      "utf8",
    );
    expect(tutorialsIndex).toContain("First flow (v3) — start here");
    expect(tutorialsIndex).toContain("Recommended order: **1a → 1b → 2 → 3**");
  });

  test("Task 14 — release notes and the one-time clean-slate reset procedure are published", () => {
    const changelog = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");
    expect(changelog, "Task 14 release entry").toMatch(/Task 14/i);
    // The one-time local reset procedure: move ~/.murrmure aside before relaunch.
    expect(changelog, "reset procedure moves ~/.murrmure aside").toContain(
      "~/.murrmure",
    );
    expect(changelog).toMatch(/move.*~\/\.murrmure.*aside|~\/\.murrmure.*aside/i);
  });

  test("Task 14 — release beat maps Parts 1–6 to automated and signed-release manual evidence", () => {
    const beats = JSON.parse(
      readFileSync(join(FIXTURE_ROOT, "tutorial-beats.json"), "utf8"),
    ) as {
      beats: Array<{
        id: string;
        chapters: number[];
        owner: string;
        automated: string[];
        manual_only: string[];
      }>;
    };
    const release = beats.beats.find((b) => b.id === "parts-1-6-release");
    expect(release, "parts-1-6-release beat exists").toBeDefined();
    expect(release!.chapters).toEqual([1, 2, 3, 4, 5, 6]);
    expect(release!.owner).toBe("14");
    // Deterministic packaged Desktop smoke is automated; the signed-release
    // checks remain manual-only evidence.
    expect(release!.automated).toContain("tutorial-v3-packaged.test.ts");
    expect(release!.manual_only.sort()).toEqual(
      [...SIGNED_RELEASE_MANUAL].sort(),
    );
  });

  test("Task 14 — deterministic packaged Desktop smoke is active; only the signed-release Parts 1–6 run is manual", () => {
    const packaged = readFileSync(
      join(REPO_ROOT, "apps/desktop/test/tutorial-v3-packaged.test.ts"),
      "utf8",
    );
    // Deterministic release smoke that runs in CI is active (not skipped).
    expect(packaged).toMatch(/test\("Task 01 — packaged Desktop boots/);
    expect(packaged).toMatch(
      /test\("Task 04 — packaged shell ships the hardened view host/,
    );
    expect(packaged).toMatch(
      /test\("Task 04 — exact tutorial intake View opens in production via the packaged hub/,
    );
    // The only skipped beat is the signed-release Parts 1–6 path through
    // packaged Desktop, owned by Task 14.
    const skips = packaged.match(/test\.skip\("Task \d+ — [^"]+"/g) ?? [];
    expect(skips).toEqual([
      'test.skip("Task 14 — Parts 1–6 execute through packaged Desktop"',
    ]);
  });
});
