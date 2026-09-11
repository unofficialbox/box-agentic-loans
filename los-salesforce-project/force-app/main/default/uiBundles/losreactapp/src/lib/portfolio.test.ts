import { describe, expect, test } from "vitest";
import type { LosLoanSummary } from "./loans";
import { byStatus, formatCompactValue, portfolioTotals, valueByBorrower, valueBreakdown, maturityHorizon } from "./portfolio";

const c = (over: Partial<LosLoanSummary>): LosLoanSummary => ({ recordId: "r", ...over });

describe("byStatus", () => {
  test("counts by status, largest first", () => {
    expect(
      byStatus([c({ status: "Closed" }), c({ status: "Underwriting" }), c({ status: "Closed" })]),
    ).toEqual([
      { label: "Closed", value: 2 },
      { label: "Underwriting", value: 1 },
    ]);
  });

  test("breaks ties by label so a hue never moves between renders", () => {
    // Categorical colour is assigned by position, so equal counts must not reorder --
    // that is colour following rank instead of the entity it names.
    const once = byStatus([c({ status: "Zulu" }), c({ status: "Alpha" })]);
    const again = byStatus([c({ status: "Alpha" }), c({ status: "Zulu" })]);
    expect(once).toEqual(again);
    expect(once[0].label).toBe("Alpha");
  });

  test("names a missing status rather than dropping the loan", () => {
    expect(byStatus([c({})])).toEqual([{ label: "Unknown", value: 1 }]);
  });
});

describe("valueByBorrower", () => {
  test("sums amount per borrower, largest first", () => {
    expect(
      valueByBorrower([
        c({ borrower: "Pinecrest", loanAmount: 1_000_000 }),
        c({ borrower: "Harborview", loanAmount: 2_400_000 }),
        c({ borrower: "Pinecrest", loanAmount: 500_000 }),
      ]),
    ).toEqual([
      { label: "Harborview", value: 2_400_000 },
      { label: "Pinecrest", value: 1_500_000 },
    ]);
  });

  test("keeps a borrower whose loans carry no amount", () => {
    // Absent from the chart would read as "no relationship", which is a different claim
    // from "no amount recorded".
    expect(valueByBorrower([c({ borrower: "Pinecrest" })])).toEqual([{ label: "Pinecrest", value: 0 }]);
  });
});

describe("portfolioTotals", () => {
  test("counts everything not closed or in servicing as in flight", () => {
    const totals = portfolioTotals([
      c({ status: "Closed", loanAmount: 100 }),
      c({ status: "Servicing", loanAmount: 50 }),
      c({ status: "Underwriting", loanAmount: 200 }),
      c({ status: "Application" }),
    ]);
    expect(totals).toEqual({ loans: 4, value: 350, inFlight: 2 });
  });
});

describe("formatCompactValue", () => {
  test("scales to K and M and never renders NaN", () => {
    expect(formatCompactValue(2_400_000)).toBe("$2.4M");
    expect(formatCompactValue(250_000)).toBe("$250K");
    expect(formatCompactValue(0)).toBe("$0");
    expect(formatCompactValue(Number.NaN)).toBe("$0");
  });
});

describe("valueBreakdown", () => {
  test("falls back to per-loan when there is only one borrower", () => {
    // A borrower deals with exactly one lender, so "by borrower" is a single bar with
    // nothing to compare against. Their own loans are the useful comparison.
    const result = valueBreakdown([
      c({ borrower: "Harborview", loanId: "A", loanAmount: 100 }),
      c({ borrower: "Harborview", loanId: "B", loanAmount: 200 }),
    ]);
    expect(result.title).toBe("Value by loan");
    expect(result.slices.map((s) => s.label)).toEqual(["B", "A"]);
  });

  test("prefers the borrowing entity when one borrower borrows through several", () => {
    // Harborview borrows through the parent and a holding company; that is a real
    // comparison, and it sits between the borrower view and the per-loan fallback.
    const result = valueBreakdown([
      c({ borrower: "Harborview", borrowerEntity: "Harborview Logistics", loanId: "A", loanAmount: 100 }),
      c({ borrower: "Harborview", borrowerEntity: "Harborview Logistics Holdings LLC", loanId: "B", loanAmount: 200 }),
    ]);
    expect(result.title).toBe("Value by borrowing entity");
    expect(result.slices.map((s) => s.label)).toEqual(["Harborview Logistics Holdings LLC", "Harborview Logistics"]);
  });

  test("keeps the portfolio view when borrowers actually differ", () => {
    const result = valueBreakdown([
      c({ borrower: "Harborview", loanAmount: 100 }),
      c({ borrower: "Pinecrest", loanAmount: 200 }),
    ]);
    expect(result.title).toBe("Value by borrower");
    expect(result.slices.map((s) => s.label)).toEqual(["Pinecrest", "Harborview"]);
  });
});

describe("maturityHorizon", () => {
  const today = new Date("2026-09-01T00:00:00Z");

  test("includes loans already matured, soonest first", () => {
    // A loan that matured last month is more exposed than one maturing next month.
    // Filtering it out would drop the worst case from the chart that exists to show it.
    const horizon = maturityHorizon(
      [
        c({ loanId: "MATURES-LATER", maturityDate: "2026-11-14" }),
        c({ loanId: "MATURED", maturityDate: "2026-05-08" }),
        c({ loanId: "MATURES-SOON", maturityDate: "2026-09-30" }),
      ],
      90,
      today,
    );
    expect(horizon.map((r) => r.label)).toEqual(["MATURED", "MATURES-SOON", "MATURES-LATER"]);
    expect(horizon[0].daysRemaining).toBeLessThan(0);
  });

  test("excludes maturities beyond the window", () => {
    expect(maturityHorizon([c({ loanId: "FAR", maturityDate: "2027-07-31" })], 90, today)).toEqual([]);
  });

  test("ignores loans with no maturity date rather than inventing one", () => {
    // A loan still in underwriting has no agreed term; a maturity date on it would
    // assert something nobody has funded.
    expect(maturityHorizon([c({ loanId: "IN-UNDERWRITING", status: "Underwriting" })], 90, today)).toEqual([]);
  });

  test("counts the maturity date itself as zero days remaining, not minus one", () => {
    expect(maturityHorizon([c({ loanId: "TODAY", maturityDate: "2026-09-01" })], 90, today)[0].daysRemaining).toBe(0);
  });
});
