/**
 * Parsers for the LOS invocable actions' `outputValues`. The formats are the
 * Apex classes' own summaries (LosLoanList, LosLoanPackage,
 * LosExtractLoanTerms); a line that does not match is skipped, never guessed.
 */

export interface LoanRow {
  loanId: string;
  name: string;
  borrower: string;
  status: string;
  risk?: string;
  amount?: number;
}

export interface LoanDocument {
  fileId: string;
  name: string;
  href: string;
}

export interface LoanPackage {
  found: boolean;
  loanId?: string;
  recordId?: string;
  folderId?: string;
  name?: string;
  borrower?: string;
  status?: string;
  documents: LoanDocument[];
  summary: string;
}

export type TermField =
  | "loanAmount"
  | "interestRate"
  | "termMonths"
  | "collateralValue"
  | "ltv"
  | "dscr"
  | "maturityDate";

export const TERM_FIELDS: TermField[] = [
  "loanAmount",
  "interestRate",
  "termMonths",
  "collateralValue",
  "ltv",
  "dscr",
  "maturityDate",
];

export type Terms = Partial<Record<TermField, number | string>>;

export interface FieldCheck {
  field: TermField;
  document?: string;
  record?: string;
  status: "match" | "mismatch" | "new" | "not_found";
}

export interface Extraction {
  extracted: boolean;
  terms: Terms;
  checks: FieldCheck[];
  summary: string;
}

// "- LN-2026-0003 -- Name | Borrower | Status: Approved | Risk: Low | Amount: 4,800,000"
const LOAN_LINE = /^-\s*(LN-\d{4}-\d{4})\s+--\s+(.+)$/;

export function parseLoanList(summary: string): LoanRow[] {
  const rows: LoanRow[] = [];
  for (const line of summary.split("\n")) {
    const match = LOAN_LINE.exec(line.trim());
    if (!match) {
      continue;
    }
    const [name = "", borrower = "", ...rest] = match[2].split("|").map(part => part.trim());
    const field = (label: string) =>
      rest.find(part => part.startsWith(`${label}:`))?.slice(label.length + 1).trim();
    const amount = field("Amount");
    rows.push({
      loanId: match[1],
      name,
      borrower,
      status: field("Status") ?? "",
      risk: field("Risk"),
      amount: amount ? Number(amount.replaceAll(",", "")) : undefined,
    });
  }
  return rows;
}

// "- harborview-appraisal-2026.pdf - https://app.box.com/file/123"
const DOC_LINE = /^-\s*(.+?)\s+-\s+(https:\/\/\S+\/file\/(\d+))\s*$/;
// "LN-2026-0003 -- Name. Borrower: X. Status: Approved."
const HEADER = /^(LN-\d{4}-\d{4})\s+--\s+(.+?)\.\s+Borrower:\s+(.+?)\.\s+Status:\s+(.+?)\.?$/;

export function parseLoanPackage(values: Record<string, unknown>): LoanPackage {
  const summary = String(values.outputSummary ?? "");
  const documents: LoanDocument[] = [];
  let header: RegExpExecArray | null = null;
  for (const line of summary.split("\n")) {
    const trimmed = line.trim();
    header ??= HEADER.exec(trimmed);
    const doc = DOC_LINE.exec(trimmed);
    if (doc) {
      documents.push({ name: doc[1], href: doc[2], fileId: doc[3] });
    }
  }
  return {
    found: values.outputFound === true,
    loanId: stringOr(values.outputLoanReference) ?? header?.[1],
    recordId: stringOr(values.outputRecordId),
    folderId: stringOr(values.outputFolderId),
    name: header?.[2],
    borrower: header?.[3],
    status: header?.[4],
    documents,
    summary,
  };
}

// "- interestRate: document 6.85, record 6.5 (mismatch)" / "- ltv: document 75, record empty (new)"
const CHECK_LINE = /^-\s*(\w+):\s+document\s+(.+?),\s+record\s+(.+?)\s+\((match|mismatch|new)\)$/;
const NOT_FOUND_LINE = /^-\s*(\w+):\s+not found in the document$/;

export function parseExtraction(values: Record<string, unknown>): Extraction {
  const summary = String(values.validationSummary ?? "");
  const checks: FieldCheck[] = [];
  for (const line of summary.split("\n")) {
    const trimmed = line.trim();
    const check = CHECK_LINE.exec(trimmed);
    if (check && isTermField(check[1])) {
      checks.push({
        field: check[1],
        document: check[2],
        record: check[3] === "empty" ? undefined : check[3],
        status: check[4] as FieldCheck["status"],
      });
      continue;
    }
    const missing = NOT_FOUND_LINE.exec(trimmed);
    if (missing && isTermField(missing[1])) {
      checks.push({ field: missing[1], status: "not_found" });
    }
  }
  let terms: Terms = {};
  try {
    const parsed = JSON.parse(String(values.extractedJson ?? "{}")) as Record<string, unknown>;
    terms = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [TermField, number | string] =>
          isTermField(entry[0]) && (typeof entry[1] === "number" || typeof entry[1] === "string")
      )
    );
  } catch {
    // Leave terms empty; the checks still carry the document values.
  }
  return { extracted: values.extracted === true, terms, checks, summary };
}

function isTermField(value: string): value is TermField {
  return (TERM_FIELDS as string[]).includes(value);
}

function stringOr(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** LN-YYYY-NNNN sorts correctly as a string; newest first. */
export function newestFirst(rows: LoanRow[]): LoanRow[] {
  return [...rows].sort((a, b) => b.loanId.localeCompare(a.loanId));
}
