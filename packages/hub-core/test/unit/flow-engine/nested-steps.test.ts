// The runtime nested build loop (resume/route control between a parent and its
// nested children) is introduced in Task 07. Task 03 compiles nested steps to
// qualified ids and lowers resume/route routing (covered in
// step-contract-compile.test.ts); it does not exercise the runtime loop.
import { describe, test } from "vitest";

describe.skip("flow-engine/nested-steps (Task 07)", () => {
  test("runtime nested build loop is implemented in Task 07", () => {});
});
