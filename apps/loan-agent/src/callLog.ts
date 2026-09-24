import type { FetchLike } from "./oauth.js";

/**
 * Every HTTP call the agent makes (TypeSafe, Salesforce MCP, Box MCP, OAuth
 * token exchanges) and every chat request it serves, kept in memory for the
 * API inspector. Credentials are redacted before an entry is stored: nothing
 * here may hold a token, secret or authorization code.
 */

export type CallService = "agent" | "typesafe" | "salesforce" | "box";

export interface CallEntry {
  id: string;
  startedAt: number;
  /** Until the response body was read; while `pending`, until its headers. */
  durationMs: number;
  pending: boolean;
  service: CallService;
  /** What the call is, e.g. "tools/call getLoanPackage", "OAuth token (refresh_token)". */
  summary: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody?: string;
  error?: string;
  /** Set when a non-2xx answer is normal for this call, e.g. a 405 the MCP spec allows. */
  expected?: string;
}

export type CallEvent = { type: "call"; entry: CallEntry } | { type: "clear" };

const MAX_ENTRIES = 300;
export const MAX_BODY_CHARS = 20_000;
const REDACTED = "[redacted]";

export class CallLog {
  private entries: CallEntry[] = [];
  private readonly listeners = new Set<(event: CallEvent) => void>();
  private seq = 0;

  nextId(): string {
    this.seq += 1;
    return `call-${this.seq}`;
  }

  list(): CallEntry[] {
    return [...this.entries];
  }

  /** Adds an entry, or replaces the one with the same id (pending → done). */
  put(entry: CallEntry): void {
    const index = this.entries.findIndex(existing => existing.id === entry.id);
    if (index === -1) {
      this.entries = [entry, ...this.entries].slice(0, MAX_ENTRIES);
    } else {
      this.entries[index] = entry;
    }
    this.emit({ type: "call", entry });
  }

  clear(): void {
    this.entries = [];
    this.emit({ type: "clear" });
  }

  subscribe(listener: (event: CallEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: CallEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

// ── Redaction ────────────────────────────────────────────────────────────

const SECRET_HEADERS = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i;
const SECRET_JSON_KEYS = /^(access_token|refresh_token|id_token|client_secret|password|api_?key|authorization)$/i;
const SECRET_FORM_KEYS = /^(client_secret|code|code_verifier|refresh_token|access_token|password)$/i;

export function redactHeaders(headers: Headers | Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (key: string, value: string) => {
    const name = key.toLowerCase();
    if (!SECRET_HEADERS.test(name)) {
      out[name] = value;
    } else if (name === "authorization" && /^bearer\s/i.test(value)) {
      out[name] = `Bearer ${REDACTED}`;
    } else {
      out[name] = REDACTED;
    }
  };
  if (headers instanceof Headers) {
    headers.forEach((value, key) => set(key, value));
  } else if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }
  }
  return out;
}

function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, SECRET_JSON_KEYS.test(key) ? REDACTED : redactJson(inner)])
    );
  }
  return value;
}

/**
 * Redacts credentials from a body and pretty-prints JSON. Form bodies (OAuth
 * token requests) lose their secrets, codes and tokens; JSON bodies lose token
 * and secret fields at any depth; a server-sent event stream is reduced to its
 * JSON `data:` payloads.
 */
export function redactBody(text: string, contentType = ""): string {
  if (!text) return text;
  if (/x-www-form-urlencoded/i.test(contentType)) {
    const lines: string[] = [];
    new URLSearchParams(text).forEach((value, key) => lines.push(`${key}=${SECRET_FORM_KEYS.test(key) ? REDACTED : value}`));
    return truncate(lines.join("\n"));
  }
  if (/event-stream/i.test(contentType)) {
    const payloads = text
      .split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim())
      .filter(Boolean)
      .map(data => redactBody(data, "application/json"));
    return truncate(payloads.join("\n\n"));
  }
  try {
    return truncate(JSON.stringify(redactJson(JSON.parse(text)), null, 2));
  } catch {
    return truncate(text);
  }
}

export function truncate(text: string, max = MAX_BODY_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… truncated (${text.length} characters)`;
}

// ── Describing a call ────────────────────────────────────────────────────

/** A short name for a request: the MCP method and tool, the OAuth grant, the TypeSafe question. */
export function describeRequest(service: CallService, url: string, method: string, body: string | undefined): string {
  if (/\/oauth2\/token$/.test(new URL(url).pathname)) {
    const grant = body ? new URLSearchParams(body).get("grant_type") : null;
    return `OAuth token${grant ? ` (${grant})` : ""}`;
  }
  if (!body) return method === "GET" ? "open event stream" : method === "DELETE" ? "close session" : method;
  try {
    const json = JSON.parse(body) as { method?: string; params?: { name?: string }; questions?: Record<string, { type?: string }> };
    if (service === "typesafe" && json.questions) {
      return `System One: ${Object.entries(json.questions).map(([name, q]) => `${name} (${q.type ?? "question"})`).join(", ")}`;
    }
    if (json.method) {
      return json.method === "tools/call" && json.params?.name ? `tools/call ${json.params.name}` : json.method;
    }
  } catch {
    // Not JSON.
  }
  return method;
}

async function requestBodyText(input: string | URL | Request, init?: RequestInit): Promise<string | undefined> {
  const body = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body instanceof ArrayBuffer ? body : body.buffer);
  }
  if (body instanceof Blob) return body.text();
  return "(stream)";
}

/**
 * A fetch that records each request in the log. The caller gets the original
 * response untouched; the log reads a copy of the body in the background, so a
 * long-lived event stream never holds up the call.
 */
export function loggedFetch(log: CallLog, service: CallService, inner: FetchLike = fetch): FetchLike {
  return async (input, init) => {
    const id = log.nextId();
    const started = Date.now();
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const rawBody = await requestBodyText(input, init);
    const base = {
      id,
      startedAt: started,
      service,
      summary: describeRequest(service, url, method, rawBody),
      method,
      url,
      requestHeaders: redactHeaders(headers),
      requestBody: rawBody === undefined ? undefined : redactBody(rawBody, headers.get("content-type") ?? ""),
    };

    let response: Response;
    try {
      response = await inner(input, init);
    } catch (error) {
      log.put({
        ...base,
        durationMs: Date.now() - started,
        pending: false,
        status: 0,
        statusText: "",
        responseHeaders: {},
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const entry: CallEntry = {
      ...base,
      durationMs: Date.now() - started,
      pending: true,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: redactHeaders(response.headers),
      expected: expectedAnswer(method, base.summary, response.status),
    };
    // A GET event stream stays open for server-initiated messages: show it, don't read it.
    if (!response.body || (method === "GET" && /event-stream/i.test(contentType))) {
      log.put({ ...entry, pending: false, responseBody: response.body ? "(event stream: not captured)" : undefined });
      return response;
    }
    log.put(entry);
    response
      .clone()
      .text()
      .then(
        text => log.put({ ...entry, pending: false, durationMs: Date.now() - started, responseBody: redactBody(text, contentType) }),
        error => log.put({ ...entry, pending: false, durationMs: Date.now() - started, error: `Reading the body failed: ${error}` })
      );
    return response;
  };
}

/** One line per finished call, for the server's terminal. */
export function formatCallLine(entry: CallEntry): string {
  const status = entry.error && !entry.status ? "ERR" : String(entry.status);
  const line = `[api] ${status.padEnd(3)} ${`${entry.durationMs}ms`.padStart(7)}  ${entry.service.padEnd(10)} ${entry.method.padEnd(6)} ${entry.summary}`;
  return entry.expected ? `${line} (expected)` : line;
}

/**
 * MCP Streamable HTTP: a client opens GET for server-initiated messages and
 * sends DELETE to end its session. A server that offers neither answers 405,
 * which the spec allows and the SDK handles; tool calls are unaffected.
 */
export function expectedAnswer(method: string, summary: string, status: number): string | undefined {
  if (status !== 405) return undefined;
  if (method === "GET" && summary === "open event stream") {
    return "Expected: this MCP server doesn't offer a server-to-client event stream. The MCP spec allows a 405 here, and tool calls work without it.";
  }
  if (method === "DELETE" && summary === "close session") {
    return "Expected: this MCP server doesn't support ending a session explicitly. The MCP spec allows a 405 here.";
  }
  return undefined;
}
