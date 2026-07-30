import { describe, expect, test } from "vitest";
import {
  createTemporaryTutorialGitRepository,
} from "../../../test-utils/tutorial-v3/helpers.js";
import { loadTutorialSnapshot } from "../../../test-utils/tutorial-v3/snapshots.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";

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
  test("Task 10 — clean repository archives and commits with build output tokens", () => {
    const repo = createTemporaryTutorialGitRepository(6);
    try {
      const runId = "run_HAPPY";
      const producer = seedRun(repo.spaceRoot, runId, repo.git);
      const writeSpec = repo.runWriteSpec(producer);
      expect(writeSpec.status, writeSpec.stderr).toBe(0);
      expect(readFileSync(join(repo.spaceRoot, "specs", "current", "spec.md"), "utf8")).toBe(SPEC_CONTENT);

      writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const hello = 'world';\n", "utf8");
      writeFileSync(join(repo.spaceRoot, "package.json"), JSON.stringify({ name: "demo" }, null, 2) + "\n", "utf8");

      const result = repo.runCleanup(runId, "feat: implement the spec", "Adds the thing the spec describes.");
      expect(result.status, result.stderr).toBe(0);

      const archiveAbs = join(repo.spaceRoot, "specs", "archive", "run_HAPPY.md");
      expect(existsSync(archiveAbs)).toBe(true);
      expect(readFileSync(archiveAbs, "utf8")).toBe(SPEC_CONTENT);
      expect(existsSync(join(repo.spaceRoot, "specs", "current", "spec.md"))).toBe(false);

      const msg = lastCommitMessage(repo.git);
      expect(msg.subject).toBe("feat: implement the spec");
      expect(msg.body).toBe("Adds the thing the spec describes.");

      const tracked = repo.git("ls-tree", "-r", "HEAD", "--name-only").split("\n").filter(Boolean);
      expect(tracked).toContain("specs/archive/run_HAPPY.md");
      expect(tracked).toContain("src/index.ts");
      expect(tracked).toContain("package.json");
      expect(tracked.some((p) => p.startsWith(".mrmr/dev/"))).toBe(false);

      expect(readFileSync(producer, "utf8")).toBe(SPEC_CONTENT);
      expect(existsSync(producer)).toBe(true);
    } finally {
      repo.cleanup();
    }
  });

  test("Task 10 — .mrmr/dev stays untracked after cleanup", () => {
    const repo = createTemporaryTutorialGitRepository(6);
    try {
      const producer = seedRun(repo.spaceRoot, "run_DEV", repo.git);
      expect(repo.runWriteSpec(producer).status).toBe(0);
      writeFile(join(repo.spaceRoot, "src", "index.ts"),"export const hello = 'world';\n", "utf8");
      const scratch = join(repo.spaceRoot, ".mrmr", "dev", "runs", "run_DEV", "steps", "build", "work", "out.log");
      mkdirSync(dirname(scratch), { recursive: true });
      writeFileSync(scratch, "build log\n", "utf8");

      const result = repo.runCleanup("run_DEV", "feat: x", "body");
      expect(result.status, result.stderr).toBe(0);
      const tracked = repo.git("ls-tree", "-r", "HEAD", "--name-only").split("\n").filter(Boolean);
      expect(tracked.some((p) => p.startsWith(".mrmr/dev/"))).toBe(false);
      expect(tracked).toContain("specs/archive/run_DEV.md");
      expect(tracked).toContain("src/index.ts");
      expect(existsSync(scratch)).toBe(true);
    } finally {
      repo.cleanup();
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

  test("Task 10 — missing identity, missing spec, and commit failure exit nonzero", () => {
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

  test("Task 10 — cleanup handler binds murrmure.step output tokens", () => {
    const snapshot = loadTutorialSnapshot(6);
    const handlersYaml = snapshot.files[".mrmr/space/handlers.yaml"];
    expect(snapshot.files[".mrmr/space/scripts/cleanup.mjs"]).toBeUndefined();

    expect(handlersYaml).toContain("id: cleanup_archive_commit");
    expect(handlersYaml).toContain("on: step.opened::my-dev-flow.cleanup");
    expect(handlersYaml).toMatch(/type:\s*shell_spawn/);
    expect(handlersYaml).toMatch(/complete:\s*auto/);
    expect(handlersYaml).not.toMatch(/kill_on/);

    expect(handlersYaml).toContain("{{murrmure.step.build.output.commit_message}}");
    expect(handlersYaml).toContain("{{murrmure.step.build.output.description}}");
    expect(handlersYaml).toContain("${MURRMURE_RUN_ID}");
    expect(handlersYaml).toContain("specs/archive/");
    expect(handlersYaml).not.toContain("{{steps.build.output");
    expect(handlersYaml).not.toContain("{{murrmure.run.id}}");
    expect(handlersYaml).not.toContain("git diff --quiet");
  });
});

