import type { LoanAgentEvent } from "./types";

const KINDS = new Set(["delta", "citation", "proposal", "trace"]);

/** Narrow one decoded line to a known event; anything else is dropped. */
export function parseEvent(line: string): LoanAgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" && KINDS.has(kind) ? (value as LoanAgentEvent) : null;
}

/**
 * Read a newline-delimited JSON stream and yield each event. Chunks can split
 * a line anywhere (even inside a multi-byte character), so decode in streaming
 * mode and only parse complete lines.
 */
export async function* readNdjson(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<LoanAgentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const event = parseEvent(line);
        if (event) {
          yield event;
        }
      }
      if (done) {
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
