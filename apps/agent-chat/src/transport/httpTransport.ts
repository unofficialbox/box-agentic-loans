import type {
  AgentActionProposal,
  AgentResolveActionRequest,
  AgentSendRequest,
} from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { readNdjson } from "./ndjson";
import type { LoanAgentTransport, LoanContext, TraceListener } from "./types";

/**
 * Talks to a loan-agent backend (for example a Strands agent that routes with
 * TypeSafe and calls the Box and LOS MCP servers):
 *
 *   POST {baseUrl}/chat             {message, sessionId, loan}  → NDJSON LoanAgentEvent stream
 *   POST {baseUrl}/actions/resolve  {proposalId, decision, note, sessionId} → AgentActionProposal
 *
 * The session token is sent as a bearer token. Governed writes never happen
 * on /chat: the backend emits a proposal and waits for /actions/resolve.
 */
export class HttpLoanAgentTransport implements LoanAgentTransport {
  readonly mode = "live" as const;
  onTurnStart?: () => void;
  onTrace?: TraceListener;
  onContext?: (loan: LoanContext) => void;

  constructor(
    private readonly baseUrl: string,
    private readonly loan: string | undefined
  ) {}

  async sendMessage(request: AgentSendRequest): Promise<void> {
    this.onTurnStart?.();
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: "POST",
      headers: this.headers(request.token),
      body: JSON.stringify({ message: request.body, sessionId: request.token, loan: this.loan }),
      signal: request.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Agent backend returned ${response.status} ${response.statusText}`.trim());
    }
    for await (const event of readNdjson(response.body)) {
      if (event.kind === "trace") {
        this.onTrace?.(event);
      } else if (event.kind === "context") {
        this.onContext?.(event.loan);
      } else {
        request.onEvent(event);
      }
    }
  }

  async resolveAction(request: AgentResolveActionRequest): Promise<AgentActionProposal> {
    const response = await fetch(`${this.baseUrl}/actions/resolve`, {
      method: "POST",
      headers: this.headers(request.token),
      body: JSON.stringify({
        proposalId: request.proposalId,
        decision: request.decision,
        note: request.note,
        sessionId: request.token,
      }),
    });
    if (!response.ok) {
      throw new Error(`Agent backend returned ${response.status} ${response.statusText}`.trim());
    }
    return (await response.json()) as AgentActionProposal;
  }

  private headers(token: string): HeadersInit {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }
}
