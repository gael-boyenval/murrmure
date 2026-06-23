import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("feature-spec contract", () => {
  const contract = JSON.parse(readFileSync(join(root, "contract", "contract.json"), "utf-8")) as {
    initial_state: string;
    states: Array<{ id: string }>;
    transitions: Array<{ from: string | null; to: string }>;
  };

  test("every declared state is reachable from initial_state", () => {
    const reachable = new Set<string>([contract.initial_state]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of contract.transitions) {
        if ((t.from === null || reachable.has(t.from)) && !reachable.has(t.to)) {
          reachable.add(t.to);
          changed = true;
        }
      }
    }
    for (const state of contract.states) {
      expect(reachable.has(state.id)).toBe(true);
    }
  });
});
