import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  buildHandlerIndex,
  matchStepOpenedHandlers,
  parseHandlersFile,
  validateHandlerBindings,
  materializeConsumerCopy,
  consumerInputPath,
} from "@murrmure/hub-core";
import { parseHandlerStepBinding } from "@murrmure/contracts";
import {
  compileStepContractCatalog,
  buildStepContractSlice,
  renderAgentStepContractMarkdown,
  renderMurrmureProtocolEnvelope,
  parseFlowManifest,
} from "@murrmure/hub-core";
import { loadTutorialSnapshot } from "../../../test-utils/tutorial-v3/snapshots.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const ALIAS = "my-dev-flow.intake";

describe("Tutorial v3 handler conformance", () => {
  test("Task 04 — readable aliases resolve to one canonical View handler", () => {
    const snapshot = loadTutorialSnapshot(3);
    const handlersYaml = snapshot.files[".mrmr/space/handlers.yaml"];

    // The exact tutorial handler binds the canonical `on::key` alias — not bare
    // `step.opened`, and not dispatch through `contract_keys`.
    expect(handlersYaml).toContain(`on: step.opened::${ALIAS}`);
    expect(handlersYaml).not.toMatch(/\bon: step\.opened\b(?!::)/);
    expect(handlersYaml).toContain("type: view_resolver");
    expect(handlersYaml).toContain("view: spec-intake");
    expect(handlersYaml).not.toMatch(/kill_on|contract_keys:/);

    // The alias parses to one canonical step identity.
    expect(parseHandlerStepBinding(`step.opened::${ALIAS}`)).toEqual({
      lifecycle: "opened",
      alias: ALIAS,
    });

    // The authored handler strict-parses and indexes to exactly one step.opened
    // resolver for the canonical step.
    const parsed = parseHandlersFile(parseYaml(handlersYaml));
    expect(parsed.ok, "handlers.yaml strict-parses").toBe(true);
    if (!parsed.ok) return;
    const index = buildHandlerIndex(parsed.value);
    const opened = matchStepOpenedHandlers(index, ALIAS);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ type: "view_resolver", view: "spec-intake" });
    // No other step.opened resolver binds the same canonical step.
    expect(
      parsed.value.handlers.filter(
        (h) => parseHandlerStepBinding(h.on)?.lifecycle === "opened",
      ),
    ).toHaveLength(1);

    // The atomic binding gate accepts the canonical binding against a built View
    // and the candidate flow, and rejects a duplicate resolver, an orphan alias,
    // and a missing View.
    const handlers = parsed.value.handlers;
    const flows = [{ name: "my-dev-flow", step_ids: ["intake"] }];
    const builtView = { view_id: "spec-intake", build: { dist_present: true, entry_present: true } };

    expect(validateHandlerBindings({ handlers, flows, views: [builtView] })).toEqual({ ok: true });

    const duplicate = validateHandlerBindings({
      handlers: [
        ...handlers,
        { id: "dup", on: `step.opened::${ALIAS}`, type: "view_resolver", view: "spec-intake" },
      ],
      flows,
      views: [builtView],
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("HANDLER_RESOLVER_CONFLICT");

    const orphan = validateHandlerBindings({
      handlers: [{ id: "stale", on: "step.opened::renamed-flow.intake", type: "view_resolver", view: "spec-intake" }],
      flows,
      views: [builtView],
    });
    expect(orphan.ok).toBe(false);
    if (!orphan.ok) expect(orphan.code).toBe("HANDLER_ORPHAN_ALIAS");

    const missingView = validateHandlerBindings({
      handlers,
      flows,
      views: [],
    });
    expect(missingView.ok).toBe(false);
    if (!missingView.ok) expect(missingView.code).toBe("VIEW_RESOLVER_VIEW_NOT_FOUND");
  });

  test("Task 04 — dev fixture branches match the compiled reference manifest", () => {
    const snapshot = loadTutorialSnapshot(3);

    // Compile the reference catalog from the tutorial manifest.
    const manifestResult = parseFlowManifest(
      parseYaml(snapshot.files[".mrmr/flows/my-dev-flow/flow.manifest.yaml"]),
    );
    expect(manifestResult.ok, "manifest parses").toBe(true);
    if (!manifestResult.ok) return;
    const { catalog } = compileStepContractCatalog(manifestResult.value, "flw_my_dev_flow");
    expect(catalog, "catalog compiles").not.toBeNull();
    if (!catalog) return;

    const intake = catalog.entries.find((e) => e.step_id === "intake");
    expect(intake, "intake step in catalog").toBeDefined();
    if (!intake) return;
    const manifestBranchNames = Object.keys(intake.branches ?? {}).sort();

    // The dev fixture's branch contracts are tied to the compiled catalog —
    // fixtures never free-float or override the server projection.
    const fixture = JSON.parse(
      snapshot.files[".mrmr/views/spec-intake/dev/fixtures/intake.json"],
    ) as { step?: { branches?: Array<{ branch: string }> } };
    expect(Array.isArray(fixture.step?.branches)).toBe(true);
    const fixtureBranchNames = (fixture.step?.branches ?? [])
      .map((b) => b.branch)
      .sort();
    expect(fixtureBranchNames).toEqual(manifestBranchNames);
    expect(fixtureBranchNames).toEqual(["cancel", "continue"]);
  });

  test("Task 06 — Part 5 copy materializes and quotes one safe argument", async () => {
    const snapshot = loadTutorialSnapshot(5);
    const handlersYaml = snapshot.files[".mrmr/space/handlers.yaml"];

    // The exact Tutorial Part 5 copy handler binds the canonical write_spec
    // step as an auto-completing shell_spawn resolver, with no authored kill_on.
    expect(handlersYaml).toContain(`on: step.opened::my-dev-flow.write_spec`);
    expect(handlersYaml).toMatch(/type:\s*shell_spawn/);
    expect(handlersYaml).toMatch(/complete:\s*auto/);
    expect(handlersYaml).not.toMatch(/kill_on/);

    // The authored command copies one artifact via the singleton `.path`
    // placeholder, which must occupy one complete unquoted argument — never
    // quoted and never embedded in another token.
    expect(handlersYaml).toContain(
      "cp {{murrmure.step.intake.artifact.spec.path}} specs/current/spec.md",
    );
    expect(handlersYaml).not.toMatch(
      /['"]\{\{murrmure\.step\.intake\.artifact\.spec\.path\}\}['"]/,
    );
    expect(handlersYaml).not.toMatch(
      /=\{\{murrmure\.step\.intake\.artifact\.spec\.path\}\}/,
    );

    // The authored handler strict-parses and indexes to exactly one step.opened
    // resolver for the canonical write_spec step.
    const parsed = parseHandlersFile(parseYaml(handlersYaml));
    expect(parsed.ok, "handlers.yaml strict-parses").toBe(true);
    if (!parsed.ok) return;
    const index = buildHandlerIndex(parsed.value);
    const opened = matchStepOpenedHandlers(index, "my-dev-flow.write_spec");
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ type: "shell_spawn", complete: "auto" });

    // Materialize one verified run-scoped consumer copy from the producer
    // artifact and confirm the canonical consumer path, digest match, and
    // source immutability — the runtime injects this single path as the one
    // safe shell-quoted argument.
    const spaceRoot = mkdtempSync(join(tmpdir(), "murrmure-t06-conf-"));
    try {
      const runId = "demo";
      const producerRel = join(
        ".mrmr",
        "dev",
        "runs",
        "run_demo",
        "steps",
        "intake",
        "spec",
        "spec.md",
      );
      const producerAbs = join(spaceRoot, producerRel);
      const content = "# Part 5 spec\n";
      mkdirSync(dirname(producerAbs), { recursive: true });
      writeFileSync(producerAbs, content);
      const digest = "sha256:" + createHash("sha256").update(content).digest("hex");

      const copy = await materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: runId,
        consumer_step: "write_spec",
        slot: "spec",
        source_path: producerAbs,
        filename: "spec.md",
        expected_digest: digest,
      });

      const expectedConsumer = consumerInputPath(
        spaceRoot,
        runId,
        "write_spec",
        "spec",
        "spec.md",
      );
      expect(copy.path).toBe(expectedConsumer);
      expect(copy.digest).toBe(digest);
      expect(existsSync(expectedConsumer)).toBe(true);
      // The producer artifact is never mutated by the consumer copy.
      expect(readFileSync(producerAbs, "utf8")).toBe(content);
    } finally {
      rmSync(spaceRoot, { recursive: true, force: true });
    }
  });
  test("Task 07 — build prompt is versioned and branch-complete", () => {
    const snapshot = loadTutorialSnapshot(5);
    const handlersYaml = snapshot.files[".mrmr/space/handlers.yaml"];
    const parsedHandlers = parseHandlersFile(parseYaml(handlersYaml));
    expect(parsedHandlers.ok).toBe(true);
    if (!parsedHandlers.ok) return;
    const handler = parsedHandlers.value.handlers.find((entry) => entry.id === "dev_build");
    expect(handler).toMatchObject({
      on: "step.opened::my-dev-flow.build",
      contract_keys: ["my-dev-flow.build"],
      type: "shell_spawn",
      complete: "explicit",
    });
    if (!handler || handler.type === "view_resolver") return;
    expect(handler.prompt).not.toContain("murrmure_resolve_step");

    const manifest = parseFlowManifest(
      parseYaml(snapshot.files[".mrmr/flows/my-dev-flow/flow.manifest.yaml"]),
    );
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;
    const { catalog } = compileStepContractCatalog(manifest.value, "flw_my_dev_flow");
    const build = catalog?.entries.find((entry) => entry.step_id === "build");
    expect(build).toBeDefined();
    if (!build) return;
    const slice = buildStepContractSlice({
      entry: build,
      exec_context: {},
      run_id: "run_01LIVE",
      space_root: "/tmp/tutorial",
    });
    const protocol = renderMurrmureProtocolEnvelope({
      run_id: "run_01LIVE",
      contract_key_count: handler.contract_keys.length,
      contract_markdown: renderAgentStepContractMarkdown(slice, {
        run_id: "run_01LIVE",
      }),
    });

    expect(protocol.startsWith(snapshot.snippets["part-5-agent-protocol-prefix"])).toBe(true);
    expect(protocol).not.toContain("<run_id>");
    expect(protocol).not.toContain("## Session");
    expect(protocol).not.toContain("## Discovery");
    expect(protocol).not.toContain("## Resolve API");
    expect(protocol.match(/murrmure_resolve_step\(\{/g)).toHaveLength(2);
    expect(protocol).toContain('"commit_message":{"type":"string"}');
    expect(protocol).toContain('payload: {"commit_message":"value","description":"value"}');
    expect(protocol).toContain('branch: "completed"');
    expect(protocol).toContain('branch: "failed"');
  });
  test.skip("Task 11 — run scratch retention preserves references, not paths", () => {});
});
