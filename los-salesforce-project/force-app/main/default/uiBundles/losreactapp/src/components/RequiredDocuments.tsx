import { CheckCircle2, Circle, Upload } from "lucide-react";
import type { BoxFolderItem } from "../lib/box";
import { checklistFor } from "../lib/requiredDocuments";

/**
 * What the bank still needs from the borrower, read off the folder.
 *
 * Each tick is a file whose `losDocument.documentType` Box AI wrote, not a file whose
 * name looks right -- the same metadata the lender's Copilot and the portfolio search
 * read, so all three agree about what has arrived. A file that has been uploaded but not
 * yet classified is listed underneath rather than ticking a row it may not satisfy.
 *
 * The rows come from `REQUIRED_DOCUMENTS`, which mirrors the bank's own configuration.
 * Nothing here says what happens after a document arrives: review is the bank's process,
 * and this page faces the borrower.
 */
export function RequiredDocuments({
  loanType,
  files,
  canUpload,
  onUpload,
}: {
  loanType?: string;
  /** Null until the folder has been listed; the card waits rather than guessing. */
  files: BoxFolderItem[] | null;
  /** False until the workspace holds a Box token an upload could use. */
  canUpload: boolean;
  onUpload: () => void;
}) {
  if (files === null) return null;
  const checklist = checklistFor(loanType, files);
  if (!checklist) return null;

  const outstanding = checklist.rows.length - checklist.received;

  return (
    <section className="cb-checklist" data-testid="required-documents">
      <div className="cb-checklist-head">
        <div>
          <h2>Required documents</h2>
          <p>
            {outstanding === 0
              ? "Everything the bank asked for has been received."
              : `${checklist.received} of ${checklist.rows.length} received.`}
          </p>
        </div>
      </div>
      <ul className="cb-checklist-rows">
        {checklist.rows.map((row) => (
          <li
            key={row.documentType}
            className={`cb-checklist-row cb-checklist-row-${row.status}`}
            data-testid="required-document-row"
            data-status={row.status}
            data-document-type={row.documentType}
          >
            <span className="cb-checklist-mark" aria-hidden="true">
              {row.status === "received" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </span>
            <span className="cb-checklist-copy">
              <strong>{row.label}</strong>
              <small>{row.status === "received" && row.file ? row.file.name : row.why}</small>
            </span>
            {row.status === "received" ? (
              <span className="doc-status doc-status-approved">Received</span>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={onUpload}
                disabled={!canUpload}
                data-testid="required-document-upload"
              >
                <Upload size={14} aria-hidden="true" /> Upload
              </button>
            )}
          </li>
        ))}
      </ul>
      {checklist.unclassified.length > 0 ? (
        <p className="cb-checklist-note" data-testid="awaiting-classification">
          {checklist.unclassified.length === 1
            ? `${checklist.unclassified[0].name} has been received and is awaiting classification.`
            : `${checklist.unclassified.length} documents have been received and are awaiting classification.`}
        </p>
      ) : null}
    </section>
  );
}
