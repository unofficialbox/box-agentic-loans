import type { LosLoanSummary } from "../lib/loans";
import { Donut, foldToPalette } from "./Donut";
import {
  byStatus,
  formatCompactValue,
  portfolioTotals,
  maturityHorizon,
  valueBreakdown,
  type Maturity,
  type Slice,
} from "../lib/portfolio";

/**
 * The portfolio at a glance, above the loan list.
 *
 * Three figures, and no tiles above them. The tiles restated the charts beside them: the
 * loan count is the donut's own centre label, "in flight" is everything the donut does
 * not colour Closed or Servicing, and the maturity count is the number of rows in the
 * maturity chart.
 * Only the portfolio's total value was a fact no figure stated, so it is that figure's
 * headline now.
 *
 * Colours are the validated three-slot categorical set (blue, orange, aqua), assigned by
 * position and never cycled. Three is also the cap under the all-pairs rule, which is why
 * statuses beyond the third fold into "Other" rather than growing a fourth hue.
 */

/**
 * Value by borrower. One series, so one hue and no legend -- the title names it.
 * Bars are labelled at the end rather than against an axis, which keeps the figure
 * readable at the width a sidebar-less card actually gets.
 */
function ValueBars({ title, headline, slices }: { title: string; headline: string; slices: Slice[] }) {
  const largest = slices.reduce((max, s) => Math.max(max, s.value), 0);

  return (
    <figure className="chart-figure">
      <figcaption className="chart-title">{title}</figcaption>
      <p className="figure-headline">{headline}</p>
      <ul className="bars">
        {slices.map((slice) => (
          <li key={slice.label} className="bar-row">
            <span className="bar-head">
              <span className="bar-label">{slice.label}</span>
              <span className="bar-value">{formatCompactValue(slice.value)}</span>
            </span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: largest === 0 ? "0%" : `${Math.max((slice.value / largest) * 100, 1.5)}%` }}
              >
                <title>{`${slice.label}: ${formatCompactValue(slice.value)}`}</title>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * The maturity horizon: loans maturing inside the window, soonest first.
 *
 * A bar per loan, scaled by how much of the window is left, so a loan that has already
 * matured reads as full-width rather than disappearing at zero. Matured loans carry the
 * critical status colour with the word "Matured" beside them -- status is never colour
 * alone, and this is the one place in the app where a status reading is what the chart is
 * actually for.
 */
function MaturityHorizon({ maturities, windowDays }: { maturities: Maturity[]; windowDays: number }) {
  return (
    <figure className="chart-figure">
      <figcaption className="chart-title">Maturities in the next {windowDays} days</figcaption>
      {maturities.length === 0 ? (
        <p className="chart-empty">No closed loan reaches maturity in this window.</p>
      ) : (
        <ul className="bars">
          {maturities.map((maturity) => {
            const matured = maturity.daysRemaining < 0;
            const used = matured ? 1 : 1 - maturity.daysRemaining / windowDays;
            return (
              <li key={maturity.label} className="bar-row">
                <span className="bar-head">
                  <span className="bar-label">{maturity.label}</span>
                  <span className={`bar-value${matured ? " bar-value-critical" : ""}`}>
                    {matured ? "Matured" : `${maturity.daysRemaining}d`}
                  </span>
                </span>
                <span className="bar-track">
                  <span
                    className={`bar-fill${matured ? " bar-fill-critical" : ""}`}
                    style={{ width: `${Math.max(used * 100, 4)}%` }}
                  >
                    <title>{`${maturity.label}: matures ${maturity.maturityDate}`}</title>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}

const MATURITY_WINDOW_DAYS = 90;

export function PortfolioCharts({ loans }: { loans: LosLoanSummary[] }) {
  if (loans.length === 0) return null;

  const totals = portfolioTotals(loans);
  const statuses = foldToPalette(byStatus(loans));
  const breakdown = valueBreakdown(loans);
  const maturities = maturityHorizon(loans, MATURITY_WINDOW_DAYS);
  const values = breakdown.slices.slice(0, 6);

  return (
    <section className="portfolio viz" data-testid="portfolio-charts">
      <div className="chart-row">
        <Donut slices={statuses} centreLabel="loans" title="Loans by status" />
        <ValueBars
          title={breakdown.title}
          headline={`${formatCompactValue(totals.value)} total`}
          slices={values}
        />
        <MaturityHorizon maturities={maturities} windowDays={MATURITY_WINDOW_DAYS} />
      </div>
    </section>
  );
}
