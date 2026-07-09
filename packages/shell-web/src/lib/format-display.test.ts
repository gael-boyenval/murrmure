import { describe, expect, test } from "vitest";
import {
  formatDateTime,
  formatDateTimeCompact,
  formatJson,
  formatMaybeJsonText,
  formatRelativeDuration,
} from "./format-display.js";

describe("format-display", () => {
  test("formatDateTime formats ISO timestamps", () => {
    const formatted = formatDateTime("2026-07-08T12:00:30.000Z");
    expect(formatted).not.toBe("2026-07-08T12:00:30.000Z");
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/Jul/);
  });

  test("formatDateTimeCompact is shorter than full format", () => {
    const iso = "2026-07-08T12:00:30.000Z";
    expect(formatDateTimeCompact(iso).length).toBeLessThanOrEqual(formatDateTime(iso).length);
  });

  test("formatRelativeDuration buckets elapsed time", () => {
    const now = new Date("2026-07-08T12:10:00.000Z");
    expect(formatRelativeDuration("2026-07-08T12:09:30.000Z", now)).toBe("just now");
    expect(formatRelativeDuration("2026-07-08T12:05:00.000Z", now)).toBe("5m");
    expect(formatRelativeDuration("2026-07-08T10:00:00.000Z", now)).toBe("2h");
  });

  test("formatJson pretty-prints objects and JSON strings", () => {
    expect(formatJson({ ok: true, n: 1 })).toBe('{\n  "ok": true,\n  "n": 1\n}');
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  test("formatMaybeJsonText leaves plain text unchanged", () => {
    expect(formatMaybeJsonText("hello")).toBe("hello");
    expect(formatMaybeJsonText('{"x":1}')).toContain('"x": 1');
  });
});
