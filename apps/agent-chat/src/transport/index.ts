import { DemoLoanAgentTransport } from "./demoTransport";
import { HttpLoanAgentTransport } from "./httpTransport";
import type { LoanAgentTransport } from "./types";

export { proposalOutcome } from "./types";
export type {
  ActionOutcome,
  CheckStatus,
  LoanAgentEvent,
  LoanAgentTransport,
  LoanContext,
  LoanProposal,
  PromptOption,
  ResultBlock,
  RunStep,
  Todo,
  TraceEvent,
  TurnSummary,
} from "./types";

/**
 * `VITE_AGENT_API_URL` set → live backend; unset → the offline demo script.
 * `loan` is a loan ID or Salesforce record ID from the URL, passed through to
 * the backend as a hint; without one the backend resolves the loan from the
 * conversation and reports it with a `context` event.
 */
export function createTransport(loan: string | undefined): LoanAgentTransport {
  const baseUrl = agentBaseUrl();
  return baseUrl ? new HttpLoanAgentTransport(baseUrl, loan) : new DemoLoanAgentTransport();
}

/** The live backend's base URL, or undefined in demo mode. */
export function agentBaseUrl(): string | undefined {
  return import.meta.env.VITE_AGENT_API_URL?.replace(/\/+$/, "") || undefined;
}
