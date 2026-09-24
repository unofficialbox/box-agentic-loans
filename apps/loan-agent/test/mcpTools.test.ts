import { describe, expect, it } from "vitest";
import {
  docGenProblem,
  itemName,
  parseCovenants,
  parseDocgenBatch,
  parseDocumentType,
  parseMetadataHits,
  parseSignatureResult,
} from "../src/mcpTools.js";
import * as box from "./boxResponses.js";

describe("Box responses as the Box MCP server returns them", () => {
  it("reads metadata search hits, which carry no metadata values", () => {
    expect(parseMetadataHits(box.searchFilesMetadata)).toEqual([
      { fileId: "1001", name: "harborview-term-sheet-2026-borrower-markup.pdf", documentType: undefined, policyRisk: undefined },
      { fileId: "1002", name: "Commercial Loan Commitment Letter (1).pdf", documentType: undefined, policyRisk: undefined },
      { fileId: "1003", name: "Commercial Loan Commitment Letter.pdf", documentType: undefined, policyRisk: undefined },
    ]);
  });

  it("reads the document type from the file's losDocument metadata", () => {
    expect(parseDocumentType(box.fileDetailsWithMetadata)).toBe("Term Sheet");
    expect(parseDocumentType(box.fileDetailsWithoutMetadata)).toBeUndefined();
  });

  it("reads covenants from a flat extraction, and from one wrapped as a JSON answer", () => {
    const expected = { ltvMax: 75, dscrMin: 1.1, testFrequency: "annual", guarantyType: "limited", guarantyCapPerPerson: 1000000 };
    expect(parseCovenants(box.covenantExtraction)).toEqual(expected);
    expect(parseCovenants({ answer: JSON.stringify(box.covenantExtraction), created_at: "2026-09-24" })).toEqual(expected);
    expect(parseCovenants({ ...box.covenantExtraction, guarantyType: "Limited", guarantyCapPerPerson: null, ltvMax: "" })).toMatchObject({
      guarantyType: "limited",
      guarantyCapPerPerson: undefined,
      ltvMax: undefined,
    });
  });

  it("reads the parties left out of the guaranty as a list, and nothing as nothing", () => {
    expect(parseCovenants(box.exclusionsFromMarkup).guarantyExclusions).toEqual(["Harborview Employee Holdings LP"]);
    expect(parseCovenants({ guarantyType: "unlimited", ...box.exclusionsFromExecutedAgreement }).guarantyExclusions).toBeUndefined();
    expect(parseCovenants({ guarantyExclusions: "A LP; B LLC\nC" }).guarantyExclusions).toEqual(["A LP", "B LLC", "C"]);
    for (const nothing of ["", "None", "N/A", "none."]) {
      expect(parseCovenants({ guarantyType: "limited", guarantyExclusions: nothing }).guarantyExclusions).toBeUndefined();
    }
  });

  it("names the Doc Gen template by fileName and the folder by name", () => {
    expect(itemName(box.docgenTemplate)).toBe("los-commitment-letter-template.docx");
    expect(itemName(box.folderDetails)).toBe("Harborview Logistics Commercial Real Estate 2026_22");
  });

  it("never takes the batch or template ID for the generated file", () => {
    expect(parseDocgenBatch({ id: "4001", type: "docgen_batch" }).outputFileId).toBeUndefined();
    expect(parseDocgenBatch({ ...box.docgenTemplate }).outputFileId).toBeUndefined();
    expect(parseDocgenBatch({ entries: [{ id: "5001", status: "completed", output_file: { id: "6001", type: "file" } }] }).outputFileId).toBe("6001");
  });
});

describe("Doc Gen readiness problems", () => {
  it("reads a missing scope as a permission problem, with the fix", () => {
    const problem = docGenProblem(
      "template",
      "1",
      "Box get_docgen_template_by_id: Access denied. Please check your permissions and ensure you have the required scopes to perform this operation."
    );
    expect(problem).toMatchObject({ what: "template", ok: false });
    expect(problem.detail).toMatch(/^The Box sign-in isn't allowed to use Doc Gen \(Box: Access denied/);
    expect(problem.fix).toMatch(/docgen\.readwrite/);
  });

  it("reads not found as the template or folder not being visible to this user", () => {
    const template = docGenProblem("template", "2482573818840", "Box get_docgen_template_by_id: Item not found");
    expect(template.detail).toBe("Template 2482573818840 isn't a Doc Gen template the signed-in Box user can open (Box: Item not found).");
    expect(template.fix).toMatch(/LOS_DOCGEN_TEMPLATE_FILE_ID/);
    const folder = docGenProblem("folder", "414659140160", "Box get_folder_details: Item not found");
    expect(folder.detail).toMatch(/^The loan folder 414659140160 isn't visible/);
    expect(folder.fix).toMatch(/Editor/);
  });

  it("reads a server error on the template as a template Box can't open", () => {
    const problem = docGenProblem("template", "2001", `Box get_docgen_template_by_id: ${box.errors.templateUnknown}`);
    expect(problem.detail).toBe("Template 2001 isn't a Doc Gen template the signed-in Box user can open (Box: Internal Server Error).");
    expect(problem.fix).toMatch(/LOS_DOCGEN_TEMPLATE_FILE_ID/);
  });

  it("passes anything else through with Box's own words", () => {
    expect(docGenProblem("folder", "9", "Box get_folder_details: Internal Server Error").detail).toBe(
      "Box couldn't confirm the loan folder (Box: Internal Server Error)."
    );
  });
});

describe("signature results", () => {
  it("reads prepared as the only success signal, and the summary as the message", () => {
    expect(
      parseSignatureResult({
        summary: "A Box Sign request is prepared for LN-2026-0042 and addressed to dana@example.com.",
        prepared: true,
        requestId: "123",
        embedUrl: "https://app.box.com/sign/document/abc/embed",
        prepareUrl: null,
      })
    ).toEqual({
      prepared: true,
      summary: "A Box Sign request is prepared for LN-2026-0042 and addressed to dana@example.com.",
      requestId: "123",
      embedUrl: "https://app.box.com/sign/document/abc/embed",
    });
    const refused = parseSignatureResult({
      summary: "Loan LN-2026-0042 is Underwriting, not approved for signature.",
      prepared: false,
      embedUrl: "https://example.com/a-long-url-that-the-old-reader-could-mistake-for-the-message",
    });
    expect(refused.prepared).toBe(false);
    expect(refused.summary).toBe("Loan LN-2026-0042 is Underwriting, not approved for signature.");
  });
});
