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

/**
 * The wire contract a loan-agent backend streams back from `POST /chat`, one
 * JSON object per line. The first three kinds are box-agent-chat's own
 * `AgentStreamEvent` (`delta.text` is incremental, not cumulative); `trace`
 * feeds the decision-trace panel and `context` the loan header.
 */
export type LoanAgentEvent = AgentStreamEvent | TraceEvent | ContextEvent;

export type TraceListener = (event: TraceEvent) => void;

/** A box-agent-chat transport that also reports trace steps for each turn. */
export interface LoanAgentTransport extends AgentChatTransport {
  /** "demo" replays scripted demo beats; "live" talks to a backend. */
  readonly mode: "demo" | "live";
  /** Called once at the start of every turn, before any trace step. */
  onTurnStart?: () => void;
  onTrace?: TraceListener;
  onContext?: (loan: LoanContext) => void;
}

export type { RunStep };
