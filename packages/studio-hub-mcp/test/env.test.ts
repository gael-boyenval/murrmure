import { describe, expect, test, beforeEach, afterEach } from "vitest";

describe("MCP env", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.STUDIO_HUB_URL;
    delete process.env.STUDIO_API_URL;
    delete process.env.STUDIO_HUB_TOKEN;
    delete process.env.STUDIO_API_TOKEN;
    delete process.env.STUDIO_TOKEN;
    delete process.env.STUDIO_SPACE_ID;
  });

  afterEach(() => {
    process.env = env;
  });

  test("prefers STUDIO_HUB_* over legacy names", async () => {
    process.env.STUDIO_HUB_URL = "http://hub.test";
    process.env.STUDIO_API_URL = "http://legacy.test";
    process.env.STUDIO_HUB_TOKEN = "tok_primary";
    process.env.STUDIO_API_TOKEN = "tok_legacy";
    const { readHubToken, readHubUrl } = await import("../src/env.js");
    expect(readHubUrl()).toBe("http://hub.test");
    expect(readHubToken()).toBe("tok_primary");
  });

  test("accepts STUDIO_API_* aliases", async () => {
    process.env.STUDIO_API_URL = "http://legacy.test";
    process.env.STUDIO_API_TOKEN = "tok_legacy";
    const { readHubToken, readHubUrl } = await import("../src/env.js");
    expect(readHubUrl()).toBe("http://legacy.test");
    expect(readHubToken()).toBe("tok_legacy");
  });

  test("accepts STUDIO_TOKEN for CDK parity", async () => {
    process.env.STUDIO_TOKEN = "tok_cdk";
    const { readHubToken } = await import("../src/env.js");
    expect(readHubToken()).toBe("tok_cdk");
  });
});
