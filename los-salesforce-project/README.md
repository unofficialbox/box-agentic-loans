# LOS Salesforce Project

This Salesforce DX project contains the portable `LOS_Loan__c` data model, layout, permission sets, tab, Lightning record page, the governed Apex actions (borrower application create, Box AI document classification, loan package, Box AI ask and extract, term write-back, commitment letter, Box Sign preparation), the `LOSLoanTools` MCP server definition, the `LOS_Loan_Copilot` agent script, and an authenticated external Experience Cloud site powered by a Salesforce Multi-Framework React UI Bundle (the Acme Borrower Portal).

Start with [LOS Demo Operator Start Here](../docs/operator/start-here.md). The root automation deploys the portable components and deliberately excludes tenant-specific OAuth metadata.

Provenance: this project is a port of the Box + Salesforce CLM demo's Salesforce project to commercial loan origination. It was deployed and smoke-tested against a live org on 2026-09-03 (103/103 Apex tests, every governed action probed); the operator's deploy set was corrected in that run to include `LOS_Box_Config__c`, the credentials and the CSP trusted sites.

## Local UI development

```bash
cd force-app/main/default/uiBundles/losreactapp
npm install
npm run dev
```

A local run has no Apex endpoint behind it, so both panels report that they could not be loaded. It contains no credentials.

The bundle contains no tenant hostname, Box IDs, task IDs, or usernames. Supply new-environment bindings at build time when needed:

- `VITE_BOX_HOSTNAME`, `VITE_BOX_FOLDER_ID`, and the optional `VITE_BOX_*_FOLDER_ID` values;
- `VITE_BOX_APP_URL` and `VITE_BOX_FORM_URL`;
- `VITE_AGENTFORCE_AGENT_ID`, `VITE_AGENTFORCE_APP_ID`, and `VITE_SALESFORCE_ORIGIN`.

The Salesforce page must pass `recordId`, `loanId`, and `folderId` in its launch context. Without a downscoped Box token the workspace fails loudly, naming the refusal, rather than standing in synthetic rows that read as live content.

## Verification

```bash
cd force-app/main/default/uiBundles/losreactapp
npm test -- --run
npm run build
npm run test:e2e
```

Apex tests cannot run offline; deploy to a scratch org or sandbox and run `sf apex run test --test-level RunLocalTests`. Every governed action has a test class beside it, and every Box callout is mocked by dispatching on the endpoint (the `oauth2/token` grant answers first, then the action's own call).

## Portable deployment

From the repository root:

```bash
python3 scripts/demo_operator.py salesforce-deploy --dry-run
python3 scripts/demo_operator.py salesforce-deploy
```
This deploys the Digital Experiences settings, object, fields, layout, operator and integration permission sets, tab, Loan Origination app, Lightning record page, Box tab, Experience-targeted UI Bundle, and authenticated external Experience Cloud site. Dispatch then publishes the site, waits for Salesforce's publish job to finish, and assigns the required LOS and Box permission sets to the authenticated administrator:

- Box Admin (All Licenses)
- Box Doc Gen Template Manager
- Box Sign
- LOS Box Automate Integration
- LOS Demo Operator

The Box tab uses the `box:recordBoxFolder` component from the Box for Salesforce managed package, so install that package before running the deployment. Environment-specific OAuth metadata is intentionally not included.

## Governed actions

| Class | Surface | What it does | What it refuses |
|---|---|---|---|
| `LosLoanList` | MCP | Lists loans by status and borrower | Never offered to the borrower site |
| `LosLoanPackage` | MCP, agent | Resolves a loan by loan ID, name or record ID; lists its Box documents | A loan with no folder is reported, not provisioned |
| `LosBoxAskDocument` | MCP, agent | Asks Box AI about one document, or the credit policy Hub | A file outside the named loan's folder |
| `LosExtractLoanTerms` | MCP, agent | Box AI Extract of amount, rate, term, collateral value, LTV, DSCR, maturity; validation against the record and policy | Writes nothing, ever |
| `LosApplyLoanTerms` | MCP, agent | Writes human-accepted terms to the seven allow-listed fields | `confirmed != true`; a Closed or Servicing loan; any other field |
| `LosPortfolioSearch` | MCP | Metadata search for `losDocument.policyRisk` under the loans root | An unconfigured root |
| `LosGenerateCommitmentLetter` | MCP | Box Doc Gen draft commitment letter into the loan's folder | No configured template; the draft approves nothing |
| `LosSendForSignature` | MCP | Prepares a Box Sign request and returns the prepare URL | Any status other than Approved or Commitment; it never sends |
| `LosBorrowerLoans` | Borrower site agent | The signed-in borrower's own loans, from their Contact's Account | Any reference to another borrower's loan |
| `LosCreateApplication` | Borrower portal (`POST /los/applications`) | Creates one `LOS_Loan__c` in Application status for the signed-in borrower's own Account, numbered `LN-<yyyy>-<NNNN>` after the last one that year; the browser then provisions the Box folder in a second request | Guests (401); a user with no Contact or Account (403); an invalid loan type, amount, term or purpose (400); any account id in the body; rate, LTV, DSCR, risk or officer, ever |
| `LosClassifyDocument` | Borrower portal (`POST /los/classify`), agent | Box AI structured extraction of `losDocument.documentType` for one uploaded file, written to the file's metadata with `versionStatus = Draft` | A file outside the named loan's folder; a loan the caller cannot read; a type outside the template's enum — then it writes nothing and says the document awaits the loan officer's classification |

Configuration for these lives on the `LOS_Box_Config__c` custom setting: the CCG subject, the folder allowlist, the credit policy Hub, the loans root folder and the commitment-letter template. See `scripts/configure-los-box-settings.sh`.

## Salesforce sample data (packageable)

The `sample-data/` folder captures a deterministic LOS dataset (Accounts, Contacts, Opportunities, Loans) plus an idempotent Apex seed and a BCL manifest. Dispatch runs the packaged seed after metadata deployment and verifies the expected `LOS_Loan__c` records by external ID.

- Idempotent Apex seed (source of truth):
  - `./scripts/seed-los-sample-data.sh <orgAlias>`
- Loan documents into each loan's Box folder:
  - `./scripts/seed-los-loan-files.sh <orgAlias>`
- BCL manifest (descriptive; not read at seed time):
  - `sample-data/los-sample-records.bcl`

This lets each environment load the same borrower relationships and record shape before demo setup.

## Integration user

After reviewing the target org shown by `sf org display`:

```bash
LOS_INTEGRATION_USERNAME='unique-user@your-domain.example' \
LOS_INTEGRATION_EMAIL='your-admin@your-domain.example' \
./scripts/configure-los-oauth.sh <org-alias>
```

The script creates or reuses an API-only integration user and assigns only `LOS_Box_Automate_Integration`.

## External Client App

Create the External Client App in the target org because these values are environment-specific:

- org scope;
- consumer key and secret;
- callback URL;
- dedicated Run As username;
- Salesforce My Domain token URL.

Use client credentials, `api` scope only, administrator preauthorization, and the dedicated integration user as Run As. Store the consumer secret only in the Box-managed OAuth connection.

## Runtime integration

1. Set Agentforce IDs through protected runtime configuration or supported `VITE_AGENTFORCE_*` build variables.
2. Configure the same-origin, authorized, downscoped Box-token endpoint (`LosBoxTokenService` at `/services/apexrest/los/box-token`) before claiming live embedded Box content.
3. Open the authenticated Experience Cloud site at its generated `/loans` URL. The packaged site metadata mounts `c__losreactapp` as the application space.
4. Pass this environment's `recordId`, `loanId`, and `folderId`.
5. Borrower intake is `LosCreateApplication` (create) followed by `LosBoxFolderService` (provision the folder) — two requests from the browser, in that order, because Apex cannot make a callout after DML in one transaction. The alternate email/Box Automate intake uses Salesforce standard REST external-ID upsert and lookup (`Loan_ID__c`) and needs no custom Apex.

The repository does not include Apex for underwriting-finding routing or lifecycle-event ingestion; those stay in the Box Automate designs. The loans variant has not been run against a live org at all, so treat every endpoint here as implemented-and-tested-offline until a live receipt says otherwise.
