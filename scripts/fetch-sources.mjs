import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectsYaml = readFileSync(join(root, "projects.yaml"), "utf8");
const repos = [...projectsYaml.matchAll(/^\s*github_id:\s*(\S+)/gm)].map((m) => m[1]);

if (repos.length === 0) {
  console.error("No github_id entries found in projects.yaml");
  process.exit(1);
}

const opensrcBin = join(root, "node_modules", ".bin", "opensrc");
const env = { ...process.env, OPENSRC_HOME: join(root, ".opensrc") };
const failures = [];

for (const repo of repos) {
  process.stderr.write(`Fetching ${repo}...\n`);
  const result = spawnSync(opensrcBin, ["path", repo], { cwd: root, env, encoding: "utf8" });
  if (result.status !== 0) {
    failures.push({ repo, stderr: result.stderr?.trim() || result.error?.message });
    continue;
  }
  process.stdout.write(`${repo} → ${result.stdout.trim()}\n`);
}

if (failures.length > 0) {
  for (const { repo, stderr } of failures) {
    console.error(`FAILED ${repo}: ${stderr}`);
  }
  process.exit(1);
}
