import { describe, expect, test } from "vitest";
import {
  createTemporaryTutorialGitRepository,
} from "../../../test-utils/tutorial-v3/helpers.js";
import { loadTutorialSnapshot } from "../../../test-utils/tutorial-v3/snapshots.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync, chmodSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const SPEC_CONTENT = "# The spec\nBuild me a tiny hello module.\n";

/** Path of the immutable producer artifact promoted under the ignored run-scratch tree. */
function producerArtifactPath(spaceRoot: string, runId: string): string {
  return join(spaceRoot, ".mrmr", "dev", "runs", runId, "steps", "intake", "spec", "spec.md");
}

/** Seed the producer artifact and run write_spec, leaving specs/current/spec.md on disk. */
function seedRun(spaceRoot: string, runId: string, git: (...a: string[]) => string): string {
  const producer = producerArtifactPath(spaceRoot, runId);
  mkdirSync(dirname(producer), { recursive: true });
  writeFileSync(producer, SPEC_CONTENT, "utf8");
  return producer;
}

/** Parse the last commit's subject and body. */
function lastCommitMessage(git: (...a: string[]) => string): { subject: string; body: string } {
  const subject = git("log", "-1", "--format=%s");
  const body = git("log", "-1", "--format=%b");
  return { subject, body };
}

/** Write a file, creating parent directories as needed. */
function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

describe("Tutorial v3 repository conformance", () => {
  test("Task 10 — clean repository archives and commits owned paths", () => {
    const repo = createTemporaryTutorialGitRepository(6);
    try {
      const runId = "run_HAPPY";
      const producer = seedRun(repo.spaceRoot, runId, repo.git);
      // write_spec is the first mutating handler: preflight passes on a clean tree.
      const writeSpec = repo.runWriteSpec(producer);
      expect(writeSpec.status, writeSpec.stderr).toBe(0);
      expect(readFileSync(join(repo.spaceRoot, "specs", "current", "spec.md"), "utf8")).toBe(SPEC_CONTENT);

      // build produces workflow-owned outputs: a new src file, package.json, and lockfile.
      writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const hello = 'world';\n", "utf8");
      writeFileSync(join(repo.spaceRoot, "package.json"), JSON.stringify({ name: "demo" }, null, 2) + "\n", "utf8");
      writeFileSync(join(repo.spaceRoot, "pnpm-lock.yaml"), "# demo lockfile\n", "utf8");

      const result = repo.runCleanup(runId, "feat: implement the spec", "Adds the thing the spec describes.");
      expect(result.status, result.stderr).toBe(0);

      // The cleanup script prints git's commit banner (stdio: inherit) before the
      // structured JSON line, so the JSON is the last non-empty line of stdout.
      const jsonLine = result.stdout.split("\n").filter((l) => l.trim().length > 0).pop() ?? "";
      const output = JSON.parse(jsonLine) as {
        commit_sha: string;
        staged_paths: string[];
        archive_path: string;
      };
      expect(output.archive_path).toBe("specs/archive/run_HAPPY.md");

      // The archive holds the exact spec content, and specs/current is emptied.
      const archiveAbs = join(repo.spaceRoot, "specs", "archive", "run_HAPPY.md");
      expect(existsSync(archiveAbs)).toBe(true);
      expect(readFileSync(archiveAbs, "utf8")).toBe(SPEC_CONTENT);
      expect(existsSync(join(repo.spaceRoot, "specs", "current", "spec.md"))).toBe(false);

      // Exactly the allowlisted paths are staged — nothing more, nothing less.
      expect(output.staged_paths.sort()).toEqual(
        ["specs/archive/run_HAPPY.md", "src/index.ts", "package.json", "pnpm-lock.yaml"].sort(),
      );

      // The SHA is the real new HEAD, and the commit message is wired from build output.
      expect(output.commit_sha).toBe(repo.git("rev-parse", "HEAD"));
      const msg = lastCommitMessage(repo.git);
      expect(msg.subject).toBe("feat: implement the spec");
      expect(msg.body).toBe("Adds the thing the spec describes.");

      // The committed tree contains only owned paths; .mrmr/dev never enters the index.
      const tracked = repo.git("ls-tree", "-r", "HEAD", "--name-only").split("\n").filter(Boolean);
      expect(tracked).toContain("specs/archive/run_HAPPY.md");
      expect(tracked).toContain("src/index.ts");
      expect(tracked).toContain("package.json");
      expect(tracked).toContain("pnpm-lock.yaml");
      expect(tracked.some((p) => p.startsWith(".mrmr/dev/"))).toBe(false);

      // The original run artifact remains immutable and on disk under ignored scratch.
      expect(readFileSync(producer, "utf8")).toBe(SPEC_CONTENT);
      expect(existsSync(producer)).toBe(true);
    } finally {
      repo.cleanup();
    }
  });
  test("Task 10 — dirty repository fails before mutation", () => {
    // Staged change: a tracked space file is modified and `git add`-ed before the run.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_STAGED", repo.git);
        const handlers = join(repo.spaceRoot, ".mrmr", "space", "handlers.yaml");
        writeFileSync(handlers, readFileSync(handlers, "utf8") + "\n# staged dirt\n", "utf8");
        repo.git("add", "--", ".mrmr/space/handlers.yaml");
        const result = repo.runWriteSpec(producer);
        expect(result.status, result.stderr).not.toBe(0);
        // No mutation: specs/current/spec.md was never created.
        expect(existsSync(join(repo.spaceRoot, "specs", "current", "spec.md"))).toBe(false);
        expect(existsSync(join(repo.spaceRoot, "specs", "archive", "run_STAGED.md"))).toBe(false);
      } finally {
        repo.cleanup();
      }
    }

    // Unstaged change: a tracked file is modified but not staged.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_UNSTAGED", repo.git);
        writeFileSync(
          join(repo.spaceRoot, ".mrmr", "space", "handlers.yaml"),
          readFileSync(join(repo.spaceRoot, ".mrmr", "space", "handlers.yaml"), "utf8") + "\n# unstaged dirt\n",
          "utf8",
        );
        const result = repo.runWriteSpec(producer);
        expect(result.status, result.stderr).not.toBe(0);
        expect(existsSync(join(repo.spaceRoot, "specs", "current", "spec.md"))).toBe(false);
      } finally {
        repo.cleanup();
      }
    }

    // Non-ignored untracked file: a stray file appears in the tree.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_UNTRACKED", repo.git);
        writeFileSync(join(repo.spaceRoot, "stray.txt"), "not owned\n", "utf8");
        const result = repo.runWriteSpec(producer);
        expect(result.status, result.stderr).not.toBe(0);
        expect(existsSync(join(repo.spaceRoot, "specs", "current", "spec.md"))).toBe(false);
      } finally {
        repo.cleanup();
      }
    }

    // Ignored untracked file: .mrmr/dev scratch does not count as dirt — mutation proceeds.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_IGNORED", repo.git);
        const result = repo.runWriteSpec(producer);
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(join(repo.spaceRoot, "specs", "current", "spec.md"), "utf8")).toBe(SPEC_CONTENT);
      } finally {
        repo.cleanup();
      }
    }
  });
  test("Task 10 — broad staging and .mrmr/dev commits are impossible", () => {
    // A disallowed changed path (credentials) alongside owned outputs: cleanup throws
    // before `git add`, so nothing is staged or committed.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_CRED", repo.git);
        expect(repo.runWriteSpec(producer).status).toBe(0);
        writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const hello = 'world';\n", "utf8");
        writeFileSync(join(repo.spaceRoot, "credentials.env"), "SECRET=do-not-commit\n", "utf8");
        const headBefore = repo.git("rev-parse", "HEAD");
        const result = repo.runCleanup("run_CRED", "feat: x", "body");
        expect(result.status, result.stderr).not.toBe(0);
        // No new commit and nothing staged.
        expect(repo.git("rev-parse", "HEAD")).toBe(headBefore);
        expect(repo.git("diff", "--cached", "--name-only")).toBe("");
        expect(result.stderr).toContain("workflow does not own changed paths");
      } finally {
        repo.cleanup();
      }
    }

    // .mrmr/dev scratch and ignored paths never enter the index even on a clean run.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_DEV", repo.git);
        expect(repo.runWriteSpec(producer).status).toBe(0);
        writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const hello = 'world';\n", "utf8");
        // Extra ignored scratch under .mrmr/dev that cleanup must not stage or delete.
        const scratch = join(repo.spaceRoot, ".mrmr", "dev", "runs", "run_DEV", "steps", "build", "work", "out.log");
        mkdirSync(dirname(scratch), { recursive: true });
        writeFileSync(scratch, "build log\n", "utf8");

        const result = repo.runCleanup("run_DEV", "feat: x", "body");
        expect(result.status, result.stderr).toBe(0);
        const tracked = repo.git("ls-tree", "-r", "HEAD", "--name-only").split("\n").filter(Boolean);
        expect(tracked.some((p) => p.startsWith(".mrmr/dev/"))).toBe(false);
        expect(tracked).toContain("specs/archive/run_DEV.md");
        expect(tracked).toContain("src/index.ts");
        // Ignored scratch survives on disk.
        expect(existsSync(scratch)).toBe(true);
      } finally {
        repo.cleanup();
      }
    }
  });

  test("Task 10 — shell metacharacters and multiline commit data remain literal", () => {
    const repo = createTemporaryTutorialGitRepository(6);
    try {
      const producer = seedRun(repo.spaceRoot, "run_META", repo.git);
      expect(repo.runWriteSpec(producer).status).toBe(0);
      writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const x = 1;\n", "utf8");

      // Subject carries shell metacharacters (no newline); body carries newlines.
      const subject = "feat: `$(whoami)` > $HOME & ; | rm -rf ~";
      const description = "Line one\nLine two\n\n- bullet a\n- bullet b";
      const result = repo.runCleanup("run_META", subject, description);
      expect(result.status, result.stderr).toBe(0);

      const msg = lastCommitMessage(repo.git);
      expect(msg.subject).toBe(subject);
      expect(msg.body).toBe(description);
    } finally {
      repo.cleanup();
    }
  });

  test("Task 10 — missing identity, non-Git directory, collision, no-op, and commit failure exit nonzero", () => {
    // Missing identity: unset local identity and isolate HOME so commit fails.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_NOID", repo.git);
        expect(repo.runWriteSpec(producer).status).toBe(0);
        writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const x = 1;\n", "utf8");
        repo.git("config", "--unset", "user.name");
        repo.git("config", "--unset", "user.email");
        const headBefore = repo.git("rev-parse", "HEAD");
        const result = repo.runCleanup("run_NOID", "feat: x", "body", {
          env: {
            HOME: repo.root,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_AUTHOR_NAME: "",
            GIT_AUTHOR_EMAIL: "",
            GIT_COMMITTER_NAME: "",
            GIT_COMMITTER_EMAIL: "",
          },
        });
        expect(result.status, result.stderr).not.toBe(0);
        expect(repo.git("rev-parse", "HEAD")).toBe(headBefore);
      } finally {
        repo.cleanup();
      }
    }

    // Non-Git directory: cleanup runs outside any repository; git status fails.
    {
      const nonGit = mkdtempSync(join(tmpdir(), "murrmure-tutorial-v3-nogit-"));
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        mkdirSync(join(nonGit, "specs", "current"), { recursive: true });
        writeFileSync(join(nonGit, "specs", "current", "spec.md"), SPEC_CONTENT, "utf8");
        const cleanupScript = join(repo.spaceRoot, ".mrmr", "space", "scripts", "cleanup.mjs");
        const result = spawnSync("node", [cleanupScript, "run_NOGIT", "feat: x", "body"], {
          cwd: nonGit,
          encoding: "utf8",
        });
        expect(result.status, result.stderr ?? "").not.toBe(0);
        expect(existsSync(join(nonGit, ".git"))).toBe(false);
      } finally {
        repo.cleanup();
        rmSync(nonGit, { recursive: true, force: true });
      }
    }

    // Archive collision: the run-ID archive already exists; cleanup throws before rename.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_COLLIDE", repo.git);
        expect(repo.runWriteSpec(producer).status).toBe(0);
        const archive = join(repo.spaceRoot, "specs", "archive", "run_COLLIDE.md");
        mkdirSync(dirname(archive), { recursive: true });
        writeFileSync(archive, "pre-existing\n", "utf8");
        const headBefore = repo.git("rev-parse", "HEAD");
        const result = repo.runCleanup("run_COLLIDE", "feat: x", "body");
        expect(result.status, result.stderr).not.toBe(0);
        expect(repo.git("rev-parse", "HEAD")).toBe(headBefore);
        expect(readFileSync(archive, "utf8")).toBe("pre-existing\n");
        // specs/current/spec.md was not moved away (rename never ran).
        expect(existsSync(join(repo.spaceRoot, "specs", "current", "spec.md"))).toBe(true);
      } finally {
        repo.cleanup();
      }
    }

    // No-op: no spec to archive (specs/current/spec.md missing) → ENOENT, nonzero.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const x = 1;\n", "utf8");
        const headBefore = repo.git("rev-parse", "HEAD");
        const result = repo.runCleanup("run_NOOP", "feat: x", "body");
        expect(result.status, result.stderr).not.toBe(0);
        expect(repo.git("rev-parse", "HEAD")).toBe(headBefore);
        expect(existsSync(join(repo.spaceRoot, "specs", "archive", "run_NOOP.md"))).toBe(false);
      } finally {
        repo.cleanup();
      }
    }

    // Commit failure: a failing pre-commit hook makes `git commit` exit nonzero.
    {
      const repo = createTemporaryTutorialGitRepository(6);
      try {
        const producer = seedRun(repo.spaceRoot, "run_HOOK", repo.git);
        expect(repo.runWriteSpec(producer).status).toBe(0);
        writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const x = 1;\n", "utf8");
        const hook = join(repo.spaceRoot, ".git", "hooks", "pre-commit");
        writeFileSync(hook, "#!/bin/sh\necho 'blocked' >&2\nexit 1\n", "utf8");
        chmodSync(hook, 0o755);
        const headBefore = repo.git("rev-parse", "HEAD");
        const result = repo.runCleanup("run_HOOK", "feat: x", "body");
        expect(result.status, result.stderr).not.toBe(0);
        expect(repo.git("rev-parse", "HEAD")).toBe(headBefore);
      } finally {
        repo.cleanup();
      }
    }
  });

  test("Task 10 — tutorial run policy serializes the flow (Task 09 dependency)", () => {
    // The Part 6 fixture carries the space-owned run policy that denies a second
    // concurrent run before any repository mutation — the Task 09 capacity gate.
    const snapshot = loadTutorialSnapshot(6);
    const handlersYaml = snapshot.files[".mrmr/space/handlers.yaml"];
    expect(handlersYaml).toMatch(/run_policies:\s*\n\s*-\s*flow:\s*my-dev-flow\s*\n\s*max_concurrent_runs:\s*1\b/);
    // The portable flow manifest carries no concurrency policy.
    const manifest = snapshot.files[".mrmr/flows/my-dev-flow/flow.manifest.yaml"];
    expect(manifest).not.toMatch(/\brun_policies\b/);
    expect(manifest).not.toMatch(/\bmax_concurrent_runs\b/);
  });

  test("Task 10 — cleanup handler binds safe staging tokens and a clean-worktree preflight", () => {
    const snapshot = loadTutorialSnapshot(6);
    const handlersYaml = snapshot.files[".mrmr/space/handlers.yaml"];
    const cleanupScript = snapshot.files[".mrmr/space/scripts/cleanup.mjs"];

    // The cleanup handler binds the canonical cleanup step as an auto-completing shell_spawn resolver.
    expect(handlersYaml).toContain("id: cleanup_archive_commit");
    expect(handlersYaml).toContain("on: step.opened::my-dev-flow.cleanup");
    expect(handlersYaml).toMatch(/type:\s*shell_spawn/);
    expect(handlersYaml).toMatch(/complete:\s*auto/);
    expect(handlersYaml).not.toMatch(/kill_on/);

    // Prior build output is wired through safe complete-argument tokens (no raw interpolation).
    expect(handlersYaml).toContain("node .mrmr/space/scripts/cleanup.mjs");
    expect(handlersYaml).toContain("{{murrmure.run.id}}");
    expect(handlersYaml).toContain("{{steps.build.output.commit_message}}");
    expect(handlersYaml).toContain("{{steps.build.output.description}}");
    // The authored command never broad-stages; staging lives in the allowlisted script.
    expect(handlersYaml).not.toMatch(/git add -A/);
    expect(handlersYaml).not.toMatch(/git add \./);

    // The first mutating handler (write_spec) preflights a clean worktree before mutation.
    expect(handlersYaml).toContain("git diff --quiet");
    expect(handlersYaml).toContain("git diff --cached --quiet");
    expect(handlersYaml).toContain('test -z "$(git ls-files --others --exclude-standard)"');

    // The cleanup script stages only an explicit allowlist — never `git add -A`/`.`.
    expect(cleanupScript).toMatch(/git", \["add", "--",/);
    expect(cleanupScript).not.toMatch(/git add -A/);
    expect(cleanupScript).not.toMatch(/git", \["add", "\."\]/);
    expect(cleanupScript).not.toMatch(/git", \["add", "-A"\]/);
    // It validates the run id, commit subject/body before mutating, and emits structured output.
    expect(cleanupScript).toMatch(/invalid run id/);
    expect(cleanupScript).toMatch(/invalid commit subject/);
    expect(cleanupScript).toMatch(/invalid commit description/);
    expect(cleanupScript).toMatch(/commit_sha/);
    expect(cleanupScript).toMatch(/staged_paths/);
    expect(cleanupScript).toMatch(/archive_path/);
  });

  test("Task 10 — tutorial surfaces ban broad staging (git add -A / git add .)", () => {
    // No tutorial v3 surface may teach broad staging; only explicit allowlisted pathspecs.
    const roots = [
      resolve(import.meta.dirname, "../../../apps/docs/guide/tutorials/01-local-preview-review-v3"),
      resolve(import.meta.dirname, "../../../test-utils/spaces/tutorial-v3"),
    ];
    const broadStaging = /\bgit add(?:\s+-A\b|\s+--all\b|\s+\.(?:\s|$|["'`]))/;
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "dist") continue;
        const path = join(dir, entry);
        const stat = statSync(path);
        if (stat.isDirectory()) walk(path);
        else if (/\.(?:md|json|mjs|ya?ml|ts)$/.test(entry)) files.push(path);
      }
    };
    for (const root of roots) if (existsSync(root)) walk(root);
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const match = content.match(broadStaging);
      if (match) violations.push(`${file}: ${match[0]}`);
    }
    expect(violations, "tutorial surfaces must not teach broad staging").toEqual([]);
  });
});

