import { DemoLoanAgentTransport } from "./demoTransport";
import { HttpLoanAgentTransport } from "./httpTransport";
import type { LoanAgentTransport } from "./types";

export type { LoanAgentEvent, LoanAgentTransport, TraceEvent } from "./types";

/**
 * `VITE_AGENT_API_URL` set → live backend; unset → the offline demo script.
 * `loan` is a loan ID or Salesforce record ID, passed through to the backend.
 */
export function createTransport(loan: string): LoanAgentTransport {
  const baseUrl = import.meta.env.VITE_AGENT_API_URL?.replace(/\/+$/, "");
  return baseUrl ? new HttpLoanAgentTransport(baseUrl, loan) : new DemoLoanAgentTransport();
}
