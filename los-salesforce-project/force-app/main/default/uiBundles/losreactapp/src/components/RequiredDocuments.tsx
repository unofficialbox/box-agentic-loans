import { Upload, FileText } from "lucide-react";
import type { BoxFolderItem } from "../lib/box";
import { checklistFor, type ChecklistRow } from "../lib/requiredDocuments";
import { WorkspaceSkeleton } from "./WorkspaceSkeleton";
import { documentFacts } from "../lib/documents";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * What the bank still needs from the borrower, read off the folder.
 *
 * Each row shows a file whose `losDocument.documentType` Box AI wrote, not a file whose
 * name looks right -- the same metadata the lender's Copilot and the portfolio search
 * read, so all three agree about what has arrived. A file that has been uploaded but not
 * yet classified is listed underneath rather than matching a row it may not satisfy.
 *
 * The rows come from `REQUIRED_DOCUMENTS`, which mirrors the bank's own configuration.
 * Nothing here says what happens after a document arrives: review is the bank's process,
 * and this page faces the borrower.
 */
export function RequiredDocuments({
  loanType,
  includeAllFiles = false,
  files,
  canUpload,
  onUpload,
  onPreview,
}: {
  loanType?: string;
  /** Include every authorized file once, alongside any missing requirements. */
  includeAllFiles?: boolean;
  /** Null until the folder has been listed; the card waits rather than guessing. */
  files: BoxFolderItem[] | null;
  /** False until the workspace holds a Box token an upload could use. */
  canUpload: boolean;
  onUpload: () => void;
  /** Called when a received document is clicked to preview it. */
  onPreview?: (file: BoxFolderItem) => void;
}) {
  if (files === null) {
    return (
      <section className="box-live" data-testid="required-documents-loading">
        <div className="panel-head">
          <div>
            <h2>{includeAllFiles ? "Documents" : "Required documents"}</h2>
          </div>
        </div>
        <WorkspaceSkeleton showHeader={false} />
      </section>
    );
  }

  const checklist = checklistFor(loanType, files);
  if (!checklist && !includeAllFiles) return null;
  const rows: ChecklistRow[] = [...(checklist?.rows ?? [])];
  if (includeAllFiles) {
    const listed = new Set(rows.flatMap(row => row.file ? [row.file.id] : []));
    for (const file of files) {
      if (listed.has(file.id)) continue;
      listed.add(file.id);
      rows.push({ documentType: file.metadata?.enterprise?.losDocument?.documentType || "Other", label: file.metadata?.enterprise?.losDocument?.documentType || "Unclassified",
        why: "", status: "received", file });
    }
  }
  const outstanding = checklist ? checklist.rows.length - checklist.received : 0;

  return (
    <section className="box-live" data-testid="required-documents">
      <div className="panel-head">
        <div>
          <h2>{includeAllFiles ? "Documents" : "Required documents"}</h2>
          <p>
            {!checklist ? `${files.length} documents received.` : outstanding === 0
              ? "Everything the bank asked for has been received."
              : `${checklist.received} of ${checklist.rows.length} received.`}
          </p>
        </div>
        <div className="head-actions">
          <button
            type="button"
            className="upload-button"
            onClick={onUpload}
            disabled={!canUpload}
            data-testid="required-document-upload"
          >
            <Upload size={15} /> Upload document
          </button>
        </div>
      </div>
      <div className="box-table-host">
        <table className="box-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Last modified</th>
              <th scope="col">Size</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.file?.id ?? row.documentType}
                className={row.status === "received" ? "row-received" : "row-missing"}
                data-testid="required-document-row"
                data-status={row.status}
                data-document-type={row.documentType}
              >
                <td>
                  {row.status === "received" && row.file ? (
                    <button
                      type="button"
                      className="box-table-name"
                      onClick={() => onPreview?.(row.file!)}
                    >
                      <FileText size={16} aria-hidden="true" />
                      <span>{row.file.name}</span>
                    </button>
                  ) : (
                    row.label
                  )}
                </td>
                <td className="cell-type">
                  {row.status === "received" && row.file?.metadata?.enterprise?.losDocument?.documentType
                    ? row.file.metadata.enterprise.losDocument.documentType
                    : row.label}
                </td>
                <td>
                  {row.status === "received" && row.file ? (
                    <span className={`doc-status doc-status-${(documentFacts(row.file).status || "received").toLowerCase().replaceAll(" ", "-")}`}>
                      {documentFacts(row.file).status || "Received"}
                    </span>
                  ) : (
                    <span className="doc-status doc-status-missing">Missing</span>
                  )}
                </td>
                <td>
                  {row.status === "received" && row.file?.modified_at
                    ? new Date(row.file.modified_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td>
                  {row.status === "received" && row.file?.size != null
                    ? formatFileSize(row.file.size)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {checklist && checklist.unclassified.length > 0 ? (
        <p className="cb-checklist-note" data-testid="awaiting-classification">
          {checklist.unclassified.length === 1
            ? `${checklist.unclassified[0].name} has been received and is awaiting classification.`
            : `${checklist.unclassified.length} documents have been received and are awaiting classification.`}
        </p>
      ) : null}
    </section>
  );
}
