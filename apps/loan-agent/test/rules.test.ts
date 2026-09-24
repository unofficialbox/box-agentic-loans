import { afterEach, describe, expect, it, vi } from "vitest";
import { parseExtraction, parseLoanList, parseLoanPackage } from "../src/los.js";
import { checkDscr, checkGuaranty, checkGuarantyExclusions, checkLtv, checkRate, evaluateTerms, money } from "../src/policy.js";
import { TypeSafeClient, TypeSafeError, toDecision } from "../src/typesafe.js";
import { loanReference, namedBorrowers, namedFields, valueOverrides } from "../src/understand.js";

describe("LOS parsers", () => {
  it("parses listLoans lines, with and without a risk rating", () => {
    const rows = parseLoanList(
      "LOS loans (2):\n- LN-2026-0003 -- Harborview CRE 2026 | Harborview Logistics | Status: Approved | Amount: 4,800,000\n" +
        "- LN-2023-0311 -- Harborview LOC | Harborview Logistics | Status: Approved | Risk: Low | Amount: 1,500,000\nnoise"
    );
    expect(rows).toEqual([
      { loanId: "LN-2026-0003", name: "Harborview CRE 2026", borrower: "Harborview Logistics", status: "Approved", risk: undefined, amount: 4800000 },
      { loanId: "LN-2023-0311", name: "Harborview LOC", borrower: "Harborview Logistics", status: "Approved", risk: "Low", amount: 1500000 },
    ]);
  });

  it("parses a package header and document links", () => {
    const pkg = parseLoanPackage({
      outputFound: true,
      outputFolderId: "1",
      outputSummary:
        "LN-2026-0003 -- Harborview CRE 2026. Borrower: Harborview Logistics. Status: Approved.\nDocuments:\n- a b.pdf - https://app.box.com/file/42",
    });
    expect(pkg).toMatchObject({ found: true, loanId: "LN-2026-0003", borrower: "Harborview Logistics", status: "Approved" });
    expect(pkg.documents).toEqual([{ name: "a b.pdf", fileId: "42", href: "https://app.box.com/file/42" }]);
  });

  it("keeps the risk rating out of the status", () => {
    const pkg = parseLoanPackage({
      outputFound: true,
      outputSummary: "LN-2026-0042 -- Harborview Distribution Facility Loan 2026. Borrower: Harborview Logistics. Status: Underwriting. Risk: High.",
    });
    expect(pkg).toMatchObject({ status: "Underwriting", risk: "High", name: "Harborview Distribution Facility Loan 2026" });
    const unrated = parseLoanPackage({ outputFound: true, outputSummary: "LN-2026-0003 -- X. Borrower: Y. Status: Approved." });
    expect(unrated.status).toBe("Approved");
    expect(unrated.risk).toBeUndefined();
  });

  it("reports a missing loan as not found", () => {
    expect(parseLoanPackage({ outputFound: false, outputSummary: "I could not find a LOS loan" }).found).toBe(false);
  });

  it("parses extraction JSON and the validation lines", () => {
    const extraction = parseExtraction({
      extracted: true,
      extractedJson: '{"interestRate":6.85,"bogus":1}',
      validationSummary: "- interestRate: document 6.85, record 6.5 (mismatch)\n- ltv: document 75, record empty (new)\n- maturityDate: not found in the document",
    });
    expect(extraction.terms).toEqual({ interestRate: 6.85 });
    expect(extraction.checks).toEqual([
      { field: "interestRate", document: "6.85", record: "6.5", status: "mismatch" },
      { field: "ltv", document: "75", record: undefined, status: "new" },
      { field: "maturityDate", status: "not_found" },
    ]);
  });
});

describe("credit policy rules", () => {
  it.each([
    [75, "within"],
    [75.5, "exception"],
    [80, "exception"],
    [80.1, "outside"],
    [undefined, "unknown"],
  ])("LTV %s → %s", (ltv, verdict) => {
    expect(checkLtv(ltv).verdict).toBe(verdict);
  });

  it.each([
    [1.25, undefined, "within"],
    [1.2, undefined, "exception"],
    [1.15, undefined, "exception"],
    [1.14, undefined, "outside"],
    [1.4, "annual", "outside"],
  ])("DSCR %s (%s) → %s", (dscr, frequency, verdict) => {
    expect(checkDscr(dscr, frequency).verdict).toBe(verdict);
  });

  it.each([
    [6.5, "within"],
    [6.0, "exception"],
    [5.99, "outside"],
  ])("rate %s → %s", (rate, verdict) => {
    expect(checkRate(rate).verdict).toBe(verdict);
  });

  it("asks the officer to confirm ownership for anyone left out of the guaranty, and says nothing when no one is", () => {
    expect(checkGuarantyExclusions(undefined)).toBeUndefined();
    expect(checkGuarantyExclusions([])).toBeUndefined();
    expect(checkGuarantyExclusions(["Harborview Employee Holdings LP"])).toEqual({
      topic: "Guarantors",
      verdict: "confirm",
      detail:
        "Harborview Employee Holdings LP gives no guaranty. Confirm ownership: an owner of 20% or more left out is outside policy, even with the exception",
      policyIds: ["LOS-GUAR-001", "LOS-GUAR-002"],
    });
    expect(checkGuarantyExclusions(["A LP", "B LLC", "C"])?.detail).toMatch(/^A LP, B LLC and C give no guaranty\./);
    const findings = evaluateTerms({}, { guarantyType: "limited", guarantyExclusions: ["A LP"] });
    expect(findings.map(finding => finding.topic)).toEqual(["Loan-to-value", "Debt service coverage", "Pricing", "Guaranty", "Guarantors"]);
  });

  it("treats a limited guaranty as the cash-collateral exception", () => {
    expect(checkGuaranty("limited", 1_000_000)).toMatchObject({ verdict: "exception", approver: "Loan Documentation and Credit Risk" });
    expect(checkGuaranty("unlimited").verdict).toBe("within");
    expect(checkGuaranty("none").verdict).toBe("outside");
  });

  it("formats money", () => {
    expect([money(4_800_000), money(10_000_000), money(850_000)]).toEqual(["$4.8M", "$10M", "$850,000"]);
  });
});

describe("argument rules", () => {
  it("finds loan IDs and record IDs", () => {
    expect(loanReference("check ln-2026-0003 please")).toBe("LN-2026-0003");
    expect(loanReference("record a0Kxx0000000003AAA")).toBe("a0Kxx0000000003AAA");
    expect(loanReference("the latest loan")).toBeUndefined();
  });

  it("names fields without mistaking 'term sheet' for the term", () => {
    expect(namedFields("apply the amount, rate and term to the record")).toEqual(["loanAmount", "interestRate", "termMonths"]);
    expect(namedFields("extract from the term sheet")).toEqual([]);
  });

  it("reads explicit values", () => {
    expect(valueOverrides("apply the rate at 6.75% and amount $4.5M with a term of 10 years")).toEqual({
      interestRate: 6.75,
      loanAmount: 4_500_000,
      termMonths: 120,
    });
    expect(valueOverrides("apply the amount, rate and term")).toEqual({});
  });

  it("matches borrowers by full name or distinctive first word", () => {
    const borrowers = ["Harborview Logistics", "Pinecrest Dental Group"];
    expect(namedBorrowers("Compare Harborview's prior loans", borrowers)).toEqual(["Harborview Logistics"]);
    expect(namedBorrowers("what about the dental group?", borrowers)).toEqual([]);
  });
});

describe("TypeSafe client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a choice outside the offered options", () => {
    expect(() => toDecision({ choice: "delete_everything", confidence: 0.99 }, ["a", "b"])).toThrow(TypeSafeError);
  });

  it("sends a choice question and caches identical questions", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ answers: { decision: { choice: "b", confidence: 0.9, probabilities: { a: 0.1, b: 0.9 } } } }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new TypeSafeClient({ apiKey: "example-key", apiUrl: "https://api.example/systemone", model: "jev-latest", timeoutMs: 1000 });

    const first = await client.choose({ message: "x" }, "Which?", { a: "A", b: "B" });
    const second = await client.choose({ message: "x" }, "Which?", { a: "A", b: "B" });
    expect(first).toEqual({ choice: "b", confidence: 0.9, probabilities: { a: 0.1, b: 0.9 } });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({
      model: "jev-latest",
      state: { message: "x" },
      questions: { decision: { type: "choice", instructions: "Which?", criteria: { a: "A", b: "B" } } },
    });
  });

  it("does not cache failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ answers: { decision: { choice: "a", confidence: 1 } } })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new TypeSafeClient({ apiKey: "example-key", apiUrl: "https://api.example", model: "m", timeoutMs: 1000 });
    await expect(client.choose("s", "q", { a: "A" })).rejects.toThrow(/503/);
    await expect(client.choose("s", "q", { a: "A" })).resolves.toMatchObject({ choice: "a" });
  });
});
