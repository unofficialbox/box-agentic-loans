import type { LosLoanSummary } from "./loans";

/**
 * The shapes the portfolio views draw.
 *
 * Derivation lives here rather than in the components so the tiles, the donut and the bar
 * chart cannot disagree: a headline reading "8 loans" above a donut summing to 7 is the
 * kind of error a reader notices and a developer does not.
 */

export interface Slice {
  label: string;
  value: number;
}

/**
 * Loans by status, largest first, with a stable order for equal counts.
 *
 * Categorical hues are assigned by position, so the order has to be deterministic -- a
 * status that changes colour between renders because two counts tied is exactly the
 * "colour follows rank, not entity" mistake.
 */
export function byStatus(loans: LosLoanSummary[]): Slice[] {
  const counts = new Map<string, number>();
  for (const loan of loans) {
    const label = loan.status?.trim() || "Unknown";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/**
 * Total loan amount per borrower, largest first.
 *
 * Loans with no amount still count toward their borrower at zero rather than vanishing:
 * a borrower absent from the chart reads as "no relationship", which is a different claim
 * from "no amount recorded".
 */
export function valueByBorrower(loans: LosLoanSummary[]): Slice[] {
  const totals = new Map<string, number>();
  for (const loan of loans) {
    const label = loan.borrower?.trim() || "Unknown";
    totals.set(label, (totals.get(label) || 0) + (loan.loanAmount || 0));
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export interface PortfolioTotals {
  loans: number;
  value: number;
  /** Anything not yet closed or in servicing -- the work still in front of somebody. */
  inFlight: number;
}

/** The statuses in which a loan has been funded and nothing is pending on it. */
const SETTLED_STATUSES = new Set(["closed", "servicing"]);

export function portfolioTotals(loans: LosLoanSummary[]): PortfolioTotals {
  return {
    loans: loans.length,
    value: loans.reduce((sum, l) => sum + (l.loanAmount || 0), 0),
    inFlight: loans.filter((l) => !SETTLED_STATUSES.has((l.status || "").toLowerCase())).length,
  };
}

/** Compact currency, because these sit in tiles and axis labels, not in a ledger. */
export function formatCompactValue(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

/** Amount per loan, largest first. Labelled by loan id, which is what the row says. */
export function valueByLoan(loans: LosLoanSummary[]): Slice[] {
  return loans
    .map((loan) => ({
      label: loan.loanId || loan.name || loan.recordId,
      value: loan.loanAmount || 0,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/**
 * The breakdown worth drawing, and what to call it.
 *
 * A borrower sees loans with exactly one organisation -- their own -- so "value by
 * borrower" is a single bar: a chart that has nothing to compare. Falling back to
 * per-loan gives the same reader the comparison they can actually use, and an internal
 * reader with several borrowers still gets the portfolio view. The chart shows whichever
 * dimension actually varies.
 */
export function valueBreakdown(loans: LosLoanSummary[]): { title: string; slices: Slice[] } {
  const byParty = valueByBorrower(loans);
  if (byParty.length > 1) return { title: "Value by borrower", slices: byParty };

  const byEntity = sumBy(loans, (loan) => loan.borrowerEntity);
  if (byEntity.length > 1) return { title: "Value by borrowing entity", slices: byEntity };

  return { title: "Value by loan", slices: valueByLoan(loans) };
}

/** Sums loan amount under whatever key the picker returns, skipping loans with none. */
function sumBy(
  loans: LosLoanSummary[],
  key: (loan: LosLoanSummary) => string | undefined,
): Slice[] {
  const totals = new Map<string, number>();
  for (const loan of loans) {
    const label = key(loan)?.trim();
    if (!label) continue;
    totals.set(label, (totals.get(label) || 0) + (loan.loanAmount || 0));
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export interface Maturity {
  label: string;
  maturityDate: string;
  /** Negative once the loan has already matured. */
  daysRemaining: number;
}

/** Whole days between two dates, ignoring the time of day so "today" is zero, not -1. */
function daysBetween(from: Date, to: Date): number {
  const day = 24 * 60 * 60 * 1000;
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / day);
}

/**
 * Loans that mature within `withinDays`, soonest first.
 *
 * Only loans that carry a maturity date can appear, which means only closed or serviced
 * ones: a loan still in underwriting has no agreed term, and inventing a maturity for it
 * would put a payoff date on a loan nobody has funded.
 *
 * Loans that have already matured are included rather than filtered out. A loan that
 * matured last month is more urgent than one maturing next month, and dropping it would
 * leave the most exposed part of the portfolio off the chart that exists to show exposure.
 */
export function maturityHorizon(
  loans: LosLoanSummary[],
  withinDays = 90,
  today = new Date(),
): Maturity[] {
  return loans
    .flatMap((loan) => {
      if (!loan.maturityDate) return [];
      const end = new Date(loan.maturityDate);
      if (Number.isNaN(end.getTime())) return [];
      const daysRemaining = daysBetween(today, end);
      if (daysRemaining > withinDays) return [];
      return [{
        label: loan.loanId || loan.name || loan.recordId,
        maturityDate: loan.maturityDate,
        daysRemaining,
      }];
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}
