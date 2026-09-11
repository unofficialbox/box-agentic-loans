import { FileText } from "lucide-react";
import type { BoxFolderItem } from "../lib/box";
import { documentFacts, formatDate } from "../lib/documents";

function formatSize(bytes?: number): string {
  if (bytes == null) return "—";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * The loan package, listed from the governed folder.
 *
 * Hand-rolled rather than a Content Explorer. The element never emitted a file
 * activation in this embedding -- it renders in its small/touch mode regardless of width,
 * and its ItemList only opens a file when `!isTouch` -- so preview could not be reached
 * through it. Listing the folder ourselves and mounting ContentPreview directly is the
 * pattern the qualitypilot reference uses, and it puts the click in our hands.
 */
export function BoxDocumentTable({
  files,
  onSelect,
}: {
  files: BoxFolderItem[];
  onSelect: (file: BoxFolderItem) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="workspace-state" data-testid="box-table-empty">
        There are no documents in this folder yet.
      </div>
    );
  }

  return (
    <table className="box-table" data-testid="box-document-table">
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
        {files.map((file) => (
          <tr
            key={file.id}
            data-testid="box-table-row"
          >
            <td>
              {/* A button, not a row handler: the file name is the thing you activate,
                  and it stays reachable from the keyboard. */}
              <button type="button" className="box-table-name" onClick={() => onSelect(file)}>
                <FileText size={16} aria-hidden="true" />
                <span>{file.name}</span>
              </button>
            </td>
            <td className="cell-type">
              {file.metadata?.enterprise?.losDocument?.documentType || "—"}
            </td>
            <td>
              {documentFacts(file).status ? (
                <span className={`doc-status doc-status-${documentFacts(file).status!.toLowerCase().replaceAll(" ", "-")}`}>
                  {documentFacts(file).status}
                </span>
              ) : (
                <span className="doc-status doc-status-none">Unclassified</span>
              )}
            </td>
            <td>
              <span className="cell-stack">
                <span>{formatDate(documentFacts(file).changedAt)}</span>
                {/* Who, under when: the date answers "is this current", the name answers
                    "whose change was it", and they are read in that order. */}
                <small>{documentFacts(file).changedBy || "—"}</small>
              </span>
            </td>
            <td>{formatSize(file.size)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
