# LOS Use-Case Creator

Use this path to understand or tailor the existing loan origination use case. This repository is already a generated vertical, ported from the Box + Salesforce CLM demo; do not run a template generator or replace it with a generic scaffold.

## Review order

1. [Architecture](architecture.md)
2. [Salesforce Loan Record](salesforce-loan-record.md)

## Definition of the use case

| Dimension | LOS decision |
|---|---|
| Business process | Commercial loan application intake, underwriting, credit approval, commitment, closing, and covenant servicing |
| Primary user | Commercial loan officers (Alex Bennett) and the accountable credit reviewers (Credit Risk, Collateral, Compliance, Loan Documentation) |
| Business object | Salesforce `LOS_Loan__c` |
| Governed content package | Application, financial statements, tax return summary, bank statements, appraisal, insurance certificate, environmental report, the borrower's marked-up term sheet, credit memos, credit policies, commitment letter, and executed loan agreements |
| Content authority | Box |
| Structured authority | Salesforce |
| Human authority | Credit Risk (Chief Credit Officer), Credit Committee, Collateral Review, Compliance, Loan Documentation, and Pricing Committee |
| Entry points | Box metadata trigger on an uploaded application package, or a prepared Salesforce record, depending on the scenario |
| Failure path | Triage missing evidence, low confidence, unresolved owners, partial writes, and blocked approvals before retry |
| Reset path | Remove or archive only resources owned by the confirmed demo run and retain reset evidence |

Every material claim must use the readiness vocabulary in `docs/conventions.md`. Keep credentials, tenant IDs, org IDs, live record IDs, and machine-specific paths out of committed files.

After changing domain behavior, hand the result to the [operator](../operator/README.md) for environment binding and live validation.
