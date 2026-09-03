import { History } from "lucide-react";
import type { BoxFolderItem } from "../lib/box";
import { byMostRecent, documentFacts, formatDate } from "../lib/documents";
import { TimelineSkeleton } from "./WorkspaceSkeleton";

/**
 * What has happened to this loan's documents, newest first.
 *
 * Every entry is something Box actually recorded: a document changed, on a date, by a
 * named person. Approval is shown as the state that change left the document in, not as a
 * separate dated event -- because it is not one. `losDocument` carries an approval status
 * but no approval timestamp and no approver, so a line reading "Approved by X on Y" would
 * be invented. A timeline that quietly fabricates half its entries is worse than one that
 * shows fewer.
 *
 * The borrower sees this too, so it lists only documents that survived the Internal
 * filter -- it is built from the same array the table renders, not from a second fetch.
 */
export function DocumentTimeline({ files }: { files: BoxFolderItem[] | null }) {
  // Null is "not known yet" and an empty array is "known, and there are none". Collapsing
  // them would have this panel claim nothing has been filed while the fetch is still in
  // flight.
  const ordered = files === null ? [] : byMostRecent(files);

  return (
    <aside className="timeline-panel" data-testid="document-timeline">
      <div className="timeline-head">
        <span className="timeline-title">
          <History size={16} aria-hidden="true" /> Document history
        </span>
      </div>

      {files === null ? (
        <TimelineSkeleton />
      ) : ordered.length === 0 ? (
        <div className="workspace-state" data-testid="timeline-empty">
          Nothing has been filed against this loan yet.
        </div>
      ) : (
        <ol className="timeline">
          {ordered.map((file) => {
            const facts = documentFacts(file);
            return (
              <li key={file.id} className="timeline-item" data-testid="timeline-item">
                <span
                  className={`timeline-dot${facts.approved ? " timeline-dot-approved" : ""}`}
                  aria-hidden="true"
                />
                <div className="timeline-body">
                  <time className="timeline-date" dateTime={facts.changedAt}>
                    {formatDate(facts.changedAt)}
                  </time>
                  <p className="timeline-name">{file.name}</p>
                  <p className="timeline-meta">
                    {facts.changedBy ? `Updated by ${facts.changedBy}` : "Updated"}
                    {facts.status ? (
                      <>
                        {" · "}
                        <span className={`doc-status doc-status-${facts.status.toLowerCase()}`}>
                          {facts.status}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
