import { useCallback, useEffect, useState } from "react";
import { fetchLosLoans, type LosLoanSummary } from "./loans";
import { fetchLoansViaGraphql } from "./loansGraphql";

export interface LoansState {
  loans: LosLoanSummary[];
  /** True until the first answer lands, and again while a retry is in flight. */
  loading: boolean;
  /** Empty when the last read succeeded; NOT_AUTHENTICATED or FORBIDDEN when refused. */
  error: string;
  source: "graphql" | "apex";
  /** Reads again -- after a failure, or after an application has been created. */
  reload: () => void;
}

/**
 * The loans this reader may see, read once for the whole app.
 *
 * Lifted out of the list view because the entry decision depends on it: a borrower with
 * no loans lands on the application form, one with loans lands on the list, and only the
 * shell can send them to either. Reading in the list and reporting the count upward would
 * have flashed "no loans yet" before the redirect.
 *
 * GraphQL first, Apex second. The UI API runs as the logged-in user, so the platform
 * enforces sharing and field security rather than a hand-written projection. `null` from
 * it means the surface does not offer it, which is distinct from an empty result -- a
 * user who can genuinely see no loans must not silently fall through to the Apex endpoint
 * and get a different answer.
 */
export function useLoans(): LoansState {
  const [loans, setLoans] = useState<LosLoanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState<"graphql" | "apex">("apex");
  const [attempt, setAttempt] = useState(0);

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

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { loans, loading, error, source, reload };
}
