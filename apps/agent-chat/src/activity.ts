import type { PromptOption, ResultBlock, RunStep, Todo, TurnSummary } from "./transport";
import { toStatusKind, type StatusKind } from "./components/StatusIcon";

/** Everything a reply carries besides its text: how it was worked out, and its structured results. */
export interface TurnDetails {
  steps: RunStep[];
  todos: Todo[];
  blocks: ResultBlock[];
  options: PromptOption[];
  /** Client clock (ms) when the turn started and ended. */
  startedAt: number;
  endedAt?: number;
  /** Set when the reply arrived cut short. */
  incomplete?: string;
}

export function newTurn(startedAt: number): TurnDetails {
  return { steps: [], todos: [], blocks: [], options: [], startedAt };
}

/** Steps replace by id, so a step can move running → succeeded. */
export function upsertStep(steps: RunStep[], step: RunStep): RunStep[] {
  const index = steps.findIndex(entry => entry.id === step.id);
  return index === -1 ? [...steps, step] : steps.map((entry, i) => (i === index ? step : entry));
}

export function incompleteNotice(summary: TurnSummary): string | undefined {
  if (summary.status === "incomplete") {
    return "The reply stopped before the agent finished, so it may be incomplete.";
  }
  if (summary.missing.length) {
    const n = summary.missing.length;
    return `${n} part${n === 1 ? "" : "s"} of this reply didn't arrive, so it may be incomplete. Ask again to be sure.`;
  }
  return undefined;
}

/** "<0.1 s", "0.4 s", "12 s", "1 min 5 s". */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 100) return "<0.1 s";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** A step's own duration from its timestamps; undefined until both ends are known. */
export function formatDuration(startedAt?: string, finishedAt?: string): string | undefined {
  if (!startedAt || !finishedAt) return undefined;
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? formatElapsed(ms) : undefined;
}

/** "TypeSafe · route intent" → source "TypeSafe", action "route intent". */
export function splitStepTitle(title: string): { source?: string; action: string } {
  const at = title.indexOf(" · ");
  return at === -1 ? { action: title } : { source: title.slice(0, at), action: title.slice(at + 3) };
}

/** The one line above a reply: what it is doing now, or how the work went. */
export interface Progress {
  kind: StatusKind;
  label: string;
  /** While working, seconds so far once a turn runs long enough to wonder ("4 s"). */
  elapsed?: string;
}

/** A wait shorter than this needs no clock; past it, a counting clock says it hasn't stalled. */
export const SHOW_ELAPSED_AFTER_MS = 2000;

export function progress(turn: TurnDetails, failed: boolean, now: number = Date.now()): Progress {
  if (turn.endedAt === undefined) {
    // Say what is happening in the plan's words; fall back to the tool in flight.
    const planItem = turn.todos.find(todo => todo.status === "in_progress");
    const running = [...turn.steps].reverse().find(step => toStatusKind(step.status ?? "pending") === "active");
    const label = planItem?.content ?? (running ? splitStepTitle(running.title).action : "Thinking");
    const waited = now - turn.startedAt;
    return {
      kind: "active",
      label: `${label}…`,
      ...(waited >= SHOW_ELAPSED_AFTER_MS ? { elapsed: `${Math.floor(waited / 1000)} s` } : {}),
    };
  }
  const took = formatElapsed(turn.endedAt - turn.startedAt);
  const kinds = turn.steps.map(step => toStatusKind(step.status ?? "pending"));
  if (failed || kinds.includes("failed")) return { kind: "failed", label: `Stopped after ${took}` };
  if (turn.incomplete) return { kind: "warning", label: `Cut short after ${took}` };
  const warnings = kinds.filter(kind => kind === "warning").length;
  if (warnings) return { kind: "warning", label: `Worked for ${took} · ${warnings} warning${warnings === 1 ? "" : "s"}` };
  return { kind: "done", label: `Worked for ${took}` };
}
