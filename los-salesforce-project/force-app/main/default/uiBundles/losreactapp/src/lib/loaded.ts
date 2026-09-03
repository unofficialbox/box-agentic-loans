/**
 * The outcome of a remote read, failure included.
 *
 * Every fetch here used to answer failure with `null`, and every caller answered `null`
 * with synthetic fixtures. That put a plausible workspace in front of a broken one: a
 * demo could run start to finish against no org at all, and the only sign was a
 * console warning nobody had open. A failure now carries its reason, and a caller cannot
 * reach the data without deciding what to draw when there is none.
 */
export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

export function failed(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** An exception rendered as a sentence. Opaque ones say so rather than printing "{}". */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  const described = String(error);
  return described === "[object Object]" ? "The request failed with no error given." : described;
}

/**
 * The useful part of an error body, short enough to sit in a paragraph.
 *
 * Salesforce and Box both answer with JSON or HTML that runs to kilobytes; the reader
 * needs the first line of it, not a page of markup under a heading.
 */
export function firstLine(detail: string, limit = 200): string {
  const line = detail.trim().split("\n")[0]?.trim() ?? "";
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}
