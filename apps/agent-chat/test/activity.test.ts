import { describe, expect, it } from "vitest";
import { formatDuration, formatElapsed, incompleteNotice, newTurn, progress, splitStepTitle, upsertStep } from "../src/activity";
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

  it("reads minutes past a minute", () => {
    expect(formatElapsed(65_000)).toBe("1 min 5 s");
  });
});

describe("step titles", () => {
  it("splits the source from the action", () => {
    expect(splitStepTitle("TypeSafe · route intent")).toEqual({ source: "TypeSafe", action: "route intent" });
    expect(splitStepTitle("Intent → find_risk_documents")).toEqual({ action: "Intent → find_risk_documents" });
  });
});

describe("progress line", () => {
  const step = { id: "s", title: "LOS · listLoans", status: "succeeded" as const, startedAt: at(0), finishedAt: at(1200) };

  it("names the plan item in flight, then the running tool, then just thinking", () => {
    const turn = newTurn(0);
    expect(progress(turn, false, 500)).toEqual({ kind: "active", label: "Thinking…" });
    const running = { ...turn, steps: [{ ...step, status: "running" as const }] };
    expect(progress(running, false, 500)).toEqual({ kind: "active", label: "listLoans…" });
    const planned = { ...running, todos: [{ id: "t", content: "Find prior executed loans", status: "in_progress" as const }] };
    expect(progress(planned, false, 500).label).toBe("Find prior executed loans…");
  });

  it("starts a counting clock only once a wait runs long", () => {
    const turn = newTurn(10_000);
    expect(progress(turn, false, 11_900).elapsed).toBeUndefined();
    expect(progress(turn, false, 12_000).elapsed).toBe("2 s");
    expect(progress(turn, false, 17_400).elapsed).toBe("7 s");
    expect(progress({ ...turn, endedAt: 17_400 }, false, 30_000).elapsed).toBeUndefined();
  });

  it("says how long the work took, and whether it failed or warned", () => {
    const turn = { ...newTurn(1000), endedAt: 3400, steps: [step] };
    expect(progress(turn, false)).toEqual({ kind: "done", label: "Worked for 2.4 s" });
    expect(progress({ ...turn, steps: [step, { ...step, id: "w", status: "warning" as const }] }, false).label).toBe(
      "Worked for 2.4 s · 1 warning"
    );
    expect(progress({ ...turn, steps: [{ ...step, status: "failed" as const }] }, false)).toEqual({
      kind: "failed",
      label: "Stopped after 2.4 s",
    });
    expect(progress(turn, true).kind).toBe("failed");
    expect(progress({ ...turn, incomplete: "cut" }, false).label).toBe("Cut short after 2.4 s");
  });

  it("replaces steps by id", () => {
    const steps = upsertStep([{ ...step, status: "running" }], step);
    expect(steps).toEqual([step]);
    expect(upsertStep(steps, { ...step, id: "b" })).toHaveLength(2);
  });

  it("flags a reply that arrived cut short", () => {
    expect(incompleteNotice({ status: "complete", missing: [] })).toBeUndefined();
    expect(incompleteNotice({ status: "incomplete", missing: [] })).toMatch(/stopped before/);
    expect(incompleteNotice({ status: "complete", missing: [3, 4] })).toMatch(/^2 parts/);
  });
});
