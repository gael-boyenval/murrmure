import { describe, expect, test } from "vitest";
import { bootstrapLaunchUrl } from "../src/runner.js";

describe("desktop runner", () => {
  test("bootstrapLaunchUrl encodes token in hash", () => {
    const url = bootstrapLaunchUrl("http://127.0.0.1:8787/", "tok_01JBOOTSTRAPTOKEN00000001");
    expect(url).toBe(
      "http://127.0.0.1:8787/#murrmure-bootstrap=tok_01JBOOTSTRAPTOKEN00000001",
    );
  });
});
