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

export type AgentEvent =
  | { kind: "context"; loan: LoanContext }
  | { kind: "delta"; text: string }
  | { kind: "citation"; citation: Citation }
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "trace"; step: TraceStep };

export type Emit = (event: AgentEvent) => void;
