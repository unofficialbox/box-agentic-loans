import { proposalAnchor, type ChatSummary } from "../conversations";
import { FileIcon, PolicyIcon } from "./icons";
import { StatusIcon } from "./StatusIcon";

/**
 * The right sidebar: what this conversation is about and what it produced,
 * the way Claude and ChatGPT keep outputs and sources beside the chat. It is
 * about the conversation, not the turn: the turn's steps stay in the reply.
 */
export function DetailsPanel({ summary }: { summary: ChatSummary }) {
  const { loan, approvals, sources } = summary;
  const waiting = approvals.filter(approval => !approval.decision).length;

  const jumpTo = (proposalId: string) => {
    const card = document.getElementById(proposalAnchor(proposalId));
    if (!card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    card.focus({ preventScroll: true });
  };

  return (
    <div className="pane-inner details">
      <section className="details-section" aria-labelledby="details-loan">
        <h2 className="pane-heading" id="details-loan">
          Loan
        </h2>
        {loan ? (
          <>
            {loan.name && <p className="details-loan-name">{loan.name}</p>}
            <dl className="details-facts">
              <div>
                <dt>Loan ID</dt>
                <dd>{loan.loanId}</dd>
              </div>
              {loan.status && (
                <div>
                  <dt>Status</dt>
                  <dd>{loan.status}</dd>
                </div>
              )}
              {loan.borrower && (
                <div>
                  <dt>Borrower</dt>
                  <dd>{loan.borrower}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="details-empty">None yet. Name a borrower or a loan ID and the copilot finds it.</p>
        )}
      </section>

      <section className="details-section" aria-labelledby="details-approvals">
        <h2 className="pane-heading" id="details-approvals">
          Approvals
          {waiting > 0 && <span className="pane-count pane-count-waiting">{waiting} waiting</span>}
        </h2>
        {approvals.length ? (
          <ul className="details-list">
            {approvals.map(approval => {
              const kind = approval.decision === "approved" ? "done" : approval.decision === "rejected" ? "skipped" : "pending";
              const state = approval.decision === "approved" ? "Approved" : approval.decision === "rejected" ? "Rejected" : "Needs your approval";
              return (
                <li key={approval.id}>
                  <button type="button" className="details-row" onClick={() => jumpTo(approval.id)}>
                    <StatusIcon kind={kind} />
                    <span className="details-row-text">
                      <span className="details-row-title">{approval.title}</span>
                      <span className="details-row-meta">{state}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="details-empty">Record updates, letters and signature requests wait here for you.</p>
        )}
      </section>

      <section className="details-section" aria-labelledby="details-sources">
        <h2 className="pane-heading" id="details-sources">
          Sources
          {sources.length > 0 && <span className="pane-count">{sources.length}</span>}
        </h2>
        {sources.length ? (
          <ul className="details-list">
            {sources.map(source => {
              // Policies cite by ID ("LOS-LTV-001 · …"); everything else is a Box file.
              const policy = /^[A-Z]+-[A-Z]+-\d+/.test(source.label);
              const content = (
                <>
                  {policy ? <PolicyIcon /> : <FileIcon />}
                  <span className="details-row-text">
                    <span className="details-row-title">{source.label}</span>
                    <span className="details-row-meta">{policy ? "Credit policy" : source.href ? "Opens in Box" : "Document"}</span>
                  </span>
                </>
              );
              return (
                <li key={source.id}>
                  {source.href ? (
                    <a className="details-row" href={source.href} target="_blank" rel="noreferrer">
                      {content}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="details-row details-row-static">{content}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="details-empty">Documents and policies the copilot cites collect here.</p>
        )}
      </section>
    </div>
  );
}
