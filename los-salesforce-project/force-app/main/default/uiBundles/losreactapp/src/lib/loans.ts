/**
 * LOS loan records for the dashboard.
 *
 * Read through a dedicated Apex endpoint rather than a Salesforce object API. The
 * Experience Cloud guest user holds no permissions on LOS_Loan__c; it is granted the
 * LosLoanListService class, and that class returns a fixed projection. So the shape
 * below is the whole of what the browser can see, by design.
 */

import { apexRead, apexRestUrl } from "./apexRest";
import { describeError, failed, firstLine, type Loaded } from "./loaded";

/** Recognisable by the view, so it can offer a way in rather than a reason. */
export const NOT_AUTHENTICATED = "not-authenticated";
/**
 * The platform's own refusal, before the class ran. The site's guest profile holds no
 * access to the loan classes, so a signed-out visitor is answered with a bare 403 by the
 * class gate rather than the 401 the class itself would have sent. To the visitor both
 * mean the same thing -- sign in -- and the view treats them alike.
 */
export const FORBIDDEN = "forbidden";

export interface LosLoanSummary {
  recordId: string;
  loanId?: string;
  name?: string;
  borrower?: string;
  /** The legal entity that signs, where a borrower borrows through several subsidiaries. */
  borrowerEntity?: string;
  loanType?: string;
  status?: string;
  loanAmount?: number;
  termMonths?: number;
  /** ISO date the loan matures. Absent until the loan has closed. */
  maturityDate?: string;
  /** The Box workspace folder associated with this loan record. */
  boxFolderId?: string;
  /** Box Sign embed URL for in-app signing. Present when a signature is pending. */
  signEmbedUrl?: string;
}

/**
 * The loan records this user may see.
 *
 * An empty array is a real answer -- an org that has not been seeded yet genuinely has no
 * loans -- and is distinct from a failure, which carries the reason it failed. There is
 * no third case where the page invents rows: a list that cannot be read says so.
 */
export async function fetchLosLoans(): Promise<Loaded<LosLoanSummary[]>> {
  try {
    const response = await apexRead(apexRestUrl("/services/apexrest/los/loans"), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const detail = firstLine(await response.text().catch(() => ""));
      // The endpoint refuses a guest rather than answering with an empty list, so that a
      // signed-out visitor is told to sign in instead of being told the org has no
      // loans. Surface it as its own state, not as a status code.
      if (response.status === 401 || detail.includes("not_authenticated")) {
        return { ok: false, error: NOT_AUTHENTICATED };
      }
      if (response.status === 403) {
        return { ok: false, error: FORBIDDEN };
      }
      return failed(
        `Salesforce returned ${response.status} for the loan list.${detail ? ` ${detail}` : ""}`,
      );
    }
    const result: unknown = await response.json();
    if (!Array.isArray(result)) {
      return failed("The loan endpoint answered with something that is not a list of records.");
    }
    return { ok: true, value: (result as LosLoanSummary[]).filter((row) => row && row.recordId) };
  } catch (error) {
    return failed(`The loan endpoint could not be reached. ${describeError(error)}`);
  }
}

/** Loan amounts arrive as raw numbers; the banner and list want one readable form. */
export function formatLoanAmount(value?: number): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}
