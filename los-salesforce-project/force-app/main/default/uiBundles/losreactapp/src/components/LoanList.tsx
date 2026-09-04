import { FilePlus2, FileStack } from "lucide-react";
import { FORBIDDEN, NOT_AUTHENTICATED, formatLoanAmount, type LosLoanSummary } from "../lib/loans";
import { PortfolioCharts } from "./PortfolioCharts";
import { DataError } from "./DataError";
import { LoansSkeleton } from "./WorkspaceSkeleton";
import { formatDate } from "../lib/documents";

/**
 * The borrower's loans, and the way to add one.
 *
 * Presentational: the shell reads the loans (see `useLoans`) because it needs the count
 * before deciding where a borrower lands. This component draws whatever it is handed and
 * never invents a row -- a list of loans is a claim about what this organisation has
 * borrowed, and inventing one is worse than saying it cannot be read.
 */
export function LoanList({
  loans,
  loading,
  error,
  source,
  onRetry,
  onSelect,
  onStartApplication,
  signInUrl,
  signedIn,
}: {
  loans: LosLoanSummary[];
  loading: boolean;
  error: string;
  source: "graphql" | "apex";
  onRetry: () => void;
  onSelect: (loan: LosLoanSummary) => void;
  onStartApplication: () => void;
  /** Supplied by the identity endpoint; the path is not derivable in the browser. */
  signInUrl?: string;
  /** Known to be signed in. Undefined while identity is still being read. */
  signedIn?: boolean;
}) {
  if (loading) {
    return <LoansSkeleton />;
  }

  // Being signed out is not a failure to report, it is a door to point at. A 403 from the
  // class gate means the same thing to a visitor as the class's own 401 -- unless the
  // reader is known to be signed in, in which case signing in again would not help and
  // the refusal is shown as what it is.
  if (error === NOT_AUTHENTICATED || (error === FORBIDDEN && !signedIn)) {
    return (
      <DataError
        title="Sign in to see your loans"
        detail="Your session has ended. Signing in again brings back the loans your organisation holds with the bank."
        signInUrl={signInUrl}
        onRetry={onRetry}
        testId="loans-signed-out"
      />
    );
  }

  if (error) {
    return (
      <DataError
        title="Your loans could not be loaded"
        detail={error === FORBIDDEN ? "Salesforce refused the request for your loans. Your account may not be enabled for this portal yet." : error}
        onRetry={onRetry}
        testId="loans-error"
      />
    );
  }

  return (
    <>
      {/* Above the list, because the portfolio question ("what state is all this in") is
          asked before the record question ("which one do I open"). */}
      <PortfolioCharts loans={loans} />
      <section className="loan-list-card" data-testid="loans-view" data-source={source}>
        {/* No heading: the rail and the title bar already say which view this is. The one
            thing the card adds above its rows is the way to add one. */}
        <div className="cb-list-head">
          <button
            type="button"
            className="upload-button"
            onClick={onStartApplication}
            data-testid="start-application"
          >
            <FilePlus2 size={15} aria-hidden="true" /> Start a new application
          </button>
        </div>
        {loans.length === 0 ? (
          <div className="workspace-state" data-testid="loans-empty">
            No loans yet. Start an application and the bank will open a file for it here.
          </div>
        ) : (
          <table className="box-table loan-table" data-testid="loan-table">
            <thead>
              <tr>
                <th scope="col">Loan</th>
                <th scope="col">Borrowing entity</th>
                <th scope="col">Amount</th>
                <th scope="col">Matures</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.recordId} data-testid="loan-row">
                  <td>
                    {/* A button, not a row handler: the loan name is the thing you
                        activate, and it stays reachable from the keyboard. */}
                    <button
                      type="button"
                      className="box-table-name"
                      onClick={() => onSelect(loan)}
                      data-testid="loan-open"
                    >
                      <FileStack size={15} aria-hidden="true" />
                      <span className="cell-stack">
                        <span>{loan.name || loan.loanId || "Untitled loan"}</span>
                        <small>{loan.loanId}</small>
                      </span>
                    </button>
                  </td>
                  <td className="cell-type">
                    <span className="cell-stack">
                      <span>{loan.borrowerEntity || loan.borrower || "—"}</span>
                      {loan.borrowerEntity && loan.borrower ? (
                        <small>{loan.borrower}</small>
                      ) : null}
                    </span>
                  </td>
                  <td className="cell-number">
                    {loan.loanAmount != null ? formatLoanAmount(loan.loanAmount) : "—"}
                  </td>
                  <td className="cell-number">{formatDate(loan.maturityDate)}</td>
                  <td>
                    {loan.status ? <span className="status-pill">{loan.status}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
