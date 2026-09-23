/**
 * The loan agent's API call log (GET /calls/stream), as the inspector shows it.
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
  return Boolean(entry.error) || (!entry.pending && (entry.status === 0 || entry.status >= 400));
}

export function matchesFilter(entry: CallEntry, filter: CallFilter): boolean {
  if (filter === "all") return true;
  if (filter === "errors") return isFailure(entry);
  return entry.service === filter;
}

