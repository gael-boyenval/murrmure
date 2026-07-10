import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const HANDLERS_BRIDGE = join(REPO_ROOT, "studio-specs/current/bridges/handlers.md");

/** VS-0 entry gates — must be DECIDED before VS-1 starts. */
const REQUIRED_DECISIONS = [
  { id: "Q1", title: "link.host persistence" },
  { id: "Q3", title: "human-step keys in contract_keys" },
  { id: "Q4", title: "murrmure_invoke_action fate" },
  { id: "Q6", title: "dispatch token scope" },
  { id: "Q7", title: "complete: cli branch validation" },
] as const;

function sectionForQuestion(content: string, id: string): string {
  const header = `### ${id} —`;
  const start = content.indexOf(header);
  expect(start, `missing decision section ${id}`).toBeGreaterThanOrEqual(0);
  const nextHeader = content.indexOf("\n### Q", start + header.length);
  return nextHeader === -1 ? content.slice(start) : content.slice(start, nextHeader);
}

describe("handlers decision record (VS-0 gate)", () => {
  const content = readFileSync(HANDLERS_BRIDGE, "utf-8");

  test("handlers.md exists and documents decision record", () => {
    expect(content).toContain("## Decision record");
  });

  for (const { id, title } of REQUIRED_DECISIONS) {
    test(`${id} — ${title} is DECIDED`, () => {
      const section = sectionForQuestion(content, id);
      expect(section).toMatch(/\*\*Status:\*\*\s*DECIDED/);
    });
  }
});
