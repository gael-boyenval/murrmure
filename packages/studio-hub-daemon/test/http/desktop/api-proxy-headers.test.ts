import { describe, expect, test } from "vitest";
import { filterApiProxyHeaders } from "../../../src/routes.js";

describe("routes/api proxy headers", () => {
  test("filterApiProxyHeaders strips internal trust headers", () => {
    const incoming = new Headers({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer tok_test",
      "X-Murrmure-Internal-Space": "spc_victim",
      "X-Murrmure-Caller-Token": "tok_stolen",
      "X-Murrmure-Worker-Token": "tok_worker",
    });

    const filtered = filterApiProxyHeaders(incoming);
    expect(filtered.get("Content-Type")).toBe("application/json");
    expect(filtered.get("Accept")).toBe("application/json");
    expect(filtered.get("Authorization")).toBe("Bearer tok_test");
    expect(filtered.has("X-Murrmure-Internal-Space")).toBe(false);
    expect(filtered.has("X-Murrmure-Caller-Token")).toBe(false);
    expect(filtered.has("X-Murrmure-Worker-Token")).toBe(false);
  });
});
