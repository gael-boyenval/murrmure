import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { readSpaceLink, writeSpaceLink } from "../src/lib/space-link-file.js";

describe("space-link-file", () => {
  let projectDir = "";

  afterEach(() => {
    if (projectDir) {
      rmSync(projectDir, { recursive: true, force: true });
      projectDir = "";
    }
  });

  test("writes link block into .mrmr/space/space.yaml", () => {
    projectDir = mkdtempSync(join(tmpdir(), "cli-space-link-file-"));
    const spaceDir = join(projectDir, ".mrmr", "space");
    mkdirSync(spaceDir, { recursive: true });
    writeFileSync(join(spaceDir, "space.yaml"), "apiVersion: murrmure.space/v1\nslug: demo\n", "utf-8");

    writeSpaceLink(projectDir, {
      space_id: "spc_demo",
      host: "devbox.local",
      path: projectDir,
    });

    const written = parseYaml(readFileSync(join(spaceDir, "space.yaml"), "utf-8")) as {
      slug?: string;
      link?: { space_id?: string; host?: string };
    };
    expect(written.slug).toBe("demo");
    expect(written.link).toEqual({ space_id: "spc_demo", host: "devbox.local" });
  });

  test("reads link block from space.yaml", () => {
    projectDir = mkdtempSync(join(tmpdir(), "cli-space-link-file-"));
    const spaceDir = join(projectDir, ".mrmr", "space");
    mkdirSync(spaceDir, { recursive: true });
    writeFileSync(
      join(spaceDir, "space.yaml"),
      [
        "apiVersion: murrmure.space/v1",
        "slug: demo",
        "link:",
        "  space_id: spc_demo",
        "  host: devbox.local",
      ].join("\n"),
      "utf-8",
    );

    const link = readSpaceLink(projectDir);
    expect(link).toEqual({
      space_id: "spc_demo",
      host: "devbox.local",
      path: projectDir,
    });
  });
});
