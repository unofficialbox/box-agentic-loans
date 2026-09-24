import { useState } from "react";
import type { AgentActionDecision, AgentActionProposal } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { approvalState, proposalAnchor } from "../conversations";
import { proposalDetails, proposalOutcome } from "../transport";
import { StatusIcon } from "./StatusIcon";

/** A decided proposal's one line: the officer's decision, and whether the action then ran. */
const RECORD = {
  approved: { label: "Approved", icon: "done" },
  failed: { label: "Approved · didn't complete", icon: "failed" },
  rejected: { label: "Rejected", icon: "skipped" },
} as const;

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
    const state = approvalState({ decision: proposal.decision, outcome: proposalOutcome(proposal) });
    const record = RECORD[state as Exclude<typeof state, "waiting">];
    const details = proposalDetails(proposal);
    return (
      <section
        id={anchor}
        tabIndex={-1}
        className={`approval-record approval-${state}`}
        aria-label={`${record.label}: ${proposal.title}`}
        role={state === "failed" ? "alert" : undefined}
      >
        <p className="approval-record-line">
          <StatusIcon kind={record.icon} />
          <span className="approval-record-state">{record.label}</span>
          <span className="approval-record-title">{proposal.title}</span>
        </p>
        {proposal.note && <p className="approval-note">{proposal.note}</p>}
        {details.length > 0 && (
          <dl className="approval-details">
            {details.map(item => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  {item.href ? (
                    <a href={item.href} target="_blank" rel="noreferrer">
                      {item.value}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    item.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
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
