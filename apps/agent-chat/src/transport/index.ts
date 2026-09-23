import { DemoLoanAgentTransport } from "./demoTransport";
import { HttpLoanAgentTransport } from "./httpTransport";
import type { LoanAgentTransport } from "./types";

export type {
  LoanAgentEvent,
  LoanAgentTransport,
  LoanContext,
  PromptOption,
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
  const baseUrl = import.meta.env.VITE_AGENT_API_URL?.replace(/\/+$/, "");
  return baseUrl ? new HttpLoanAgentTransport(baseUrl, loan) : new DemoLoanAgentTransport();
}
