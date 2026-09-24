import { useState } from "react";
import type { AgentActionDecision, AgentActionProposal } from "@unofficialbox/box-open-elements/patterns/agent-chat";

const EYEBROW: Record<"pending" | AgentActionDecision, string> = {
  pending: "Needs your approval",
  approved: "Approved",
  rejected: "Rejected",
};

/**
 * A governed action held for the officer: the one card in the thread. Nothing
 * runs until Approve; once decided it settles into a quiet record.
 */
export function ApprovalCard({
  proposal,
  onResolve,
}: {
  proposal: AgentActionProposal;
  onResolve: (decision: AgentActionDecision) => Promise<string | undefined>;
}) {
  const [busy, setBusy] = useState<AgentActionDecision | null>(null);
  const [error, setError] = useState<string>();
  const state = proposal.decision ?? "pending";

  const decide = async (decision: AgentActionDecision) => {
    setBusy(decision);
    setError(undefined);
    setError(await onResolve(decision));
    setBusy(null);
  };

  return (
    <section className={`approval approval-${state}`} aria-label={`${EYEBROW[state]}: ${proposal.title}`}>
      <p className="approval-eyebrow">{EYEBROW[state]}</p>
      <h3 className="approval-title">{proposal.title}</h3>
      {proposal.summary && <p className="approval-summary">{proposal.summary}</p>}
      {proposal.params && proposal.params.length > 0 && (
        <dl className="facts approval-params">
          {proposal.params.map(param => (
            <div key={param.label} className="fact">
              <dt>{param.label}</dt>
              <dd>{param.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {proposal.note && <p className="approval-note">{proposal.note}</p>}
      {error && (
        <p className="approval-error" role="alert">
          {error}
        </p>
      )}
      {state === "pending" && (
        <div className="approval-actions">
          <button type="button" className="button button-primary" disabled={busy !== null} aria-busy={busy === "approved"} onClick={() => decide("approved")}>
            {busy === "approved" && <span className="button-spinner" aria-hidden="true" />}
            {busy === "approved" ? "Approving…" : "Approve"}
          </button>
          <button type="button" className="button" disabled={busy !== null} aria-busy={busy === "rejected"} onClick={() => decide("rejected")}>
            {busy === "rejected" && <span className="button-spinner" aria-hidden="true" />}
            {busy === "rejected" ? "Rejecting…" : "Reject"}
          </button>
          <span className="approval-hint">To change it, reply with the new values.</span>
        </div>
      )}
    </section>
  );
}
