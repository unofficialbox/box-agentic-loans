import type { RunStep } from "@unofficialbox/box-open-elements";
import type { Todo } from "./transport";
import { toStatusKind, type StatusKind } from "./components/StatusIcon";

/** What the turn is doing, in one phrase for the activity card's header. */
export interface TurnSummary {
  kind: StatusKind | "idle" | "approval";
  label: string;
}

/** "0.4 s", "12 s"; undefined until both ends are known. */
export function formatDuration(startedAt?: string, finishedAt?: string): string | undefined {
  if (!startedAt || !finishedAt) return undefined;
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 100) return "<0.1 s";
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

/** Wall-clock span of the turn: first start to last finish. */
export function turnDuration(steps: RunStep[]): string | undefined {
  const starts = steps.map(step => step.startedAt).filter((v): v is string => Boolean(v)).sort();
  const ends = steps.map(step => step.finishedAt).filter((v): v is string => Boolean(v)).sort();
  return formatDuration(starts[0], ends[ends.length - 1]);
}

/** "TypeSafe · route intent" → source "TypeSafe", action "route intent". */
export function splitStepTitle(title: string): { source?: string; action: string } {
  const at = title.indexOf(" · ");
  return at === -1 ? { action: title } : { source: title.slice(0, at), action: title.slice(at + 3) };
}

export function summarize(steps: RunStep[], todos: Todo[], awaitingApproval: boolean): TurnSummary {
  if (steps.length === 0 && todos.length === 0) return { kind: "idle", label: "Nothing yet" };
  const kinds = steps.map(step => toStatusKind(step.status ?? "pending"));
  if (kinds.includes("active") || todos.some(todo => todo.status === "in_progress")) {
    return { kind: "active", label: "Working" };
  }
  if (kinds.includes("failed")) return { kind: "failed", label: "Stopped" };
  if (awaitingApproval) return { kind: "approval", label: "Waiting for your approval" };
  const took = turnDuration(steps);
  if (kinds.includes("warning")) return { kind: "warning", label: took ? `Done with a warning · ${took}` : "Done with a warning" };
  return { kind: "done", label: took ? `Done · ${took}` : "Done" };
}
