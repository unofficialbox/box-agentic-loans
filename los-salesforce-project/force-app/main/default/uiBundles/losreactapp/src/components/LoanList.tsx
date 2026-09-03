import { useCallback, useEffect, useState } from "react";
import { FileStack } from "lucide-react";
import { NOT_AUTHENTICATED, fetchLosLoans, formatLoanAmount, type LosLoanSummary } from "../lib/loans";
import { PortfolioCharts } from "./PortfolioCharts";
import { DataError } from "./DataError";
import { LoansSkeleton } from "./WorkspaceSkeleton";
import { formatDate } from "../lib/documents";
import { fetchLoansViaGraphql } from "../lib/loansGraphql";

export function LoanList({
  onSelect,
  signInUrl,
}: {
  onSelect: (loan: LosLoanSummary) => void;
  /** Supplied by the identity endpoint; the path is not derivable in the browser. */
  signInUrl?: string;
}) {
  const [loans, setLoans] = useState<LosLoanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState<"graphql" | "apex">("apex");
  const [attempt, setAttempt] = useState(0);

  /**
   * GraphQL first, Apex second.
   *
   * The UI API runs as the logged-in user, so the platform enforces sharing and field
   * security rather than a hand-written projection. It is preferred wherever it is
   * available. `null` means the surface does not offer it, which is distinct from an
   * empty result -- a user who can genuinely see no loans must not silently fall
   * through to the Apex endpoint and get a different answer.
   */
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const viaGraphql = await fetchLoansViaGraphql();
      if (!active) return;
      if (viaGraphql !== null) {
        setSource("graphql");
        setLoans(viaGraphql);
        setError("");
        setLoading(false);
        return;
      }
      // Only when the UI API is not offered here. An empty array from it is a real answer
      // and must not be retried through a different projection.
      const viaApex = await fetchLosLoans();
      if (!active) return;
      setSource("apex");
      setError(viaApex.ok ? "" : viaApex.error);
      setLoans(viaApex.ok ? viaApex.value : []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (loading) {
    return <LoansSkeleton />;
  }

  // Nothing is drawn over a failure. A list of loans is a claim about what this
  // organisation has borrowed, and inventing one is worse than saying it cannot be read.
  // Being signed out is not a failure to report, it is a door to point at.
  if (error === NOT_AUTHENTICATED) {
    return (
      <DataError
        title="Sign in to see your loans"
        detail="Your session has ended. Signing in again brings back the loans your organisation holds with the bank."
        signInUrl={signInUrl}
        onRetry={retry}
        testId="loans-signed-out"
      />
    );
  }

  if (error) {
    return (
      <DataError
        title="Your loans could not be loaded"
        detail={error}
        onRetry={retry}
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
      {/*
        No heading. The nav already says which view this is, and the sentence under it
        described the page to someone who is looking at it -- the charts above and the
        columns below say more, in less space.
      */}
      {loans.length === 0 ? (
        <div className="workspace-state" data-testid="loans-empty">
          No loan records yet. Creating one in Salesforce brings it here.
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
