# Integrated Smoke Test

Use a clearly labeled non-production request. Record new IDs in a run log, not in repository documentation. This test has not yet been executed for the loans port; the first run is the evidence.

## Box surface gate

1. Upload `harborview-loan-application-2026.pdf` into `01 - Application Intake` and apply the `losLoan` metadata with loan ID `LN-2026-0042`, `loanAmount` `4800000`, `targetClosingDate`, and the Harborview values (`borrower`, `loanType`, `applicantEmail`); confirm applying the metadata starts **LOS - Loan Application Intake Enrichment**.
2. Confirm the extracted loan type is `Commercial Real Estate`, the risk rating is reviewable as `High`, the LTV and DSCR findings cite the appraisal and the financial statements, and no agent claims a credit approval.
3. Correct unsupported values, then approve the human validation task.
4. Confirm Salesforce creates exactly one `LOS_Loan__c` record named `Loan Application - LN-2026-0042`.
5. Apply the same `LN-2026-0042` metadata to a second intake upload and confirm what happens to the Salesforce record: with the proven `POST` create it duplicates; with the `Loan_ID__c` upsert it updates. Record which path this org runs.
6. Confirm underwriting findings route one task per domain (Credit Risk, Collateral, Compliance, Loan Documentation) to real experts or the Credit Administration Triage owner.
7. Confirm the App charts and views reflect the seeded metadata.
8. Confirm signature remains blocked while the loan is in Underwriting.
9. Stop before Doc Gen output creation or Box Sign send unless the owner separately approves that action.

## Additional Box + Salesforce Loan Origination gate

1. Launch the Salesforce React workspace with the new record, loan ID, and Box folder ID.
2. Confirm only the authorized Box folder loads through downscoped access and documents tagged `Internal` are withheld.
3. Ask the Loan Copilot (or the MCP server) for a cited package summary of `LN-2026-0042`.
4. Run **Extract loan terms** on the application package and confirm the validation summary flags LTV (85% against the $5,650,000 appraisal) and DSCR (1.12x) without writing anything.
5. Run **Apply accepted loan terms** with `confirmed = true` on a labeled test loan only, and confirm the allow-listed fields update and nothing else does.

## Reset

1. Disable workflows enabled only for testing.
2. Record test files, Salesforce records, tasks, workflow runs, and generated outputs.
3. Restore the intended open-task state for the next rehearsal.
4. Remove temporary collaborators only after checking that no other demo uses them.
5. Delete data only with the system owner's approval.

## Run log

```text
Date/time:
Operator:
Scenario:
Box hostname:
Salesforce org alias:
Metadata trigger / workflow run:
Salesforce record:
Created or reused task IDs:
Corrections made during validation:
Confirmation-gated actions performed:
Reset completed:
Open issues:
```
