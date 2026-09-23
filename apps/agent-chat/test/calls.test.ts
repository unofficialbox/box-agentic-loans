import { describe, expect, it } from "vitest";
import { applyCallEvent, isFailure, matchesFilter, type CallEntry } from "../src/inspector/calls";

const entry = (id: string, overrides: Partial<CallEntry> = {}): CallEntry => ({
  id,
  startedAt: 0,
  durationMs: 5,
  pending: false,
  service: "box",
  summary: "tools/call search_files_metadata",
  method: "POST",
  url: "https://mcp.example",
  requestHeaders: {},
  status: 200,
  statusText: "OK",
  responseHeaders: {},
  ...overrides,
});

describe("applyCallEvent", () => {
  it("starts from the snapshot, puts new calls first, and replaces a pending call in place", () => {
    let entries = applyCallEvent([], { type: "snapshot", entries: [entry("b"), entry("a")] });
    entries = applyCallEvent(entries, { type: "call", entry: entry("c", { pending: true, status: 0 }) });
    entries = applyCallEvent(entries, { type: "call", entry: entry("c", { status: 500 }) });
    expect(entries.map(e => [e.id, e.status])).toEqual([
      ["c", 500],
      ["b", 200],
      ["a", 200],
    ]);
    expect(applyCallEvent(entries, { type: "clear" })).toEqual([]);
  });
});

describe("filters", () => {
  it("filters by service and by failure", () => {
    const failed = entry("x", { service: "salesforce", status: 401 });
    const network = entry("y", { service: "typesafe", status: 0, error: "connect ECONNREFUSED" });
    const waiting = entry("z", { pending: true, status: 0 });
    expect([failed, network, waiting].map(isFailure)).toEqual([true, true, false]);
    expect(matchesFilter(failed, "salesforce")).toBe(true);
    expect(matchesFilter(failed, "box")).toBe(false);
    expect(matchesFilter(failed, "errors")).toBe(true);
    expect(matchesFilter(entry("ok"), "errors")).toBe(false);
    expect(matchesFilter(entry("ok"), "all")).toBe(true);
  });
});
