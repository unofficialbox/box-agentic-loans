# Supporting Box + Agentforce + React Scripts

These scripts present the React portion of Box + Salesforce Loan Origination at three depths. For the full scenario, use the parent [Box + Salesforce Loan Origination guide](../README.md#4-presenter-script).

| Script | Duration | Audience | Primary outcome |
|---|---:|---|---|
| [Executive walkthrough](01-executive-walkthrough.md) | 5-6 minutes | Executives, business sponsors, first meetings | Read the borrower's marked-up term sheet against the governed credit policy library, and show the borrower boundary |
| [Technical validation](03-technical-validation.md) | 15-20 minutes | Architects, Salesforce teams, security, developers | Prove credential, CSP, sharing, write-back and MCP boundaries -- and name the one that is not enforceable |
| [Box metadata entry-point variation](04-box-metadata-automate-entry.md) | 5-7 minutes | Any audience | Start with an application package uploaded to `01 - Application Intake` and `losLoan` metadata applied, then Automate enrichment, human validation, and HTTPS Connector record creation |

Supporting artifacts:

- [Harborview demo storyboard](../../../../../DEMO-STORYBOARD.html) -- the executive walkthrough as a single presenter page: preflight checks, every prompt as copy-paste, and what each beat should return. Open it in a browser. Site URL and borrower login are placeholders; bind them to your environment first.
- [Demo flow diagram](../../../../diagrams/los-box-agentforce-react-demo-flow.svg)
- [Box metadata entry-point diagram](../../../../diagrams/los-box-metadata-automate-entry.svg)
- [Machine-readable scenario manifest](../../../../../config/demo/box-salesforce-los-demo-manifest.bcl)
- [Agentforce action specification](../../../../../config/agentforce/los-react-agentforce-spec.bcl)

None of the three scripts has been rehearsed against a live org for the loans port. Every expected answer below is derived from the deterministic fixtures; the CLM predecessor proved the same code path live.

## Experience boundary

| Layer | Responsibility |
|---|---|
| React UI Bundle | The borrower's surface: their loans and the governed Box loan file, with Internal documents withheld |
| Box | Files, versions, metadata, the credit policy library Hub, and audit history |
| Salesforce | `LOS_Loan__c` structured context and credit approval state |
| Agentforce / MCP | Cited retrieval, extraction, comparison, explanation, draft preparation, and confirmed actions |
| Human reviewers | Credit decisions, policy exceptions, accepted terms, task completion, generation, and signature authorization |

## Activation and pass criteria

1. Deploy the UI Bundle, `LOS_Loan__c`, and least-privilege permission sets.
2. Configure standard REST external-ID upsert and lookup for validated intake fields.
3. Provide Agentforce IDs and downscoped Box-token behavior only through the documented runtime boundary.
4. Confirm the application resolves `recordId`, `loanId`, and `folderId` without browser secrets.
5. Confirm material answers cite Box files and approval state matches human-owned tasks.
6. Confirm one open task is reused per loan, application file, and review domain.
7. Doc Gen generates into the loan's own folder; Box Sign only ever *prepares* a request and refuses a loan that is not Approved or Commitment. Never describe a signature request as sent.
8. Extract writes nothing; Apply writes only allow-listed fields and only with `confirmed = true`.
9. Keep unverified platform claims outside these supporting scripts; the parent scenario owns that evidence.

## Shared presenter rule

Never describe Agentforce as approving a loan. It may retrieve, extract, summarize, compare, explain, draft, and route. Named humans accept extracted terms, complete approval tasks, and authorize signature.
