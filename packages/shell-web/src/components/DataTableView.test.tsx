/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTableView } from "./DataTableView.js";
import { coerceDisplayValue, tryParseJsonString } from "../lib/parse-display-value.js";

describe("parse-display-value", () => {
  test("tryParseJsonString parses JSON objects", () => {
    expect(tryParseJsonString('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJsonString("plain")).toBeUndefined();
  });

  test("coerceDisplayValue parses JSON strings", () => {
    expect(coerceDisplayValue('{"ok":true}')).toEqual({ ok: true });
  });
});

describe("DataTableView", () => {
  test("renders key/value rows", () => {
    render(<DataTableView value={{ status: "working", count: 2 }} />);
    expect(screen.getByText("status")).toBeTruthy();
    expect(screen.getByText("working")).toBeTruthy();
    expect(screen.getByText("count")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  test("truncates long strings with expand", () => {
    const long = "x".repeat(120);
    render(<DataTableView value={{ message: long }} truncateAt={40} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText(long)).toBeTruthy();
    fireEvent.click(screen.getByText("Show less"));
    expect(screen.queryByText(long)).toBeNull();
  });

  test("collapses structured values until expanded", () => {
    render(<DataTableView value={{ nested: { a: 1, b: 2 } }} />);
    expect(screen.getByText("2 keys")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /2 keys/i }));
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });
});
