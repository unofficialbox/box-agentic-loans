import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { BoxFolderItem } from "./box";
import { REQUIRED_DOCUMENTS, checklistFor } from "./requiredDocuments";

function file(id: string, documentType?: string): BoxFolderItem {
  return {
    id,
    name: `${id}.pdf`,
    type: "file",
    ...(documentType ? { metadata: { enterprise: { losDocument: { documentType } } } } : {}),
  };
}

describe("REQUIRED_DOCUMENTS", () => {
  test("lists exactly what the contract lists, per loan type", () => {
    const types = (loanType: string) => REQUIRED_DOCUMENTS[loanType].map((row) => row.documentType);
    expect(types("Term Loan")).toEqual(["Financial Statement", "Tax Return", "Bank Statement"]);
    expect(types("Line of Credit")).toEqual(["Financial Statement", "Bank Statement"]);
    expect(types("Equipment Finance")).toEqual(["Financial Statement", "Tax Return"]);
    expect(types("Commercial Real Estate")).toEqual([
      "Financial Statement", "Tax Return", "Bank Statement", "Appraisal", "Insurance", "Environmental Report",
    ]);
    expect(types("SBA 7(a)")).toEqual(["Financial Statement", "Tax Return", "Bank Statement", "Insurance"]);
  });

  test("is written as plain JSON, so the repository's BCL comparison can parse it", () => {
    // A test outside this bundle reads the literal and compares it with
    // config/los/required-documents.bcl. That only works while the literal stays JSON.
    const source = readFileSync(join(__dirname, "requiredDocuments.ts"), "utf8");
    const literal = source.slice(source.indexOf("= {", source.indexOf("REQUIRED_DOCUMENTS")) + 2);
    const parsed = JSON.parse(literal.slice(0, literal.indexOf("};") + 1));
    expect(parsed).toEqual(REQUIRED_DOCUMENTS);
  });

  test("gives every row a borrower-facing sentence", () => {
    for (const rows of Object.values(REQUIRED_DOCUMENTS)) {
      for (const row of rows) {
        expect(row.label).not.toBe("");
        expect(row.why).toMatch(/\.$/);
      }
    }
  });
});

describe("checklistFor", () => {
  test("ticks a row from the metadata Box AI wrote, not from the file name", () => {
    // "appraisal.pdf" with no metadata ticks nothing; "scan-0042.pdf" tagged Appraisal
    // does. The classification is the control, the name is a coincidence.
    const checklist = checklistFor("Commercial Real Estate", [
      { ...file("appraisal") },
      { ...file("scan-0042", "Appraisal") },
    ])!;
    const appraisal = checklist.rows.find((row) => row.documentType === "Appraisal")!;
    expect(appraisal.status).toBe("received");
    expect(appraisal.file?.name).toBe("scan-0042.pdf");
    expect(checklist.received).toBe(1);
  });

  test("lists an unclassified upload separately rather than ticking a row for it", () => {
    const checklist = checklistFor("Term Loan", [file("just-uploaded")])!;
    expect(checklist.rows.every((row) => row.status === "missing")).toBe(true);
    expect(checklist.unclassified.map((f) => f.name)).toEqual(["just-uploaded.pdf"]);
  });

  test("draws no checklist for a loan type it has no list for", () => {
    expect(checklistFor("Bridge Loan", [])).toBeNull();
    expect(checklistFor(undefined, [])).toBeNull();
  });

  test("ignores a document of a type the loan does not ask for", () => {
    const checklist = checklistFor("Line of Credit", [file("a", "Appraisal")])!;
    expect(checklist.received).toBe(0);
    // Classified, so not awaiting classification either.
    expect(checklist.unclassified).toEqual([]);
  });
});
