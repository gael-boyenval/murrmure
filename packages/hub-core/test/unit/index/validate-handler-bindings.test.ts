import { describe, expect, test } from "vitest";
import type { HandlerSpec } from "@murrmure/contracts";
import {
  validateHandlerBindings,
  type BindingFlow,
  type BindingView,
} from "../../../src/index/validate-handler-bindings.js";

const FLOWS: BindingFlow[] = [{ name: "preview-review", step_ids: ["intake", "write_spec"] }];

const VIEWS: BindingView[] = [
  { view_id: "intake", build: { dist_present: true, entry_present: true } },
];

function input(overrides: {
  handlers?: HandlerSpec[];
  flows?: BindingFlow[];
  views?: BindingView[];
} = {}) {
  return {
    handlers: overrides.handlers ?? [
      { id: "intake-view", on: "step.opened::preview-review.intake", type: "view_resolver", view: "intake", contract_keys: [] },
    ],
    flows: overrides.flows ?? FLOWS,
    views: overrides.views ?? VIEWS,
  };
}

describe("index/validate-handler-bindings", () => {
  test("accepts a single view_resolver bound to an open step with a built view", () => {
    expect(validateHandlerBindings(input())).toEqual({ ok: true });
  });

  test("accepts zero resolvers (unbound steps are valid)", () => {
    expect(validateHandlerBindings(input({ handlers: [] }))).toEqual({ ok: true });
  });

  test("accepts many step.resolved reactions on the same alias", () => {
    expect(
      validateHandlerBindings(
        input({
          handlers: [
            { id: "intake-view", on: "step.opened::preview-review.intake", type: "view_resolver", view: "intake", contract_keys: [] },
            { id: "log", on: "step.resolved::preview-review.intake", type: "shell_spawn", command: "echo", contract_keys: [] },
            { id: "notify", on: "step.resolved::preview-review.intake", type: "shell_spawn", command: "echo", contract_keys: [] },
          ],
        }),
      ),
    ).toEqual({ ok: true });
  });

  test("rejects two step.opened resolvers on the same canonical step", () => {
    const result = validateHandlerBindings(
      input({
        handlers: [
          { id: "intake-view", on: "step.opened::preview-review.intake", type: "view_resolver", view: "intake", contract_keys: [] },
          { id: "intake-alt", on: "step.opened::preview-review.intake", type: "shell_spawn", command: "echo", contract_keys: [] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("HANDLER_RESOLVER_CONFLICT");
  });

  test("rejects stale/orphan alias", () => {
    const result = validateHandlerBindings(
      input({
        handlers: [
          { id: "stale", on: "step.opened::preview-review.renamed_step", type: "shell_spawn", command: "echo", contract_keys: [] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("HANDLER_ORPHAN_ALIAS");
  });

  test("rejects unknown view with VIEW_RESOLVER_VIEW_NOT_FOUND", () => {
    const result = validateHandlerBindings(
      input({
        handlers: [
          { id: "intake-view", on: "step.opened::preview-review.intake", type: "view_resolver", view: "missing", contract_keys: [] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("VIEW_RESOLVER_VIEW_NOT_FOUND");
  });

  test("rejects unbuilt view with VIEW_RESOLVER_BUILD_MISSING", () => {
    const result = validateHandlerBindings(
      input({
        views: [{ view_id: "intake", build: { dist_present: false, entry_present: false } }],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("VIEW_RESOLVER_BUILD_MISSING");
  });

  test("rejects view_resolver bound to step.resolved", () => {
    const result = validateHandlerBindings(
      input({
        handlers: [
          { id: "intake-view", on: "step.resolved::preview-review.intake", type: "view_resolver", view: "intake", contract_keys: [] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("VIEW_RESOLVER_NOT_OPENED");
  });

  test("rejects duplicate flow names (ambiguous aliases)", () => {
    const result = validateHandlerBindings(
      input({ flows: [FLOWS[0]!, { ...FLOWS[0]! }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DUPLICATE_FLOW_NAME");
  });

  test("resolves aliases against preserved flows not in the bundle (partial apply)", () => {
    const result = validateHandlerBindings(
      input({
        handlers: [
          { id: "intake-view", on: "step.opened::preview-review.intake", type: "view_resolver", view: "intake", contract_keys: [] },
        ],
        // Simulate a partial apply: flows come from the existing index, not the bundle.
        flows: [{ name: "preview-review", step_ids: ["intake", "write_spec"] }],
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});
