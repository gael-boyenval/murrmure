import { describe, expect, test } from "vitest";
import { filterHubFetchHeaders, isAllowedHubFetchPath } from "./hub-fetch-bridge.js";

describe("hub-fetch-bridge", () => {
  test("filterHubFetchHeaders keeps safe headers and drops trust headers", () => {
    expect(
      filterHubFetchHeaders({
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer evil",
        "X-Murrmure-Internal-Space": "spc_victim",
        "X-Murrmure-Caller-Token": "tok_stolen",
        "X-Custom": "ignored",
      }),
    ).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
  });

  test("isAllowedHubFetchPath rejects admin paths and wrong flow prefix", () => {
    const hubUrl = "http://127.0.0.1:8787";
    expect(isAllowedHubFetchPath(hubUrl, "feature-spec", "/v1/spaces")).toEqual({
      ok: false,
      error: "hub-fetch path blocked",
    });
    expect(isAllowedHubFetchPath(hubUrl, "feature-spec", "/api/other-flow/health")).toEqual({
      ok: false,
      error: "hub-fetch path blocked",
    });
    expect(isAllowedHubFetchPath(hubUrl, "feature-spec", "/api/feature-spec/health")).toEqual({
      ok: true,
      target: new URL("http://127.0.0.1:8787/api/feature-spec/health"),
    });
  });
});
