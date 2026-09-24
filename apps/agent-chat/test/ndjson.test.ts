import { describe, expect, it } from "vitest";
import { TurnTracker, parseEvent, readNdjson } from "../src/transport/ndjson";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of readNdjson(stream)) {
    events.push(event);
  }
  return events;
}

describe("parseEvent", () => {
  it("accepts the event kinds, including the loan context", () => {
    expect(parseEvent('{"kind":"context","loan":{"loanId":"LN-2026-0003"}}')?.kind).toBe("context");
    expect(parseEvent('{"kind":"delta","text":"hi"}')).toEqual({ kind: "delta", text: "hi" });
    expect(parseEvent('{"kind":"trace","step":{"id":"a","title":"A"}}')?.kind).toBe("trace");
    expect(parseEvent('{"kind":"block","block":{"type":"facts","rows":[]}}')?.kind).toBe("block");
  });

  it("drops blank, malformed, and unknown lines", () => {
    expect(parseEvent("")).toBeNull();
    expect(parseEvent("{not json")).toBeNull();
    expect(parseEvent('{"kind":"tool"}')).toBeNull();
    expect(parseEvent("42")).toBeNull();
  });
});

describe("readNdjson", () => {
  it("reassembles lines split across chunks, including a multi-byte character", () => {
    const bytes = new TextEncoder().encode(
      '{"kind":"delta","text":"LTV → 85%"}\n{"kind":"citation","citation":{"id":"c","label":"Term sheet"}}'
    );
    // Split inside the 3-byte arrow and inside the second line.
    const arrow = bytes.indexOf(0xe2);
    const chunks = [bytes.slice(0, arrow + 1), bytes.slice(arrow + 1, 50), bytes.slice(50)];

    return collect(streamOf(chunks)).then(events => {
      expect(events).toEqual([
        { kind: "delta", text: "LTV → 85%" },
        { kind: "citation", citation: { id: "c", label: "Term sheet" } },
      ]);
    });
  });

  it("skips junk lines without ending the stream", async () => {
    const text = 'noise\n{"kind":"delta","text":"a"}\n\n{"kind":"delta","text":"b"}\n';
    const events = await collect(streamOf([new TextEncoder().encode(text)]));
    expect(events.map(event => (event.kind === "delta" ? event.text : ""))).toEqual(["a", "b"]);
  });
});

describe("TurnTracker", () => {
  it("reports a complete turn", () => {
    const tracker = new TurnTracker();
    tracker.observe({ kind: "delta", text: "a", seq: 1 });
    tracker.observe({ kind: "done", status: "complete", seq: 2 });
    expect(tracker.summary()).toEqual({ status: "complete", missing: [] });
  });

  it("flags gaps and a stream that ended without done", () => {
    const tracker = new TurnTracker();
    tracker.observe({ kind: "delta", text: "a", seq: 1 });
    tracker.observe({ kind: "delta", text: "c", seq: 3 });
    expect(tracker.summary()).toEqual({ status: "incomplete", missing: [2] });
  });
});
