import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { foldJournalToSnapshot } from "../src/journal/fold.js";
import type { JournalEntry } from "../src/types/journal-entry.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const v09 = JSON.parse(
  readFileSync(join(__dir, "../../../studio-specs/current/fixtures/kernel/journal/v0.9-entry.json"), "utf-8"),
) as JournalEntry;

test("K16: v0.9 journal entry with minimal fields folds without error", () => {
  const entry: JournalEntry = {
    ...v09,
    aggregate_id: "agg_legacy",
    payload: {
      rule_ref: { rule_ref_id: "legacy", digest: "abc", version: "0.9.0" },
      initial_state: "idle",
      status: "active",
      metadata: {},
      revision: 0,
    },
  };
  const snap = foldJournalToSnapshot([entry], "agg_legacy");
  expect(snap?.state).toBe("idle");
  expect(snap?.revision).toBe(0);
});
