import { parseExtraction, parseLoanList, parseLoanPackage, type Terms } from "./los.js";
import type { CovenantFields, DocGenCheck, DocgenResult, MetadataHit, SignatureResult, ToolGateway, WriteResult } from "./tools.js";

/**
 * Seeded Harborview data in the LOS actions' own response formats (captured
 * from the demo org, with synthetic Box and Salesforce IDs), so the agent
 * runs end to end without MCP. Covenant values follow the seeded documents
 * in scripts/generate_sample_loan_assets.py.
 */

const box = (id: string) => `https://app.box.com/file/${id}`;

const LOAN_LIST = [
  "LOS loans (6):",
  "- LN-2026-0004 -- Harborview Logistics Commercial Real Estate 2026 | Harborview Logistics | Status: Application | Amount: 4,800,000",
  "- LN-2026-0003 -- Harborview Logistics Commercial Real Estate 2026 | Harborview Logistics | Status: Approved | Amount: 4,800,000",
  "- LN-2023-0311 -- Harborview Logistics Revolving Line of Credit 2023 | Harborview Logistics | Status: Approved | Risk: Low | Amount: 1,500,000",
  "- LN-2025-0148 -- Harborview Logistics Equipment Term Loan 2025 | Harborview Logistics | Status: Closed | Risk: Low | Amount: 2,150,000",
  "- LN-2026-0088 -- Pinecrest Dental Group Practice Expansion 2026 | Pinecrest Dental Group | Status: Underwriting | Amount: 900,000",
].join("\n");

const FILES = {
  appraisal: { id: "900001", name: "harborview-appraisal-2026.pdf" },
  environmental: { id: "900002", name: "harborview-environmental-report-2026.pdf" },
  financials: { id: "900003", name: "harborview-financial-statements-fy2025.pdf" },
  termSheet: { id: "900004", name: "harborview-term-sheet-2026-borrower-markup.pdf" },
  agreement2023: { id: "900005", name: "harborview-loan-agreement-2023-executed.pdf" },
  agreement2025: { id: "900006", name: "harborview-loan-agreement-2025-executed.pdf" },
};

const docLines = (files: Array<{ id: string; name: string }>) =>
  ["Documents:", ...files.map(file => `- ${file.name} - ${box(file.id)}`)].join("\n");

const PACKAGES: Record<string, Record<string, unknown>> = {
  "LN-2026-0003": {
    outputFound: true,
    outputLoanReference: "LN-2026-0003",
    outputRecordId: "a0Kxx0000000003AAA",
    outputFolderId: "800003",
    outputSummary:
      "LN-2026-0003 -- Harborview Logistics Commercial Real Estate 2026. Borrower: Harborview Logistics. Status: Approved.\n" +
      docLines([FILES.appraisal, FILES.environmental, FILES.financials, FILES.termSheet]),
  },
  "LN-2023-0311": {
    outputFound: true,
    outputLoanReference: "LN-2023-0311",
    outputRecordId: "a0Kxx0000000311AAA",
    outputFolderId: "800311",
    outputSummary:
      "LN-2023-0311 -- Harborview Logistics Revolving Line of Credit 2023. Borrower: Harborview Logistics. Status: Approved.\n" +
      docLines([FILES.agreement2023]),
  },
  "LN-2025-0148": {
    outputFound: true,
    outputLoanReference: "LN-2025-0148",
    outputRecordId: "a0Kxx0000000148AAA",
    outputFolderId: "800148",
    outputSummary:
      "LN-2025-0148 -- Harborview Logistics Equipment Term Loan 2025. Borrower: Harborview Logistics. Status: Closed.\n" +
      docLines([FILES.agreement2025]),
  },
};

const EXTRACTIONS: Record<string, Record<string, unknown>> = {
  [FILES.termSheet.id]: {
    extracted: true,
    extractedJson: JSON.stringify({ dscr: 1.25, ltv: 75, termMonths: 120, interestRate: 6.85, loanAmount: 4800000 }),
    validationSummary: [
      "Extracted terms against LN-2026-0003:",
      "- loanAmount: document 4800000, record 4800000 (match)",
      "- interestRate: document 6.85, record 6.5 (mismatch)",
      "- termMonths: document 120, record 120 (match)",
      "- collateralValue: not found in the document",
      "- ltv: document 75, record empty (new)",
      "- dscr: document 1.25, record empty (new)",
      "- maturityDate: not found in the document",
      "1 mismatch(es). Nothing has been written to the record; a loan officer accepts or corrects each value before it is applied.",
    ].join("\n"),
  },
  [FILES.appraisal.id]: {
    extracted: true,
    extractedJson: JSON.stringify({ loanAmount: 4800000, collateralValue: 5650000, ltv: 85 }),
    validationSummary: [
      "Extracted terms against LN-2026-0003:",
      "- loanAmount: document 4800000, record 4800000 (match)",
      "- collateralValue: document 5650000, record empty (new)",
      "- ltv: document 85, record empty (new)",
    ].join("\n"),
  },
};

const COVENANTS: Record<string, CovenantFields> = {
  [FILES.termSheet.id]: { ltvMax: 75, dscrMin: 1.1, testFrequency: "annual", guarantyType: "limited", guarantyCapPerPerson: 1000000 },
  [FILES.agreement2023.id]: { ltvMax: 70, dscrMin: 1.3, testFrequency: "quarterly", guarantyType: "unlimited" },
  [FILES.agreement2025.id]: { ltvMax: 70, dscrMin: 1.3, testFrequency: "quarterly", guarantyType: "unlimited" },
};

const RISK: Record<string, MetadataHit[]> = {
  "800003|Critical": [
    { fileId: FILES.termSheet.id, name: FILES.termSheet.name, documentType: "Term Sheet", policyRisk: "Critical" },
  ],
  "800003|High": [
    { fileId: FILES.appraisal.id, name: FILES.appraisal.name, documentType: "Appraisal", policyRisk: "High" },
  ],
};

export class FixtureToolGateway implements ToolGateway {
  /** Every write, for tests and the fixture server's log. */
  readonly writes: Array<{ tool: string; input: unknown }> = [];

  async listLoans(filter: { borrower?: string; status?: string }) {
    return parseLoanList(LOAN_LIST).filter(
      row =>
        (!filter.borrower || row.borrower.toLowerCase().includes(filter.borrower.toLowerCase())) &&
        (!filter.status || row.status === filter.status)
    );
  }

  async getLoanPackage(loan: string) {
    const values =
      PACKAGES[loan] ??
      Object.values(PACKAGES).find(pkg => pkg.outputRecordId === loan) ?? {
        outputFound: false,
        outputSummary: `I could not find a LOS loan matching "${loan}".`,
      };
    return parseLoanPackage(values);
  }

  async extractLoanTerms(_loanId: string, fileId: string) {
    return parseExtraction(EXTRACTIONS[fileId] ?? { extracted: false, validationSummary: "" });
  }

  async findByPolicyRisk(folderId: string, risk: string) {
    return RISK[`${folderId}|${risk}`] ?? [];
  }

  async getDocumentType(fileId: string) {
    return Object.values(RISK)
      .flat()
      .find(hit => hit.fileId === fileId)?.documentType;
  }

  async extractCovenants(fileId: string) {
    return COVENANTS[fileId] ?? {};
  }

  async applyLoanTerms(loanId: string, terms: Terms): Promise<WriteResult> {
    this.writes.push({ tool: "applyLoanTerms", input: { loanId, terms } });
    return { ok: true, message: `Fixture: would write ${Object.keys(terms).join(", ")} to ${loanId}. Nothing was written.` };
  }

  async checkDocGen(folderId?: string): Promise<DocGenCheck> {
    const items: DocGenCheck["items"] = [{ what: "template", ok: true, detail: "Commitment Letter Template (fixture)" }];
    if (folderId) items.push({ what: "folder", ok: true, detail: "Loan workspace (fixture)" });
    return { ready: true, items };
  }

  async generateCommitmentLetter(input: { folderId: string; fileName: string; userInput: Record<string, unknown> }): Promise<DocgenResult> {
    this.writes.push({ tool: "create_docgen_batch", input });
    return { outputFileId: "900099", raw: "{}" };
  }

  async prepareSignatureRequest(input: { loanId: string; fileId: string; signerEmail: string }): Promise<SignatureResult> {
    this.writes.push({ tool: "prepareSignatureRequest", input });
    return {
      prepared: true,
      summary: `Fixture: would prepare a Box Sign request for ${input.loanId} addressed to ${input.signerEmail}. Nothing was sent.`,
      requestId: "fixture-sign-request",
    };
  }
}
