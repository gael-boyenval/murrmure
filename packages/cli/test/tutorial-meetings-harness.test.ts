import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, test } from "vitest";
import { verifyTutorialMeetingsDocs } from "./helpers/tutorial-meetings-docs.js";
import { loadTutorialMeetingsSnapshot } from "../../../test-utils/tutorial-meetings/snapshots.js";
import { parseFlowManifest } from "@murrmure/hub-core";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const FIXTURE_ROOT = join(REPO_ROOT, "test-utils/spaces/tutorial-meetings");

describe("Tutorial meetings harness", () => {
  test("progressive snapshots materialize two spaces", () => {
    const snapshots = [2, 3, 5, 6].map((part) =>
      loadTutorialMeetingsSnapshot(part as 2 | 3 | 5 | 6),
    );
    expect(snapshots.map((snapshot) => snapshot.part)).toEqual([2, 3, 5, 6]);
    for (let index = 1; index < snapshots.length; index += 1) {
      for (const path of Object.keys(snapshots[index - 1].files)) {
        expect(
          snapshots[index].files[path],
          `Part ${snapshots[index].part}: ${path}`,
        ).toBeDefined();
      }
    }

    for (const snapshot of snapshots) {
      const aggregate = Object.values(snapshot.files).join("\n");
      expect(aggregate).not.toMatch(/\bwait:\s/);
      expect(aggregate).not.toMatch(/\bgate:\s/);
    }
  });

  test("app flow parses with meeting facet; wait/gate banned", () => {
    for (const part of [3, 5, 6] as const) {
      const snapshot = loadTutorialMeetingsSnapshot(part);
      const raw = parseYaml(
        snapshot.files["meeting-app/.mrmr/flows/api-shape/flow.manifest.yaml"],
      ) as Record<string, unknown>;
      const parsed = parseFlowManifest(raw);
      expect(parsed.ok, `Part ${part} parses`).toBe(true);
      if (!parsed.ok) continue;
      const decide = parsed.value.steps.find((step) => step.id === "decide");
      expect(decide?.meeting, `Part ${part} decide.meeting`).toBeDefined();
      expect(JSON.stringify(raw)).not.toMatch(/\bwait:\s|\bgate:\s/);
    }
  });

  test("docs-proof registers every 1b page and matches fixture fences", () => {
    expect(verifyTutorialMeetingsDocs(REPO_ROOT)).toEqual([]);
  });

  test("acceptance schema and beat map cover Parts 1–7", () => {
    const schema = JSON.parse(
      readFileSync(join(FIXTURE_ROOT, "manual-acceptance.schema.json"), "utf8"),
    ) as { required: string[] };
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "task",
        "tutorial_chapters",
        "space_ids",
        "connection_ids",
        "session_ids",
        "run_ids",
        "evidence",
        "result",
      ]),
    );
    const beatMap = JSON.parse(
      readFileSync(join(FIXTURE_ROOT, "tutorial-beats.json"), "utf8"),
    ) as { beats: Array<{ chapters: number[]; automated: string[]; manual_only: string[] }> };
    expect(new Set(beatMap.beats.flatMap((beat) => beat.chapters))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7]),
    );
    for (const beat of beatMap.beats) {
      expect(beat.automated.length + beat.manual_only.length).toBeGreaterThan(0);
    }
  });

  test("fence registry exists", () => {
    expect(existsSync(join(FIXTURE_ROOT, "fences.json"))).toBe(true);
  });
});
