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
    const allowed = entry("g", { method: "GET", status: 405, expected: "Expected: no event stream" });
    expect(isFailure(allowed)).toBe(false);
    expect(matchesFilter(allowed, "errors")).toBe(false);
  });
});

describe("copy formats", () => {
  const call = entry("c", {
    summary: "tools/call getLoanPackage",
    service: "salesforce",
    url: "https://api.example/mcp",
    requestHeaders: { authorization: "Bearer [redacted]", "content-type": "application/json" },
    requestBody: '{\n  "method": "tools/call"\n}',
    responseHeaders: { "content-type": "application/json" },
    responseBody: '{\n  "result": {}\n}',
    durationMs: 42,
  });

  it("formats the request and the response like HTTP messages", async () => {
    const { formatRequest, formatResponse } = await import("../src/inspector/calls");
    expect(formatRequest(call)).toBe(
      'POST https://api.example/mcp\nauthorization: Bearer [redacted]\ncontent-type: application/json\n\n{\n  "method": "tools/call"\n}'
    );
    expect(formatResponse(call)).toBe('HTTP 200 OK\ncontent-type: application/json\n\n{\n  "result": {}\n}');
  });

  it("copies both under a line naming the call", async () => {
    const { formatCall, formatRequest, formatResponse } = await import("../src/inspector/calls");
    const both = formatCall(call);
    expect(both.split("\n")[0]).toBe("tools/call getLoanPackage · Salesforce · 42 ms · 1970-01-01T00:00:00.000Z");
    expect(both).toContain(`── Request ──\n${formatRequest(call)}`);
    expect(both).toContain(`── Response ──\n${formatResponse(call)}`);
  });

  it("says when there is no response yet, or none at all", async () => {
    const { formatResponse } = await import("../src/inspector/calls");
    expect(formatResponse(entry("p", { pending: true, status: 0, responseBody: "x" }))).toBe("(waiting for the response)");
    expect(formatResponse(entry("e", { status: 0, statusText: "", error: "connect ECONNREFUSED" }))).toBe(
      "(no response)\nerror: connect ECONNREFUSED"
    );
  });
});
