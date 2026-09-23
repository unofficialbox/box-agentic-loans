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

export type AgentEventBody =
  | { kind: "context"; loan: LoanContext }
  | { kind: "delta"; text: string }
  | { kind: "citation"; citation: Citation }
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
