import type { BoxFolderItem } from "./box";

/**
 * The facts about a document that both the table and the timeline need.
 *
 * Kept in one place because the two views must never disagree: a row saying a document was
 * approved while the timeline beside it says otherwise is worse than either view alone.
 */
export interface DocumentFacts {
  /** When the document itself changed, preferring Box's content date over the upload's. */
  changedAt?: string;
  /** Who Box records as having made that change. */
  changedBy?: string;
  /** Draft, Internal, Approved, Executed -- whatever the losDocument instance carries. */
  status?: string;
  /** True only when the document has actually been approved, not merely drafted. */
  approved: boolean;
}

export function documentFacts(file: BoxFolderItem): DocumentFacts {
  const los = file.metadata?.enterprise?.losDocument;
  const status = los?.versionStatus;
  return {
    changedAt: file.content_modified_at || file.modified_at,
    changedBy: file.modified_by?.name,
    status,
    approved: status === "Approved" || status === "Executed",
  };
}

/** A short, unambiguous date. Returns an em dash rather than "Invalid Date". */
export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Documents newest first.
 *
 * Sorts a copy: the table renders the folder's own order, and reordering it underneath
 * would make the two views disagree about which document is which.
 */
export function byMostRecent(files: BoxFolderItem[]): BoxFolderItem[] {
  return [...files].sort((a, b) => {
    const left = documentFacts(a).changedAt;
    const right = documentFacts(b).changedAt;
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return new Date(right).getTime() - new Date(left).getTime();
  });
}

export interface DocumentTotals {
  documents: number;
  approved: number;
  /** Anything still a draft or internal -- work that has not landed yet. */
  open: number;
  /** The most recent change across the package, or undefined if nothing carries a date. */
  lastChangedAt?: string;
}

export function documentTotals(files: BoxFolderItem[]): DocumentTotals {
  // Exclude Internal documents (hidden until released) from review progress count
  const visibleFiles = files.filter((f) => {
    const versionStatus = f.metadata?.enterprise?.losDocument?.versionStatus;
    return versionStatus !== 'Internal';
  });
  const facts = visibleFiles.map(documentFacts);
  const dates = facts.map((f) => f.changedAt).filter((d): d is string => Boolean(d));
  return {
    documents: visibleFiles.length,
    approved: facts.filter((f) => f.approved).length,
    open: facts.filter((f) => !f.approved).length,
    lastChangedAt: dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
  };
}

/**
 * Documents by type, largest first, ties broken on label.
 *
 * `documentType` is the losDocument field, so an untagged file is "Unclassified" rather
 * than missing -- a package where half the documents quietly do not appear in its own
 * breakdown is worse than one that admits the gap.
 */
export function byDocumentType(files: BoxFolderItem[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const label = file.metadata?.enterprise?.losDocument?.documentType?.trim() || "Unclassified";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/**
 * Documents by review status, largest first, ties broken on label.
 *
 * Reads the same `versionStatus` the table's pill and the timeline read, so the three
 * cannot disagree about what state a document is in. A document with no losDocument
 * instance is "Unclassified" rather than dropped -- the point of the chart is to show how
 * much of a package has actually landed, and silently omitting the untagged ones would
 * overstate it.
 */
export function byDocumentStatus(files: BoxFolderItem[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const label = documentFacts(file).status?.trim() || "Unclassified";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
