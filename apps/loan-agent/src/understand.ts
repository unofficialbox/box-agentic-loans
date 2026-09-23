import type { TermField, Terms } from "./los.js";

/**
 * Everything the agent can do, as the closed option set TypeSafe chooses
 * from. The descriptions are the criteria TypeSafe scores the message against.
 */
export const INTENTS = {
  find_risk_documents:
    "Identify a borrower's latest loan, or find which documents in a loan are flagged with a policy risk level",
  extract_and_check: "Extract loan terms from a loan document and check them against credit policy",
  validate_record: "Compare terms from a document against the Salesforce loan record",
  apply_terms: "Write, apply, or update accepted loan terms on the loan record",
  compare_history: "Compare terms or covenants with the borrower's prior or executed loans",
  generate_letter: "Generate or draft a commitment letter",
  send_for_signature: "Send a generated letter or document for signature",
  list_loans: "List loans, or answer a portfolio question about loans by borrower or status",
  out_of_scope: "A greeting, thanks, or anything the loan tools cannot do",
} as const;

export type Intent = keyof typeof INTENTS;

/**
 * Argument extraction is rules, not a model: TypeSafe cannot produce free
 * text, and a regex either matches or leaves the slot empty for the engine to
 * resolve or ask about.
 */

const LOAN_ID = /\bLN-\d{4}-\d{4}\b/i;
// Salesforce record IDs: 15 or 18 alphanumerics, LOS_Loan__c records start "a0".
const RECORD_ID = /\ba0[a-zA-Z0-9]{13}(?:[a-zA-Z0-9]{3})?\b/;

export function loanReference(message: string): string | undefined {
  return LOAN_ID.exec(message)?.[0].toUpperCase() ?? RECORD_ID.exec(message)?.[0];
}

const RISK_LEVELS = ["Critical", "High", "Medium", "Low"] as const;

export function riskLevel(message: string): (typeof RISK_LEVELS)[number] {
  const lower = message.toLowerCase();
  return RISK_LEVELS.find(level => lower.includes(level.toLowerCase())) ?? "Critical";
}

const STATUSES = ["Application", "Underwriting", "Credit Review", "Approved", "Commitment", "Closed", "Servicing"];

export function loanStatus(message: string): string | undefined {
  const lower = message.toLowerCase();
  return STATUSES.find(status => lower.includes(status.toLowerCase()));
}

/** Document kinds, matched against both the message and Box file names. */
export const DOCUMENT_KINDS: Array<{ kind: string; message: RegExp; file: RegExp }> = [
  { kind: "term sheet", message: /term[\s-]?sheet|markup|marked[\s-]?up/i, file: /term-sheet/i },
  { kind: "appraisal", message: /apprais/i, file: /apprais/i },
  { kind: "financial statements", message: /financial statement/i, file: /financial-statement/i },
  { kind: "application", message: /\bapplication\b/i, file: /application/i },
  { kind: "loan agreement", message: /loan agreement|executed/i, file: /agreement|executed/i },
];

export function documentKind(message: string): string | undefined {
  return DOCUMENT_KINDS.find(entry => entry.message.test(message))?.kind;
}

export function filePattern(kind: string): RegExp | undefined {
  return DOCUMENT_KINDS.find(entry => entry.kind === kind)?.file;
}

const FIELD_WORDS: Array<[TermField, RegExp]> = [
  ["loanAmount", /\bamount\b/i],
  ["interestRate", /\brate\b/i],
  ["termMonths", /\bterm\b(?!\s*sheet)/i],
  ["collateralValue", /collateral value|appraised value/i],
  ["ltv", /\bltv\b|loan[\s-]to[\s-]value/i],
  ["dscr", /\bdscr\b|debt service/i],
  ["maturityDate", /maturity/i],
];

/** Term fields the message names ("apply the amount, rate and term"). */
export function namedFields(message: string): TermField[] {
  return FIELD_WORDS.filter(([, pattern]) => pattern.test(message)).map(([field]) => field);
}

/**
 * Explicit values in the message override extracted ones:
 * "rate at 6.75%", "amount $4.5M", "term 96 months".
 */
export function valueOverrides(message: string): Terms {
  const terms: Terms = {};
  const rate = /\brate\b[^0-9%]{0,20}(\d+(?:\.\d+)?)\s*%/i.exec(message);
  if (rate) terms.interestRate = Number(rate[1]);
  const amount = /\bamount\b[^$0-9]{0,20}\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(m|mm|million|k|thousand)?\b/i.exec(message);
  if (amount) {
    const base = Number(amount[1].replaceAll(",", ""));
    const unit = amount[2]?.toLowerCase();
    terms.loanAmount = unit?.startsWith("m") ? base * 1_000_000 : unit?.startsWith("k") || unit === "thousand" ? base * 1_000 : base;
  }
  const term = /\bterm\b(?!\s*sheet)[^0-9]{0,20}(\d+)\s*(months?|mo|years?|yrs?)\b/i.exec(message);
  if (term) terms.termMonths = /^y/i.test(term[2]) ? Number(term[1]) * 12 : Number(term[1]);
  return terms;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function emailAddress(message: string): string | undefined {
  return EMAIL.exec(message)?.[0];
}

/** Borrowers named verbatim in the message (case-insensitive, whole name or first word). */
export function namedBorrowers(message: string, borrowers: string[]): string[] {
  const lower = message.toLowerCase();
  return borrowers.filter(borrower => {
    const name = borrower.toLowerCase();
    const first = name.split(/\s+/)[0];
    return lower.includes(name) || (first.length >= 5 && new RegExp(`\\b${escape(first)}\\b`).test(lower));
  });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
