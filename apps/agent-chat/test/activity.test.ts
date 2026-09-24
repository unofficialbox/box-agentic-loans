import { describe, expect, it } from "vitest";
import { formatDuration, splitStepTitle, summarize, turnDuration } from "../src/activity";
import { toStatusKind } from "../src/components/StatusIcon";

const at = (ms: number) => new Date(Date.UTC(2026, 8, 24, 0, 0, 0, ms)).toISOString();

describe("status kinds", () => {
  it("maps plan and trace statuses onto one glyph family", () => {
    expect(["pending", "in_progress", "running", "completed", "succeeded", "warning", "failed", "skipped"].map(toStatusKind)).toEqual([
      "pending",
      "active",
      "active",
      "done",
      "done",
      "warning",
      "failed",
      "skipped",
    ]);
  });
});

describe("durations", () => {
  it("formats short, sub-second and long spans", () => {
    expect(formatDuration(at(0), at(40))).toBe("<0.1 s");
    expect(formatDuration(at(0), at(430))).toBe("0.4 s");
    expect(formatDuration(at(0), at(12_400))).toBe("12 s");
    expect(formatDuration(at(0), undefined)).toBeUndefined();
  });

  it("measures the turn from the first start to the last finish", () => {
    expect(
      turnDuration([
        { id: "a", title: "a", startedAt: at(0), finishedAt: at(500) },
        { id: "b", title: "b", startedAt: at(600), finishedAt: at(2100) },
      ])
    ).toBe("2.1 s");
  });
});

describe("step titles", () => {
  it("splits the source from the action", () => {
    expect(splitStepTitle("TypeSafe · route intent")).toEqual({ source: "TypeSafe", action: "route intent" });
    expect(splitStepTitle("Intent → find_risk_documents")).toEqual({ action: "Intent → find_risk_documents" });
  });
});

describe("turn summary", () => {
  const done = { id: "s", title: "LOS · listLoans", status: "succeeded" as const, startedAt: at(0), finishedAt: at(1200) };

  it("is idle before anything happens, and working while a step runs", () => {
    expect(summarize([], [], false).kind).toBe("idle");
    expect(summarize([{ ...done, status: "running" }], [], false)).toEqual({ kind: "active", label: "Working" });
  });

  it("puts a failure, then a waiting approval, ahead of done", () => {
    expect(summarize([done, { ...done, id: "f", status: "failed" }], [], true).label).toBe("Stopped");
    expect(summarize([done], [], true)).toEqual({ kind: "approval", label: "Waiting for your approval" });
    expect(summarize([done], [], false)).toEqual({ kind: "done", label: "Done · 1.2 s" });
  });
});
