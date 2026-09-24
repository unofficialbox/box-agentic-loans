/**
 * Wire contract shared with apps/agent-chat (see its README): NDJSON events
 * from POST /chat and the proposal returned by POST /actions/resolve.
 */

export interface Citation {
  id: string;
  label: string;
  href?: string;
}

export interface Proposal {
  id: string;
  title: string;
  summary?: string;
  params?: Array<{ label: string; value: string }>;
  decision?: "approved" | "rejected";
  /** Once approved: whether the action then ran ("done") or failed ("failed"). */
  outcome?: "done" | "failed";
  note?: string;
}

export type StepStatus = "pending" | "running" | "succeeded" | "warning" | "failed" | "skipped";

export interface TraceStep {
  id: string;
  title: string;
  description?: string;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
}

/** The loan the turn resolved to, so the UI header matches what the agent worked on. */
export interface LoanContext {
  loanId: string;
  name?: string;
  borrower?: string;
  status?: string;
}

export type TodoStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface PromptOption {
  label: string;
  prompt: string;
}

/** Answered, waiting on the officer (a question or an approval), or failed. */
export type TurnStatus = "complete" | "needs_input" | "error";

/** How a row reads at a glance: within bounds, needs a look, out of bounds, or just information. */
export type CheckStatus = "pass" | "warn" | "fail" | "info";

/**
 * Structured results, rendered by the client as real tables and status rows
 * rather than text. A reply is a short sentence (`delta`) plus these.
 */
export type ResultBlock =
  /** Label/value pairs: extracted terms, a loan's attributes. */
  | { type: "facts"; title?: string; rows: Array<{ label: string; value: string }> }
  /** Rules checked, each with a verdict. */
  | {
      type: "checks";
      title?: string;
      rows: Array<{ label: string; value?: string; detail?: string; status: CheckStatus }>;
    }
  /** A comparison or listing; a row's status marks it, its note says why. */
  | {
      type: "table";
      title?: string;
      columns: string[];
      rows: Array<{ cells: string[]; status?: CheckStatus; note?: string }>;
      footnote?: string;
    }
  /** Box files, each linked; `id` matches the file's citation. */
  | { type: "documents"; title?: string; items: Array<{ id: string; name: string; detail?: string; href?: string }> };

export type AgentEventBody =
  | { kind: "context"; loan: LoanContext }
  | { kind: "delta"; text: string }
  | { kind: "citation"; citation: Citation }
  /** A structured result, shown after the reply's text. */
  | { kind: "block"; block: ResultBlock }
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "trace"; step: TraceStep }
  /** The plan for this turn; each event is a full snapshot. */
  | { kind: "todos"; todos: Todo[] }
  /** Prompts to offer next. */
  | { kind: "options"; options: PromptOption[] }
  /** Always the last event of a turn. */
  | { kind: "done"; status: TurnStatus };

/** `seq` counts 1, 2, 3… per turn so the client can detect a truncated stream. */
export type AgentEvent = AgentEventBody & { seq: number };

export type Emit = (event: AgentEvent) => void;
