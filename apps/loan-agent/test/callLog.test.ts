import { describe, expect, it, vi } from "vitest";
import {
  CallLog,
  describeRequest,
  formatCallLine,
  loggedFetch,
  redactBody,
  redactHeaders,
  rpcError,
  type CallEntry,
  type CallEvent,
} from "../src/callLog.js";

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function finished(log: CallLog): CallEntry[] {
  return log.list().filter(entry => !entry.pending);
}

describe("redaction", () => {
  it("hides credentials in headers but keeps the rest", () => {
    const headers = redactHeaders(
      new Headers({ Authorization: "Bearer example-access", "Content-Type": "application/json", "Mcp-Session-Id": "s-1", Cookie: "a=b" })
    );
    expect(headers).toEqual({
      authorization: "Bearer [redacted]",
      "content-type": "application/json",
      "mcp-session-id": "s-1",
      cookie: "[redacted]",
    });
    expect(redactHeaders({ "set-cookie": ["a=1", "b=2"], "x-count": 3 as unknown as string })).toEqual({
      "set-cookie": "[redacted]",
      "x-count": "3",
    });
  });

  it("hides secrets, codes and tokens in an OAuth form body", () => {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "example-code",
      code_verifier: "example-verifier",
      client_id: "example-client",
      client_secret: "example-secret",
    }).toString();
    const shown = redactBody(body, "application/x-www-form-urlencoded");
    expect(shown).toContain("grant_type=authorization_code");
    expect(shown).toContain("client_id=example-client");
    for (const secret of ["example-code", "example-verifier", "example-secret"]) expect(shown).not.toContain(secret);
  });

  it("hides token fields at any depth in JSON and pretty-prints it", () => {
    const shown = redactBody(
      JSON.stringify({ access_token: "example-access", data: [{ refresh_token: "example-refresh", name: "Harborview" }] }),
      "application/json"
    );
    expect(shown).not.toContain("example-access");
    expect(shown).not.toContain("example-refresh");
    expect(shown).toContain('"name": "Harborview"');
    expect(shown.split("\n").length).toBeGreaterThan(3);
  });

  it("reduces an event stream to its JSON payloads", () => {
    const stream = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
    expect(redactBody(stream, "text/event-stream")).toBe(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }, null, 2));
  });
});

describe("describeRequest", () => {
  it("names MCP tool calls, OAuth grants and TypeSafe questions", () => {
    const mcp = JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name: "getLoanPackage" } });
    expect(describeRequest("salesforce", "https://api.example/mcp", "POST", mcp)).toBe("tools/call getLoanPackage");
    expect(describeRequest("box", "https://mcp.example", "POST", JSON.stringify({ method: "initialize" }))).toBe("initialize");
    expect(describeRequest("box", "https://api.box.com/oauth2/token", "POST", "grant_type=refresh_token&refresh_token=x")).toBe(
      "OAuth token (refresh_token)"
    );
    expect(
      describeRequest("typesafe", "https://api.example/systemone", "POST", JSON.stringify({ questions: { decision: { type: "choice" } } }))
    ).toBe("System One: decision (choice)");
    expect(describeRequest("box", "https://mcp.example", "GET", undefined)).toBe("open event stream");
  });
});

describe("loggedFetch", () => {
  it("records a call, redacted, and hands back the response untouched", async () => {
    const log = new CallLog();
    const inner = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const doFetch = loggedFetch(log, "box", inner);
    const response = await doFetch("https://mcp.example", {
      method: "POST",
      headers: { Authorization: "Bearer example-access", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_files_metadata" } }),
    });
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: { content: [] } });
    await settle();

    const [entry] = finished(log);
    expect(entry).toMatchObject({
      service: "box",
      method: "POST",
      url: "https://mcp.example",
      summary: "tools/call search_files_metadata",
      status: 200,
      requestHeaders: { authorization: "Bearer [redacted]" },
    });
    expect(entry.responseBody).toContain('"jsonrpc": "2.0"');
    expect(JSON.stringify(log.list())).not.toContain("example-access");
  });

  it("shows an open GET event stream without reading it", async () => {
    const log = new CallLog();
    const stream = new ReadableStream({ start() {} });
    const doFetch = loggedFetch(log, "salesforce", async () => new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    await doFetch("https://mcp.example", { method: "GET" });
    expect(finished(log)[0]).toMatchObject({ summary: "open event stream", responseBody: "(event stream: not captured)" });
  });

  it("marks the 405 an MCP server may answer to the event-stream GET as expected", async () => {
    const log = new CallLog();
    const doFetch = loggedFetch(log, "box", async () => new Response(null, { status: 405, statusText: "Method Not Allowed" }));
    await doFetch("https://mcp.example", { method: "GET" });
    const [entry] = finished(log);
    expect(entry).toMatchObject({ summary: "open event stream", status: 405 });
    expect(entry.expected).toMatch(/doesn't offer a server-to-client event stream/);
    expect(formatCallLine(entry)).toMatch(/open event stream \(expected\)$/);
  });

  it("leaves other 405s as failures", async () => {
    const log = new CallLog();
    const doFetch = loggedFetch(log, "box", async () => new Response("{}", { status: 405 }));
    await doFetch("https://mcp.example", { method: "POST", body: JSON.stringify({ method: "tools/call", params: { name: "x" } }) });
    await settle();
    expect(finished(log)[0].expected).toBeUndefined();
  });

  it("records a network failure and still throws it", async () => {
    const log = new CallLog();
    const doFetch = loggedFetch(log, "typesafe", async () => {
      throw new Error("connect ECONNREFUSED");
    });
    await expect(doFetch("https://api.example/systemone", { method: "POST", body: "{}" })).rejects.toThrow("ECONNREFUSED");
    expect(finished(log)[0]).toMatchObject({ status: 0, error: "connect ECONNREFUSED" });
    expect(formatCallLine(finished(log)[0])).toMatch(/^\[api\] ERR/);
  });
});

describe("MCP failures inside a 200", () => {
  it("reads a tool result marked isError, and a JSON-RPC error, in JSON or an event stream", () => {
    const toolError = JSON.stringify({ jsonrpc: "2.0", id: 5, result: { content: [{ type: "text", text: "Item not found" }], isError: true } });
    expect(rpcError(toolError, "application/json")).toBe("Item not found");
    expect(rpcError(`event: message\ndata: ${toolError}\n\n`, "text/event-stream")).toBe("Item not found");
    const rpc = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid arguments" } });
    expect(rpcError(rpc, "application/json")).toBe("Invalid arguments");
    const ok = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "{}" }] } });
    expect(rpcError(ok, "application/json")).toBeUndefined();
    expect(rpcError("not json", "application/json")).toBeUndefined();
  });

  it("flags the call in the log, and only for MCP services", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 5, result: { content: [{ type: "text", text: "Item not found" }], isError: true } });
    const respond = async () => new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    const request = { method: "POST", body: JSON.stringify({ method: "tools/call", params: { name: "create_docgen_batch" } }) };
    const log = new CallLog();
    await loggedFetch(log, "box", respond)("https://mcp.example", request);
    await loggedFetch(log, "typesafe", respond)("https://api.example", request);
    await settle();
    const [typesafe, box] = finished(log);
    expect(box).toMatchObject({ status: 200, rpcError: "Item not found" });
    expect(formatCallLine(box)).toMatch(/\(tool error: Item not found\)$/);
    expect(typesafe.rpcError).toBeUndefined();
  });
});

describe("CallLog", () => {
  it("replaces a pending entry in place, keeps the newest first, and clears", () => {
    const log = new CallLog();
    const events: CallEvent[] = [];
    log.subscribe(event => events.push(event));
    const base = {
      startedAt: 0,
      durationMs: 1,
      service: "agent" as const,
      summary: "chat",
      method: "POST",
      url: "http://localhost/chat",
      requestHeaders: {},
      status: 200,
      statusText: "OK",
      responseHeaders: {},
    };
    log.put({ ...base, id: "a", pending: true });
    log.put({ ...base, id: "b", pending: false });
    log.put({ ...base, id: "a", pending: false });
    expect(log.list().map(entry => [entry.id, entry.pending])).toEqual([
      ["b", false],
      ["a", false],
    ]);
    log.clear();
    expect(log.list()).toEqual([]);
    expect(events.map(event => event.type)).toEqual(["call", "call", "call", "clear"]);
  });
});
