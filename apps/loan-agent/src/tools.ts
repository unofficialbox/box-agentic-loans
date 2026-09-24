import type { Extraction, LoanPackage, LoanRow, Terms } from "./los.js";

/** A tool can't run until a person does something (e.g. signs in); the message says what. */
export class ActionRequiredError extends Error {}

export interface MetadataHit {
  fileId: string;
  name: string;
  documentType?: string;
  policyRisk?: string;
}

export interface CovenantFields {
  ltvMax?: number;
  dscrMin?: number;
  testFrequency?: string;
  guarantyType?: string;
  guarantyCapPerPerson?: number;
}

/** One thing Doc Gen needs, checked as the signed-in Box user. */
export interface DocGenCheckItem {
  what: "template" | "folder";
  ok: boolean;
  /** Found: the item's name. Not ok: what is wrong. */
  detail: string;
  /** Not ok: what to do about it. */
  fix?: string;
}

/**
 * Whether Box Doc Gen can run: the template is a Doc Gen template this user
 * can use, and (when given) the destination folder is visible to them.
 */
export interface DocGenCheck {
  ready: boolean;
  items: DocGenCheckItem[];
}

export interface DocgenResult {
  /** The output file this generation produced, when the response names it. */
  outputFileId?: string;
  raw: string;
}

export interface WriteResult {
  ok: boolean;
  message: string;
}

/**
 * Every side effect the agent can have. Reads run during a turn; the three
 * writes run only from an approved proposal. Implemented over MCP
 * (mcpTools.ts) and by seeded fixtures (fixtures.ts).
 */
export interface ToolGateway {
  listLoans(filter: { borrower?: string; status?: string }): Promise<LoanRow[]>;
  getLoanPackage(loan: string): Promise<LoanPackage>;
  extractLoanTerms(loanId: string, fileId: string): Promise<Extraction>;
  findByPolicyRisk(folderId: string, risk: string): Promise<MetadataHit[]>;
  /** The file's losDocument documentType, for search hits that came back without it. */
  getDocumentType(fileId: string): Promise<string | undefined>;
  extractCovenants(fileId: string): Promise<CovenantFields>;

  /** Read-only: can the signed-in Box user run Doc Gen with this template, into this folder? */
  checkDocGen(folderId?: string): Promise<DocGenCheck>;

  applyLoanTerms(loanId: string, terms: Terms): Promise<WriteResult>;
  generateCommitmentLetter(input: {
    folderId: string;
    fileName: string;
    userInput: Record<string, unknown>;
  }): Promise<DocgenResult>;
  prepareSignatureRequest(input: {
    loanId: string;
    fileId: string;
    signerEmail: string;
    signerName?: string;
  }): Promise<WriteResult>;
}

/** Box AI structured-extraction fields for covenant comparison. */
export const COVENANT_FIELDS = [
  {
    key: "ltvMax",
    displayName: "Maximum loan-to-value (%)",
    type: "float",
    prompt: "The maximum loan-to-value covenant as a percentage, from the financial covenants section.",
  },
  {
    key: "dscrMin",
    displayName: "Minimum debt service coverage (x)",
    type: "float",
    prompt:
      "The minimum debt service coverage ratio the borrower must maintain. If the borrower's markup proposes a different figure, use the borrower's proposed figure.",
  },
  {
    key: "testFrequency",
    displayName: "Covenant test frequency",
    type: "enum",
    options: [{ key: "quarterly" }, { key: "annual" }],
    prompt: "How often the covenants are tested, including any borrower-proposed change.",
  },
  {
    key: "guarantyType",
    displayName: "Guaranty type",
    type: "enum",
    options: [{ key: "unlimited" }, { key: "limited" }, { key: "none" }],
    prompt: "The guaranty the owners provide, including any borrower-proposed change.",
  },
  {
    key: "guarantyCapPerPerson",
    displayName: "Guaranty cap per guarantor ($)",
    type: "float",
    prompt: "The dollar cap per individual guarantor if the guaranty is limited; empty if unlimited.",
  },
] as const;
