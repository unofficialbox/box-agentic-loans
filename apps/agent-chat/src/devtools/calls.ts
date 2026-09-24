/**
 * The loan agent's API call log (GET /calls/stream), as the API console shows it.
 * Mirrors apps/loan-agent/src/callLog.ts; credentials are redacted server-side.
 */

export type CallService = "agent" | "typesafe" | "salesforce" | "box";

export interface CallEntry {
  id: string;
  startedAt: number;
  durationMs: number;
  pending: boolean;
  service: CallService;
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
  /** A non-2xx answer that is normal for this call; not counted as a failure. */
  expected?: string;
}

export type CallStreamEvent =
  | { type: "snapshot"; entries: CallEntry[] }
  | { type: "call"; entry: CallEntry }
  | { type: "clear" };

const MAX_ENTRIES = 300;

/** Newest first; a finished call replaces its pending entry in place. */
export function applyCallEvent(entries: CallEntry[], event: CallStreamEvent): CallEntry[] {
  switch (event.type) {
    case "snapshot":
      return event.entries.slice(0, MAX_ENTRIES);
    case "clear":
      return [];
    case "call": {
      const index = entries.findIndex(entry => entry.id === event.entry.id);
      if (index === -1) return [event.entry, ...entries].slice(0, MAX_ENTRIES);
      const next = entries.slice();
      next[index] = event.entry;
      return next;
    }
  }
}

export type CallFilter = "all" | CallService | "errors";

export const CALL_FILTERS: Array<{ value: CallFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "typesafe", label: "TypeSafe" },
  { value: "salesforce", label: "Salesforce" },
  { value: "box", label: "Box" },
  { value: "agent", label: "Chat" },
  { value: "errors", label: "Errors" },
];

export const SERVICE_LABELS: Record<CallService, string> = {
  agent: "Chat",
  typesafe: "TypeSafe",
  salesforce: "Salesforce",
  box: "Box",
};

export function isFailure(entry: CallEntry): boolean {
  if (entry.expected) return false;
  return Boolean(entry.error) || (!entry.pending && (entry.status === 0 || entry.status >= 400));
}

export function matchesFilter(entry: CallEntry, filter: CallFilter): boolean {
  if (filter === "all") return true;
  if (filter === "errors") return isFailure(entry);
  return entry.service === filter;
}


// ── Copying a call ──────────────────────────────────────────────────────

function headerLines(headers: Record<string, string>): string[] {
  return Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
}

function withBody(lines: string[], body: string | undefined): string {
  return body ? `${lines.join("\n")}\n\n${body}` : lines.join("\n");
}

/** The request as HTTP-style text: request line, headers, blank line, body. */
export function formatRequest(entry: CallEntry): string {
  return withBody([`${entry.method} ${entry.url}`, ...headerLines(entry.requestHeaders)], entry.requestBody);
}

/** The response as HTTP-style text: status line, headers, blank line, body. */
export function formatResponse(entry: CallEntry): string {
  const status = entry.pending
    ? "(waiting for the response)"
    : entry.status
      ? `HTTP ${entry.status}${entry.statusText ? ` ${entry.statusText}` : ""}`
      : "(no response)";
  const lines = [status, ...headerLines(entry.responseHeaders)];
  if (entry.error) lines.push(`error: ${entry.error}`);
  return withBody(lines, entry.pending ? undefined : entry.responseBody);
}

/** Request and response together, under a line naming the call. */
export function formatCall(entry: CallEntry): string {
  const when = new Date(entry.startedAt).toISOString();
  const took = entry.pending ? "in progress" : `${entry.durationMs} ms`;
  return [
    `${entry.summary} · ${SERVICE_LABELS[entry.service]} · ${took} · ${when}`,
    "",
    "── Request ──",
    formatRequest(entry),
    "",
    "── Response ──",
    formatResponse(entry),
  ].join("\n");
}
