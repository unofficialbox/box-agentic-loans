# Salesforce Loan Record

Completes MT-030 and MT-031 at the repository-design level. Deployment and administrator validation are separate tasks.

## Decision

Use a dedicated custom object:

```text
LOS_Loan__c
```

Do not overload the standard Salesforce `Contract` object or org-specific managed lending objects. `LOS_Loan__c` (label "Loan") is the authoritative structured record; it links to standard Account and Opportunity records for relationship context.

## Ownership and sharing

| Decision | Value |
|---|---|
| Record owner | Standard `OwnerId`; authenticated integration user owns new records unless an approved assignment rule changes ownership |
| Loan officer | Optional `Loan_Officer__c` lookup to an active Salesforce User (relationship `Owned_LOS_Loans`, "Assigned Loans") |
| Unresolved loan officer | Preserve the validated metadata value in `Loan_Officer_Name__c`; do not create or guess a User |
| Internal sharing | Private |
| External sharing | Private |
| Access grant | Permission set plus the `LOS_Borrower_Access` sharing set on `Borrower_Account__c` for the borrower portal |

## Record identity and idempotency

- `Loan_ID__c` is optional for manual demo records, but remains the external ID used by Box for duplicate-safe synchronization.
- The Box HTTPS Connector's duplicate-safe design uses Salesforce's standard external-ID REST resource to upsert by `Loan_ID__c`.
- A retry with the same `loanId` returns the existing `recordId`.
- The Salesforce record form requires only three user-facing values: `Name`, `Loan_Amount__c` (labeled **Amount**), and `Target_Closing_Date__c`.
- For Box intake, `Name` is generated as `Loan Application - <loanId>`, so the trigger still asks for only Loan ID, Amount, and Target Closing Date.
- Underwriting-finding task routing uses a separate idempotency key: `loanId:applicationFileId:domain`.

## System-of-record boundary

Salesforce stores validated structured context, the bank's own assessment, and ownership metadata. Loan files, policies, versions, review evidence, generated documents, signatures, and content audit history remain in Box.

## Field groups

| Group | Fields |
|---|---|
| Identity | `Name`, `Loan_ID__c`, `Record_Source__c` |
| Intake | `Applicant_Name__c`, `Applicant_Email__c`, `Borrower__c`, `Borrower_Account__c`, `Borrower_Entity__c`, `Opportunity__c`, `Loan_Type__c`, `Loan_Amount__c`, `Term_Months__c`, `Region__c`, `Collateral_Type__c`, `Target_Closing_Date__c` |
| Credit terms | `Interest_Rate__c`, `LTV__c`, `DSCR__c`, `Collateral_Value__c`, `Maturity_Date__c` — the allow-list `LosApplyLoanTerms` may write, with `Loan_Amount__c` and `Term_Months__c` |
| Assessment | `Risk_Rating__c`, `Underwriting_Notes__c` — never projected to the borrower |
| Ownership | `OwnerId`, `Loan_Officer__c`, `Loan_Officer_Name__c` |
| Lifecycle | `Status__c` (`Application`, `Underwriting`, `Credit Review`, `Approved`, `Commitment`, `Closed`, `Servicing`) |
| Box | `Box_Workspace_Folder_ID__c` |

Machine-readable mapping: `config/salesforce/los-loan-record.bcl`.

Deployable metadata: `los-salesforce-project/force-app/main/default/objects/LOS_Loan__c/`.

## Borrower projection

`LosLoanListService.LoanSummary` serves the borrower portal exactly `recordId, loanId, name, borrower, borrowerEntity, loanType, status, loanAmount, termMonths, maturityDate, boxFolderId`. `Risk_Rating__c`, `LTV__c`, `DSCR__c`, and `Underwriting_Notes__c` are deliberately absent from the projection, not merely from the permission set, because Apex does not enforce field-level security in SOQL for authenticated users. `LOS_Box_Preview_Guest` and `LOS_Borrower_Portal` grant exactly the projected fields; `validate_los.py` checks this offline.

## Intake integration

> **Inbound email is the realistic first hop.** Before an application reaches the Box intake, it usually arrives by email. The `EmailIntakeHandler` inbound email service (see [Inbound Email Intake Service](../operator/email-intake-service.md)) captures a borrower's email onto the matching Opportunity's activity timeline and uploads the attachment **straight into that Opportunity's Box folder** via the Box for Salesforce managed package — the file is stored once, in Box, not duplicated as a Salesforce File. That handler does **not** create `LOS_Loan__c` — record creation stays in the governed path described here.

> **Designed path vs. duplicate-safe target.** The workflow uses a plain **POST** create to the sobject collection (`services/data/{apiVersion}/sobjects/LOS_Loan__c`), captured in `config/box/https-connectors.bcl` as `salesforceLoanCreate`. The CLM predecessor proved that POST end to end; the loans variant has not been run live. The POST is **not idempotent**: a resubmission creates a second record. The external-ID **PATCH upsert** described below is the duplicate-safe *design target*; it is not the live path. Restore it — and verify against a live run — only if duplicate safety is required. The connector marks this (`salesforceLoanCreate`, `idempotency.safe = false`).

The duplicate-safe design is an upsert by external ID:

```text
PATCH /services/data/{apiVersion}/sobjects/LOS_Loan__c/Loan_ID__c/{urlEncodedLoanId}
```

No custom Apex REST service is required for intake. The approved Box Automate branch maps validated values directly to Salesforce field API names and sends the request over an OAuth 2.0 HTTPS connection.

An insert returns a record ID; a successful update returns `204 No Content`. So the next step retrieves the record through the same external-ID resource:

```text
GET /services/data/{apiVersion}/sobjects/LOS_Loan__c/Loan_ID__c/{urlEncodedLoanId}?fields=Id,Loan_ID__c
```

Response mapping:

```json
{
  "recordId": "Id",
  "loanId": "Loan_ID__c"
}
```

`Borrower_Account__c` and `Opportunity__c` are not part of the intake path: the intake metadata supplies no Account or Opportunity ID, so the connector neither writes nor reads them. They are populated by the packaged sample data or manual entry; `salesforceLoanLookup` fetches only `Id` and `Loan_ID__c`.

The Box Automate integration must:

1. Authenticate through an administrator-managed Salesforce OAuth 2.0 connection.
2. Use a dedicated integration user with access only to the required object and fields.
3. Validate the Box folder and file IDs.
4. Resolve `Loan_Officer__c` only from an existing active User; otherwise leave it null and preserve the supplied name.
5. Upsert by `Loan_ID__c`.
6. Look up and return the same record on retry.
7. Never accept loan-file bytes, access tokens, connector secrets, or unreviewed AI output.

SOQL is not required. If the Box Automate builder cannot retrieve by external ID, a second standard REST query may select `Id` and `Loan_ID__c` by the generated loan ID.

## Metadata and Extract mapping

The authoritative mapping is the `fieldMappings` array in `config/salesforce/los-loan-record.bcl`. Key rules:

- Only Name, Amount, and Target Closing Date are mandatory on the Salesforce record layout; every other field is optional for a fast demo flow. Amount and Target Closing Date stay schema-optional so older records with blanks do not block an upgrade.
- Metadata values are written only after the Box human-validation gate.
- `riskRating` is written only when a human validated the Extract/AI result.
- Extracted credit terms (`LosExtractLoanTerms`) reach the record only through `LosApplyLoanTerms` with `confirmed = true`, and never on a `Closed` or `Servicing` loan.
- `boxFolderId` must be the allowlisted workspace associated with the intake.
- `boxFolderUrl` must use the hostname recorded for the target Box enterprise.
- The uploaded package stays in Box; Salesforce receives only its Box file ID.

## Deployment acceptance criteria

- Custom object and fields deploy successfully.
- Permission sets grant only the intended operator, agent, and borrower access.
- Private sharing is confirmed in the target org, and `LOS_Borrower_Access` grants the borrower exactly their account's loans.
- Standard REST upsert creates one record and the follow-up lookup returns the required context.
- A duplicate request returns the same record.
- Invalid fields, unauthorized folders, unconfirmed writes, and unresolved users fail closed.
- React launches with the returned record, loan, and Box folder IDs.
