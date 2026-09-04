import { apexFetch } from "./apexRest";
import { describeError, failed, firstLine, type Loaded } from "./loaded";
import { NOT_AUTHENTICATED, type LosLoanSummary } from "./loans";

/**
 * Starting a loan application from the borrower portal.
 *
 * The body carries no account id and the endpoint accepts none: the loan is created for
 * whichever Account the signed-in user's Contact belongs to, resolved server-side. A
 * borrower can therefore only ever apply on their own behalf, and nothing in the URL or
 * the form can redirect an application to another organisation.
 *
 * The Box folder is a second request, made after this one succeeds. Provisioning the
 * folder is a callout and creating the record is DML, and Apex forbids a callout after DML
 * in one transaction -- so the browser sequences them.
 */
export interface ApplicationInput {
  loanType: string;
  loanAmount: number;
  termMonths: number;
  purpose: string;
  borrowerEntity?: string;
  collateralType?: string;
}

/** Loan_Type__c picklist, in the order the form offers them. */
export const LOAN_TYPES = [
  "Term Loan",
  "Line of Credit",
  "Equipment Finance",
  "Commercial Real Estate",
  "SBA 7(a)",
] as const;

/** Collateral_Type__c picklist. "None" is the server's default when omitted. */
export const COLLATERAL_TYPES = [
  "None",
  "Real Estate",
  "Equipment",
  "Receivables",
  "Cash and Securities",
] as const;

/** The server's bounds, repeated here so the form can refuse before the round trip. */
export const APPLICATION_LIMITS = {
  maxLoanAmount: 50_000_000,
  minTermMonths: 6,
  maxTermMonths: 360,
  minPurposeLength: 10,
  maxPurposeLength: 2000,
} as const;

export type ApplicationErrors = Partial<Record<keyof ApplicationInput, string>>;

/**
 * The same rules LosCreateApplication enforces, so a refusal is shown beside the field
 * before anything is sent. The server still checks; this only saves the round trip and
 * says which field, which the server's one-line detail cannot.
 */
export function validateApplication(input: ApplicationInput): ApplicationErrors {
  const errors: ApplicationErrors = {};
  if (!(LOAN_TYPES as readonly string[]).includes(input.loanType)) {
    errors.loanType = "Choose the kind of loan you are applying for.";
  }
  if (!Number.isFinite(input.loanAmount) || input.loanAmount <= 0) {
    errors.loanAmount = "Enter the amount you would like to borrow.";
  } else if (input.loanAmount > APPLICATION_LIMITS.maxLoanAmount) {
    errors.loanAmount = "Applications above $50,000,000 are arranged directly with your relationship manager.";
  }
  if (
    !Number.isInteger(input.termMonths) ||
    input.termMonths < APPLICATION_LIMITS.minTermMonths ||
    input.termMonths > APPLICATION_LIMITS.maxTermMonths
  ) {
    errors.termMonths = "Enter a term between 6 and 360 months.";
  }
  const purpose = input.purpose.trim();
  if (purpose.length < APPLICATION_LIMITS.minPurposeLength) {
    errors.purpose = "Tell us in a sentence or two what the loan is for.";
  } else if (purpose.length > APPLICATION_LIMITS.maxPurposeLength) {
    errors.purpose = "Keep the purpose under 2,000 characters.";
  }
  if (input.collateralType && !(COLLATERAL_TYPES as readonly string[]).includes(input.collateralType)) {
    errors.collateralType = "Choose one of the listed collateral types.";
  }
  return errors;
}

export type CreatedApplication = LosLoanSummary & { purpose?: string };

/**
 * POST the application and hand back the loan Salesforce created.
 *
 * On success the summary is the same shape the loan list uses, so the workspace can open
 * it straight away. On failure the server's own sentence is carried through: "invalid
 * application" alone would send the borrower back to a form with nothing marked.
 */
export async function createApplication(input: ApplicationInput): Promise<Loaded<CreatedApplication>> {
  const body: Record<string, unknown> = {
    loanType: input.loanType,
    loanAmount: input.loanAmount,
    termMonths: input.termMonths,
    purpose: input.purpose.trim(),
  };
  if (input.borrowerEntity?.trim()) body.borrowerEntity = input.borrowerEntity.trim();
  if (input.collateralType) body.collateralType = input.collateralType;

  try {
    const response = await apexFetch("/services/apexrest/los/applications", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 401 || text.includes("not_authenticated")) {
        return { ok: false, error: NOT_AUTHENTICATED };
      }
      return failed(serverDetail(text) || `Salesforce returned ${response.status} for the application.`);
    }
    const result = (await response.json()) as Partial<CreatedApplication> | null;
    // A response with no record id is not an application. Opening a workspace on one
    // would invent a loan the org never created.
    if (!result || typeof result.recordId !== "string" || !result.recordId) {
      return failed("Salesforce answered without saying which loan it created.");
    }
    return { ok: true, value: result as CreatedApplication };
  } catch (error) {
    return failed(`The application endpoint could not be reached. ${describeError(error)}`);
  }
}

/** The `detail` sentence from an Apex error body, or the first line of whatever came. */
export function serverDetail(text: string): string {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    if (typeof parsed?.detail === "string" && parsed.detail) return parsed.detail;
    if (typeof parsed?.error === "string" && parsed.error) return parsed.error.replace(/_/g, " ");
  } catch {
    // Not JSON: Salesforce answers some failures with HTML or a bare string.
  }
  return firstLine(text);
}
