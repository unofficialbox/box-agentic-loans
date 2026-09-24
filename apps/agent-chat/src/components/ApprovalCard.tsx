import { useState } from "react";
import type { AgentActionDecision, AgentActionProposal } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { proposalAnchor } from "../conversations";
import { StatusIcon } from "./StatusIcon";

/**
 * A governed action held for the officer. While it waits it is the one card
 * in the thread: plain, hairline-bordered, with Approve as the only filled
 * button. Once decided it steps back to a single line of record, like a
 * permission result, so the thread reads as history rather than as cards.
 */
export function ApprovalCard({
  sessionId,
  proposal,
  onResolve,
}: {
  sessionId: string;
  proposal: AgentActionProposal;
  onResolve: (decision: AgentActionDecision) => Promise<string | undefined>;
}) {
  const [busy, setBusy] = useState<AgentActionDecision | null>(null);
  const [error, setError] = useState<string>();
  const anchor = proposalAnchor(sessionId, proposal.id);

  const decide = async (decision: AgentActionDecision) => {
    setBusy(decision);
    setError(undefined);
    setError(await onResolve(decision));
    setBusy(null);
  };

  if (proposal.decision) {
    const approved = proposal.decision === "approved";
    return (
      <section id={anchor} tabIndex={-1} className={`approval-record approval-${proposal.decision}`} aria-label={`${approved ? "Approved" : "Rejected"}: ${proposal.title}`}>
        <p className="approval-record-line">
          <StatusIcon kind={approved ? "done" : "skipped"} />
          <span className="approval-record-state">{approved ? "Approved" : "Rejected"}</span>
          <span className="approval-record-title">{proposal.title}</span>
        </p>
        {proposal.note && <p className="approval-note">{proposal.note}</p>}
      </section>
    );
  }

  return (
    <section id={anchor} tabIndex={-1} className="approval" aria-label={`Needs your approval: ${proposal.title}`}>
      <p className="approval-eyebrow">
        <StatusIcon kind="pending" />
        Needs your approval
      </p>
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
      {error && (
        <p className="approval-error" role="alert">
          {error}
        </p>
      )}
      <div className="approval-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={busy !== null}
          aria-busy={busy === "approved"}
          onClick={() => decide("approved")}
        >
          {busy === "approved" && <span className="button-spinner" aria-hidden="true" />}
          {busy === "approved" ? "Approving…" : "Approve"}
        </button>
        <button type="button" className="button" disabled={busy !== null} aria-busy={busy === "rejected"} onClick={() => decide("rejected")}>
          {busy === "rejected" && <span className="button-spinner" aria-hidden="true" />}
          {busy === "rejected" ? "Rejecting…" : "Reject"}
        </button>
        <span className="approval-hint">To change it, reply with the new values.</span>
      </div>
    </section>
  );
}
