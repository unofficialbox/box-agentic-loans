import { useId, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import {
  APPLICATION_LIMITS,
  COLLATERAL_TYPES,
  LOAN_TYPES,
  createApplication,
  validateApplication,
  type ApplicationErrors,
  type ApplicationInput,
} from "../lib/applications";
import { provisionBoxFolder } from "../lib/box";
import type { LosIdentity } from "../lib/identity";
import { NOT_AUTHENTICATED, type LosLoanSummary } from "../lib/loans";
import { REQUIRED_DOCUMENTS } from "../lib/requiredDocuments";
import { DataError } from "./DataError";

/**
 * Starting a loan application.
 *
 * Six fields, and nothing the bank would decide for itself: no rate, no risk rating, no
 * officer. The borrower says what they want and why; the record opens in Application
 * status and the rest is the bank's to fill in.
 *
 * Submit is two requests in sequence -- create the record, then provision its Box folder
 * -- because Apex cannot make a callout after DML in one transaction. The workspace opens
 * only once both have answered, with the ids Salesforce and Box actually returned. A loan
 * id is never composed here: a form that shows "LN-2026-0043" before the org has said so
 * is inventing a record.
 */
export function ApplicationForm({
  identity,
  onCreated,
}: {
  identity: LosIdentity | null;
  /** The loan as Salesforce created it, with its folder when provisioning succeeded. */
  onCreated: (loan: LosLoanSummary) => void;
}) {
  const ids = useId();
  const [loanType, setLoanType] = useState("");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("");
  const [purpose, setPurpose] = useState("");
  /** What the borrower typed for the entity; null until they touch the field. */
  const [entityTyped, setEntityTyped] = useState<string | null>(null);
  const [collateral, setCollateral] = useState<string>("None");
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState<"" | "creating" | "provisioning">("");

  // Identity usually lands after the form is on screen, so the entity is derived rather
  // than copied: the account the reader is bounded to, until they type over it.
  const entity = entityTyped ?? identity?.accountName ?? "";

  if (identity?.isGuest) {
    return (
      <DataError
        title="Sign in to start an application"
        detail="Applications are filed against your organisation's account, so the bank needs to know who is applying."
        signInUrl={identity.loginUrl}
        testId="apply-signed-out"
      />
    );
  }

  const input: ApplicationInput = {
    loanType,
    loanAmount: Number(amount.replace(/[,\s$]/g, "")),
    termMonths: Number(term),
    purpose,
    borrowerEntity: entity,
    collateralType: collateral,
  };
  const required = loanType ? REQUIRED_DOCUMENTS[loanType] : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validateApplication(input);
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length > 0) return;

    setBusy("creating");
    const created = await createApplication(input);
    if (!created.ok) {
      setBusy("");
      setFailure(
        created.error === NOT_AUTHENTICATED
          ? "Your session has ended. Sign in again and the form will still be here."
          : created.error,
      );
      return;
    }

    // The record exists now. A folder that cannot be provisioned is reported on the
    // workspace it opens, where the retry lives; the borrower is not sent back to a form
    // that would create a second application.
    setBusy("provisioning");
    const folder = await provisionBoxFolder(created.value.recordId);
    setBusy("");
    onCreated({
      ...created.value,
      ...(folder.ok && folder.value.folderId ? { boxFolderId: folder.value.folderId } : {}),
    });
  }

  const field = (name: keyof ApplicationErrors) => ({
    id: `${ids}-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${ids}-${name}-error` : undefined,
  });

  return (
    <section className="cb-form-card" data-testid="application-form">
      <div className="cb-form-intro">
        <h2>Tell us about the loan</h2>
        <p>
          A few details open the application. The documents the bank needs come next, and
          the list depends on the kind of loan.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="cb-form">
        <div className="cb-field">
          <label htmlFor={`${ids}-loanType`}>Loan type</label>
          <select {...field("loanType")} value={loanType} onChange={(e) => setLoanType(e.target.value)} disabled={Boolean(busy)}>
            <option value="">Choose one</option>
            {LOAN_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <FieldError id={`${ids}-loanType-error`} message={errors.loanType} />
        </div>

        <div className="cb-field-row">
          <div className="cb-field">
            <label htmlFor={`${ids}-loanAmount`}>Amount requested</label>
            <div className="cb-input-affix">
              <span aria-hidden="true">$</span>
              <input
                {...field("loanAmount")}
                inputMode="decimal"
                placeholder="2,400,000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={Boolean(busy)}
              />
            </div>
            <FieldError id={`${ids}-loanAmount-error`} message={errors.loanAmount} />
          </div>
          <div className="cb-field">
            <label htmlFor={`${ids}-termMonths`}>Term in months</label>
            <input
              {...field("termMonths")}
              inputMode="numeric"
              placeholder={`${APPLICATION_LIMITS.minTermMonths} to ${APPLICATION_LIMITS.maxTermMonths}`}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              disabled={Boolean(busy)}
            />
            <FieldError id={`${ids}-termMonths-error`} message={errors.termMonths} />
          </div>
        </div>

        <div className="cb-field">
          <label htmlFor={`${ids}-purpose`}>Purpose</label>
          <textarea
            {...field("purpose")}
            rows={4}
            maxLength={APPLICATION_LIMITS.maxPurposeLength}
            placeholder="What the loan will fund, in a sentence or two."
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            disabled={Boolean(busy)}
          />
          <FieldError id={`${ids}-purpose-error`} message={errors.purpose} />
        </div>

        <div className="cb-field-row">
          <div className="cb-field">
            <label htmlFor={`${ids}-borrowerEntity`}>Borrowing entity</label>
            <input
              {...field("borrowerEntity")}
              value={entity}
              onChange={(e) => setEntityTyped(e.target.value)}
              disabled={Boolean(busy)}
            />
            <small className="cb-field-hint">The legal entity that will sign. Leave as is to borrow as your organisation.</small>
          </div>
          <div className="cb-field">
            <label htmlFor={`${ids}-collateralType`}>Collateral</label>
            <select {...field("collateralType")} value={collateral} onChange={(e) => setCollateral(e.target.value)} disabled={Boolean(busy)}>
              {COLLATERAL_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <FieldError id={`${ids}-collateralType-error`} message={errors.collateralType} />
          </div>
        </div>

        {required ? (
          <aside className="cb-form-aside" data-testid="application-required-preview">
            <strong>You will be asked for</strong>
            <ul>
              {required.map((row) => (
                <li key={row.documentType}>{row.label}</li>
              ))}
            </ul>
          </aside>
        ) : null}

        {failure ? (
          <p className="cb-form-failure" role="alert" data-testid="application-error">{failure}</p>
        ) : null}

        <div className="cb-form-actions">
          <button type="submit" className="upload-button" disabled={Boolean(busy)} data-testid="application-submit">
            {busy === "creating" ? "Opening your application…" : busy === "provisioning" ? "Preparing your document folder…" : (
              <>Submit application <ArrowRight size={15} aria-hidden="true" /></>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p className="cb-field-error" id={id} role="alert">{message}</p>;
}
