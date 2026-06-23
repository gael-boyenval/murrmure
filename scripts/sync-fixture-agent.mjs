#!/usr/bin/env node
/**
 * Materialize project-local Cursor agent config under fixtures/demo/.cursor/
 * from the canonical skill + MCP templates. Regenerated on each fixture build.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(REPO_ROOT, "fixtures", "demo");
const CURSOR_DIR = join(FIXTURE_DIR, ".cursor");
const SKILL_DIR = join(CURSOR_DIR, "skills", "studio-review");

const SKILL_SRC = join(REPO_ROOT, "skills", "studio-review", "SKILL.md");
const CONTEXT_SRC = join(REPO_ROOT, "integrations", "cursor", "fixture-context.md");

const mcpConfig = {
  mcpServers: {
    studio: {
      command: "pnpm",
      args: ["--dir", REPO_ROOT, "exec", "studio", "mcp"],
      env: {},
    },
  },
};

async function main() {
  const [skill, context] = await Promise.all([
    readFile(SKILL_SRC, "utf8"),
    readFile(CONTEXT_SRC, "utf8"),
  ]);

  await mkdir(SKILL_DIR, { recursive: true });

  await writeFile(join(CURSOR_DIR, "mcp.json"), `${JSON.stringify(mcpConfig, null, 2)}\n`);
  await writeFile(join(SKILL_DIR, "SKILL.md"), `${skill.trimEnd()}\n\n${context.trimEnd()}\n`);

  console.log(`[fixture] synced agent config → ${join(FIXTURE_DIR, ".cursor")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
