import type {
  AgentChatTransport,
  AgentStreamEvent,
} from "@unofficialbox/box-open-elements/patterns/agent-chat";
import type { RunStep } from "@unofficialbox/box-open-elements";

/**
 * A decision-trace step for the current turn: the TypeSafe routing call, each
 * MCP tool call, and each governance gate. Steps with the same `id` replace
 * each other, so a step can go running → succeeded.
 */
export interface TraceEvent {
  kind: "trace";
  step: RunStep;
}

/** The loan the backend resolved this turn to (live mode only). */
export interface LoanContext {
  loanId: string;
  name?: string;
  borrower?: string;
  status?: string;
}

export interface ContextEvent {
  kind: "context";
  loan: LoanContext;
}

export type TodoStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
}

/** The agent's plan for this turn. Each event is a full snapshot, not a diff. */
export interface TodosEvent {
  kind: "todos";
  todos: Todo[];
}

/** A prompt the officer can send next, e.g. a follow-up the agent suggests. */
export interface PromptOption {
  label: string;
  prompt: string;
}

export interface OptionsEvent {
  kind: "options";
  options: PromptOption[];
}

/** How a result row reads at a glance. */
export type CheckStatus = "pass" | "warn" | "fail" | "info";

/**
 * A structured result, rendered as a real table or status list rather than
 * text. A reply is a short sentence plus these.
 */
export type ResultBlock =
  | { type: "facts"; title?: string; rows: Array<{ label: string; value: string }> }
  | { type: "checks"; title?: string; rows: Array<{ label: string; value?: string; detail?: string; status: CheckStatus }> }
  | {
      type: "table";
      title?: string;
      columns: string[];
      rows: Array<{ cells: string[]; status?: CheckStatus; note?: string }>;
      footnote?: string;
    }
  /** Box files; `id` matches the file's citation, so the client can skip the duplicate chip. */
  | { type: "documents"; title?: string; items: Array<{ id: string; name: string; detail?: string; href?: string }> };

export interface BlockEvent {
  kind: "block";
  block: ResultBlock;
}

/** How the turn ended: answered, waiting on the officer (a question or approval), or failed. */
export type TurnStatus = "complete" | "needs_input" | "error";

export interface DoneEvent {
  kind: "done";
  status: TurnStatus;
}

/**
 * The wire contract a loan-agent backend streams back from `POST /chat`, one
 * JSON object per line. The first three kinds are the agent-chat controller's own
 * `AgentStreamEvent` (`delta.text` is incremental, not cumulative). The rest
 * feed the page: `block` the structured results, `trace` the decision trace, `todos` the plan, `options` the
 * next-step chips, `context` the loan header, and `done` closes the turn.
 *
 * Every event may carry `seq`, numbered 1, 2, 3… per turn, so the client can
 * tell a truncated reply from a complete one.
 */
export type LoanAgentEvent = (
  | AgentStreamEvent
  | TraceEvent
  | BlockEvent
  | ContextEvent
  | TodosEvent
  | OptionsEvent
  | DoneEvent
) & { seq?: number };

export type TraceListener = (event: TraceEvent) => void;

/** What the client observed about a finished turn. */
export interface TurnSummary {
  /** The backend's `done` status, or "incomplete" when the stream ended without one. */
  status: TurnStatus | "incomplete";
  /** `seq` numbers that never arrived. */
  missing: number[];
}

/** An agent-chat transport that also reports the side channels for each turn. */
export interface LoanAgentTransport extends AgentChatTransport {
  /** "demo" replays scripted demo beats; "live" talks to a backend. */
  readonly mode: "demo" | "live";
  /** Called once at the start of every turn, before any other callback. */
  onTurnStart?: () => void;
  onTrace?: TraceListener;
  onBlock?: (block: ResultBlock) => void;
  onContext?: (loan: LoanContext) => void;
  onTodos?: (todos: Todo[]) => void;
  onOptions?: (options: PromptOption[]) => void;
  onTurnEnd?: (summary: TurnSummary) => void;
}

export type { RunStep };
