# Browser and Administrator Configuration

Complete these steps after `box-foundation` and `salesforce-deploy`. Read IDs from the local, gitignored `config/runtime/bootstrap-state.json`.

Before any browser-agent step, sign in to the intended Box web application with the intended builder account and keep that tab open. Confirm its hostname exactly matches `config/runtime/demo-environment.json`. Browser plans and private-lab executors use that existing web session; they do not perform login or contain credentials.

## 1. Box content and metadata

1. Open the generated `LOS-2026-Harborview` workspace.
2. Mark the four Word files in `08 - DocGen Templates` (credit memo, commitment letter, closing summary, maturity notice) as Box Doc Gen templates.
3. Confirm `seed-metadata` applied the `losLoan`, `losDocument`, `losCovenant`, and `losPolicy` values recorded in `bootstrap-state.json`.
4. Confirm the generated **Credit Policies** folder contains the README plus eight standard/exception Markdown policies (`LOS-LTV-*`, `LOS-DSCR-*`, `LOS-RATE-*`, `LOS-GUAR-*`).
5. Assign real owners and collaborators from this environment; do not copy demo usernames.

## 2. Box intake entry point

Intake does not use a Box Form. A loan application enters the pipeline when its package is uploaded into generated folder `01 - Application Intake` and the `losLoan` metadata template is applied to it, with `loanId`, `loanAmount`, and `targetClosingDate` populated (`borrower`, `loanType`, and `applicantEmail` are optional enrichment). Applying that metadata is the trigger for the **LOS - Loan Application Intake Enrichment** workflow.

Confirm the `01 - Application Intake` folder exists and that the `losLoan` template is available in this environment (section 1). No Form is built, enabled, or distributed.

## 3. Box App

Build **Loan Origination** from `config/box/box-app-blueprint.md`.

Use the generated folder/template IDs only when the builder asks for a binding. Put high-frequency actions first: **Start a New Application**, **Credit Policy Hub**, and **Executed Loans**. Add charts by status, policy risk, document type, market, and policy family.

Obtain approval before publishing. Record the published URL in `demo-environment.json`.

## 4. Credit Policy Library Hub

Create **Crestline Credit Policy Library** from `config/box/hub-blueprint.md`.

Include the policy README, standard positions, approved exceptions, governance notes, ownership, and review cadence. Add usage metadata and recently reviewed content. Obtain approval before publishing and record the URL.

## 5. Salesforce OAuth connection

1. Create a dedicated API-only integration user in the target org.
2. Assign `LOS_Box_Automate_Integration`.
3. In **Setup → External Client App Manager**, create **Box Automate LOS Integration**.
4. Enable OAuth and client-credentials flow; use `api` scope only.
5. Require administrator preauthorization and allow only `LOS_Box_Automate_Integration`.
6. Set the dedicated integration user as the client-credentials Run As user.
7. Keep refresh-token, device, JWT, and token-exchange flows disabled.
8. If Box requires a callback URL, use the target environment's saved workflow URL; the client-credentials flow does not otherwise use it.
9. Store the consumer secret only in the Box-managed OAuth connection.
10. Use the target org's My Domain token URL: `<my-domain>/services/oauth2/token`.
11. Test the connection without copying the returned token.

The repository intentionally contains no tenant-specific External Client App metadata. Create it in the target org using the settings above.

## 6. Box Automate

Build the workflows from `config/box/automate-workflows.bcl`. Start with **LOS - Loan Application Intake Enrichment**:

1. Trigger: `losLoan` metadata applied to a file in generated `01 - Application Intake`. The trigger yields `static.trigger.fileId` and `static.trigger.metadata.<key>`.
2. Extract: use the uploaded application package and the `loanIntake` prompts in `config/box/extract-field-prompts.bcl` (`loanType, riskRating, keyIssues, loanAmount, interestRate, termMonths, collateralValue, ltv, dscr`).
3. Agent review: use the `LOS Loan Risk Triage` spec in `config/box/ai-agent-specs.bcl` and require citations.
4. Human validation: assign a real reviewer in this environment.
5. Approved branch: Salesforce standard REST record creation, using `config/box/https-connectors.bcl`. Point the connector at the org that holds `LOS_Loan__c`; two similarly named connectors can target different orgs, and the wrong one fails as an opaque `UNKNOWN_ERROR`.
6. Rejected branch: return for correction; do not invoke Salesforce. The designed workflow leaves this branch empty, so a rejected submission ends the run silently.

Save and test the workflow while inactive. Obtain explicit approval immediately before activation.

### HTTPS Request settings

Use the resolved file `config/runtime/generated/box/https-connectors.bcl`.

The intended live path is a plain **POST** record create, not an upsert. This is the configuration whose CLM predecessor created a real record end to end; the loans variant carries the same endpoint shape with `LOS_Loan__c` field names and has **not** been run live at all. Every dynamic value is sourced from `static.trigger.metadata.<key>`. Re-test it against a labeled loan before activation.

| Request | Setting | Value |
|---|---|---|
| Create | Method | `POST` |
| Create | Endpoint | `services/data/v67.0/sobjects/LOS_Loan__c` (no leading slash; resolved against the connector base URL. Plain sobject collection, not an external-ID upsert path.) |
| Create | Headers | None. No headers and no query parameters; authorization is handled entirely by the Box-managed OAuth connection. |
| Create | Body | Copy the field mapping from `salesforceLoanCreate.body`. Every bound value must be sourced from a populated `losLoan` metadata key (`static.trigger.metadata.<key>`) or another mandatory source, or Box sends the literal `Variable unavailable`. |
| Create | Output | `id=$.id` |

Do not place the OAuth token in a header manually; select the Box-managed OAuth connection. If a Box variable picker uses different display labels, bind by the logical field named in the resolved BCL and verify the test preview before saving.

This POST is **not idempotent** (`idempotency.safe = false`): resubmitting the same loan creates a second record. The connector also carries `salesforceLoanUpsert` (a `PATCH` on `Loan_ID__c`) and `salesforceLoanLookup` (a `GET`) as the duplicate-safe alternative, but that upsert path has no live evidence either — `salesforceLoanUpsert` is marked `supersededForCreate = "salesforceLoanCreate"`. Restore it only if duplicate safety is required, and verify against a live run before relying on it.

## 7. Agentforce and optional orchestration

Configure only the Agentforce actions used by the LOS path (`get_loan_package`, `ask_box_ai`, `extract_loan_terms`), bind `default_agent_user` to this org's agent user, assign `LOS_Loan_Agent` to that user, then follow [Operator Start Here](start-here.md).

Record the new environment's IDs in `demo-environment.json`; never write secrets there.

## 8. Completion gate

Proceed only when:

- The App and Hub open for the intended operator.
- The `01 - Application Intake` folder accepts uploads and the `losLoan` metadata trigger starts the workflow.
- The workflow is saved and remains inactive until approval.
- OAuth succeeds as the dedicated integration user.
- One record creation succeeds in a labeled test, and the created record is opened and checked field by field in Salesforce rather than trusted from the Box run events.
- Every bound value is sourced from a populated `losLoan` metadata key (`static.trigger.metadata.<key>`) or another mandatory source. An unresolved variable is sent as the literal string `Variable unavailable`, not as an empty value, so an optional source corrupts any typed Salesforce field.
- Duplicate behaviour is understood and accepted: the create path is not idempotent, so a duplicate submission creates a second record. Restore the external-ID upsert if duplicate safety is required.
