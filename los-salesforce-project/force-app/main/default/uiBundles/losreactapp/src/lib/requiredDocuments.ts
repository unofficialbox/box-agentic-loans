import type { BoxFolderItem } from "./box";

/**
 * What the bank asks for, per kind of loan.
 *
 * This is the same list as `config/los/required-documents.bcl`, and a test in the
 * repository's `tests/` directory parses both and fails when they drift -- so the literal
 * below stays plain JSON (quoted keys, no trailing commas, no expressions). The checklist
 * a borrower sees and the list the bank's tooling reads must be one list.
 *
 * `documentType` is the losDocument enum value Box AI writes; `label` is what the
 * borrower reads; `why` is the one sentence that says what the document is for, because
 * a checklist that only names things reads as an obstacle course.
 */
export interface RequiredDocument {
  documentType: string;
  label: string;
  why: string;
}

export const REQUIRED_DOCUMENTS: Record<string, RequiredDocument[]> = {
  "Term Loan": [
    { "documentType": "Financial Statement", "label": "Financial statements", "why": "Your latest balance sheet and income statement, so we can see how the business is performing." },
    { "documentType": "Tax Return", "label": "Business tax returns", "why": "Filed returns that confirm the income your financial statements report." },
    { "documentType": "Bank Statement", "label": "Bank statements", "why": "Recent statements showing the cash flow that will service the loan." }
  ],
  "Line of Credit": [
    { "documentType": "Financial Statement", "label": "Financial statements", "why": "Your latest balance sheet and income statement, so we can see how the business is performing." },
    { "documentType": "Bank Statement", "label": "Bank statements", "why": "Recent statements showing the cash flow that will service the loan." }
  ],
  "Equipment Finance": [
    { "documentType": "Financial Statement", "label": "Financial statements", "why": "Your latest balance sheet and income statement, so we can see how the business is performing." },
    { "documentType": "Tax Return", "label": "Business tax returns", "why": "Filed returns that confirm the income your financial statements report." }
  ],
  "Commercial Real Estate": [
    { "documentType": "Financial Statement", "label": "Financial statements", "why": "Your latest balance sheet and income statement, so we can see how the business is performing." },
    { "documentType": "Tax Return", "label": "Business tax returns", "why": "Filed returns that confirm the income your financial statements report." },
    { "documentType": "Bank Statement", "label": "Bank statements", "why": "Recent statements showing the cash flow that will service the loan." },
    { "documentType": "Appraisal", "label": "Property appraisal", "why": "An independent value for the property the loan secures." },
    { "documentType": "Insurance", "label": "Proof of insurance", "why": "Evidence the property is insured, with the bank named on the policy." },
    { "documentType": "Environmental Report", "label": "Environmental report", "why": "An assessment confirming the property carries no environmental liability." }
  ],
  "SBA 7(a)": [
    { "documentType": "Financial Statement", "label": "Financial statements", "why": "Your latest balance sheet and income statement, so we can see how the business is performing." },
    { "documentType": "Tax Return", "label": "Business tax returns", "why": "Filed returns that confirm the income your financial statements report." },
    { "documentType": "Bank Statement", "label": "Bank statements", "why": "Recent statements showing the cash flow that will service the loan." },
    { "documentType": "Insurance", "label": "Proof of insurance", "why": "Evidence the collateral is insured, with the bank named on the policy." }
  ]
};

/** Loan statuses during which the bank is still collecting the borrower's documents. */
export const COLLECTING_STATUSES = new Set(["Application", "Underwriting", "Approved"]);

export interface ChecklistRow extends RequiredDocument {
  status: "received" | "missing";
  /** The first listed file carrying this type, when one does. */
  file?: BoxFolderItem;
}

export interface Checklist {
  rows: ChecklistRow[];
  /** Uploaded, but not yet carrying a documentType, so they tick nothing. */
  unclassified: BoxFolderItem[];
  received: number;
}

/**
 * The checklist for one loan, read against its folder.
 *
 * A row is received when a listed file's `losDocument.documentType` equals the row's
 * type -- the metadata Box AI wrote, not the file's name. A file with no metadata is
 * shown separately as received-but-unclassified rather than counted against a row it may
 * or may not satisfy: ticking it would claim a document the bank has not yet recognised.
 *
 * Null when the loan type has no list, which is how a loan of a type this file does not
 * know about draws no checklist rather than an empty one.
 */
export function checklistFor(loanType: string | undefined, files: BoxFolderItem[]): Checklist | null {
  const required = loanType ? REQUIRED_DOCUMENTS[loanType] : undefined;
  if (!required) return null;

  const rows: ChecklistRow[] = required.map((row) => {
    const file = files.find(
      (item) => item.metadata?.enterprise?.losDocument?.documentType === row.documentType,
    );
    return file ? { ...row, status: "received", file } : { ...row, status: "missing" };
  });
  return {
    rows,
    unclassified: files.filter((item) => !item.metadata?.enterprise?.losDocument?.documentType),
    received: rows.filter((row) => row.status === "received").length,
  };
}
