# Technical Demo: Runtime, Security, and Guardrails

## Demo card

| Item | Value |
|---|---|
| Duration | 15-20 minutes |
| Audience | Enterprise architects, Salesforce developers, Box platform teams, security reviewers |
| Goal | Show where each credential lives, what bounds each surface, which write is allowed and how it is gated, and which boundaries are enforced by the platform rather than by the prompt |

Nothing in this script has been executed against a live org for the loans port. Where the
text says "verify", it is telling you what to look for the first time; the CLM predecessor
verified the same code path.

## Architecture statement

1. Applying `losLoan` metadata to a file in `01 - Application Intake` triggers a Box Automate workflow.
2. A human validates the Extract and Box AI output.
3. The approved branch calls Salesforce standard REST and creates one `LOS_Loan__c` record.
4. Salesforce hosts the Multi-Framework React UI Bundle on an Experience Cloud site.
5. The site's workspace reads Box content with a short-lived token downscoped to one folder.
6. The internal persona reaches the same governed Apex through a hosted MCP server.
7. The borrower's record access is enforced by a Salesforce sharing set.
8. The one write from an agent to the record is an allow-listed, human-confirmed Apex action.

There is no call to an external agent runtime or middleware in this variation.

## Script

### Act 0 — Record creation, and what it does not yet guarantee (2 minutes)

**Show**

- The Automate approval task standing before the connector call.
- `config/box/https-connectors.bcl` and the `LOS_Loan__c` object with its unique `Loan_ID__c`.

**Say this exactly**

> The designed connector is a plain `POST` create. It is **not** idempotent: re-triggering the
> same loan creates a second record. The duplicate-safe design is a `PATCH` upsert against
> the `Loan_ID__c` external ID, and it is not the path that runs.

Do not claim duplicate safety unless the org on screen actually runs the upsert path.

**Verify**

- No loan-file bytes, Box tokens, connector secrets, or unreviewed AI output appear in the request.

### Act 1 — The deployable UI Bundle (2 minutes)

**Show**

- `los-salesforce-project/force-app/main/default/uiBundles/losreactapp/` and `losreactapp.uibundle-meta.xml` with target `Experience`.
- `sites/LOS_Experience.site-meta.xml` and `networks/LOS Experience.network-meta.xml` mounting `c__losreactapp` at `/loans`.
- `src/Workspace.tsx`, `src/components/BoxWorkspace.tsx`, `src/components/LoanList.tsx`.

**Explain**

The site requires authenticated access and disables self-registration. This app is the
**borrower's** surface; the internal persona does not use it.

### Act 2 — The credential boundary (4 minutes)

**Show**

- `fetchDownscopedBoxToken()` in `src/lib/box.ts`, calling `/services/apexrest/los/box-token?recordId=<id>`.
- `LosBoxTokenService.cls`: a client-credentials grant, then an exchange scoped to one folder.
- The requested scope string, which is wider than a read-only demo implies:

  ```
  base_explorer item_preview item_read item_upload item_download item_delete item_rename item_share
  ```

  Scopes are **space-separated**; `"a,b"` is read as one scope name and only fails once a
  second scope is requested. A unit test pins it.
- The merge fields in the grant body. Apex holds `{!$Credential.LOS_Box.ClientId}` and
  `{!$Credential.LOS_Box.ClientSecret}` and never a secret; Salesforce substitutes the
  encrypted values from the `LOS_Box` external credential at callout time.
- The repository secret scan that rejects `client_secret` in browser code.

**Explain**

- The browser receives only a short-lived token bound to one folder. The enterprise parent
  token is exchanged, never returned.
- The folder is resolved **server-side** from the record's `box__FRUP__c` association; a
  caller cannot name a folder the record is not linked to. Non-numeric folder ids are
  rejected before any call reaches Box.
- **A folder needs a direct collaboration to downscope.** Inherited access returns
  `invalid_resource` from the exchange while `GET /2.0/folders/<id>` still answers 200 with
  `can_upload: true`. The tell is `GET /2.0/folders/<id>/collaborations`.

**Credential model:** a Client Credentials Grant app, so any authorized viewer of the site
gets a preview with no per-user consent. Moving to per-user Box OAuth gives per-person
attribution in Box's audit log and removes the enterprise-wide token, at the cost of one
consent per user. That is MT-040 and it is not done.

### Act 3 — Why the preview is bundled, not fetched (3 minutes)

This is the most Salesforce-specific constraint in the build and it is worth the time.

**Show**

- `src/lib/boxPreviewRuntime.ts` and the `BundledPreview` subclass.
- The site's live CSP header: the Box trusted sites reach `style-src`, `media-src`,
  `font-src`, `connect-src` and `frame-src` -- and only `script-src` is missing them.

**Explain**

> Box Content Preview normally injects a `<script>` from the Box CDN. On an Experience Cloud
> site that script never loads, and there is no setting to change it: `CspTrustedSite` has
> **no script-src field at all**. Querying `IsApplicableToScriptSrc` fails with "No such
> column". The Strict/Relaxed CSP switch lives in Experience Builder, which refuses to open a
> React-framework site.

So the renderer is an npm dependency the bundler puts on the page. `boxPreviewRuntime.ts`
assigns `global.Box.Preview` unconditionally -- importing the package already registers a
plain `Preview` there, so a "only if missing" guard silently wins and drops the subclass.
The token is passed as a **function**; Preview 3.x asserts it and fails silently on a string.

**Verify on the deployed site:** the marked-up term sheet renders, with zero script requests
to `cdn01.boxcdn.net`.

### Act 4 — The agent's real actions (3 minutes)

**Show**

`los-salesforce-project/force-app/main/default/aiAuthoringBundles/LOS_Loan_Copilot/`.
Three actions exist:

| Action | Target | Purpose |
|---|---|---|
| `get_loan_package` | `apex://LosLoanPackage` | Resolves the loan, its Box folder, and every document's Box file ID |
| `ask_box_ai` | `apex://LosBoxAskDocument` | Asks Box AI about one file id, or the credit policy Hub |
| `extract_loan_terms` | `apex://LosExtractLoanTerms` | Box AI structured extract of the seven loan-term fields from one file of the loan, compared to the record; reads only |

**Call out**

- `ask_box_ai` and `extract_loan_terms` carry `available when @variables.loanPackageLoaded == True`.
  Prose ordering was ignored five times in a row in the CLM predecessor; the hard guard is
  what fixed it, because the wrong order is never offered.
- `LosBoxAskDocument` forces the Hub id from configuration, so a caller cannot name which
  library to check itself against. `LosExtractLoanTerms` bounds its file id through
  `LosLoanPackage.documentIdsFor`, so a caller cannot extract from another loan's file.
- The managed-package Box AI invocable authenticates as the *Salesforce user*, and an agent
  user has no linked Box account. That is why this is custom Apex on the org's own
  client-credentials grant.
- `default_agent_user` ships as a placeholder and is bound per org at publish time.

**The lesson worth stating:** when an action never appears in the trace at all, suspect
permissions before prompting. An unavailable action is invisible, not failed. `LOS_Loan_Agent`
grants the four Apex classes the agent user needs.

`config/agentforce/los-react-agentforce-spec.bcl` still describes underwriting-finding
routing actions. Those are a **design spec, not deployed behaviour** -- say so if anyone
opens it.

### Act 5 — The one write, and how it is gated (2 minutes)

**Show**

- `LosApplyLoanTerms.cls`: the allow-list `Loan_Amount__c, Interest_Rate__c, Term_Months__c,
  Collateral_Value__c, LTV__c, DSCR__c, Maturity_Date__c`; the `confirmed = true` check; the
  refusal on `Closed` and `Servicing`.
- `LOS_Loan_Agent` granting edit on exactly those fields and nothing else.

**Explain**

Extract and Apply are two actions on purpose. Extract returns values and a validation
summary and writes nothing; a person reads the citations and decides. Apply takes the
explicitly supplied values -- not "whatever Extract returned" -- and refuses without the
confirmation flag. The gate is in Apex, so a model cannot talk its way past it, and the
allow-list means a confirmed write cannot reach `Status__c`, `Risk_Rating__c` or
`Underwriting_Notes__c`.

State the edge honestly: the request shape for `/2.0/ai/extract_structured` and the
write-back have unit tests only. They have not been run against a live loan.

### Act 6 — Two boundaries, one of them incomplete (4 minutes)

Show both. The second is the honest half.

**The workspace is bounded, and it is checkable.**

- `LOS_Borrower_Access` maps `LOS_Loan__c.Borrower_Account__c` to the signed-in
  user's Contact Account.
- `LosLoanListService.LoanReader` runs **`with sharing`**, so the platform filters it.
- `LOS_Borrower_Portal` grants exactly the `LoanSummary` projection (`recordId, loanId, name,
  borrower, borrowerEntity, loanType, status, loanAmount, termMonths, maturityDate,
  boxFolderId`) and withholds `viewAllRecords`. `Risk_Rating__c`, `LTV__c`, `DSCR__c` and
  `Underwriting_Notes__c` are absent from the **projection**, because Apex does not enforce
  FLS in SOQL for authenticated users. `validate_los.py` checks the projection against both
  site permission sets offline.
- Verify with `UserRecordAccess` rather than the share tables, which show zero rows for
  sharing-set access:

  ```sql
  SELECT RecordId, HasReadAccess FROM UserRecordAccess
  WHERE UserId = '<borrower user>' AND RecordId IN (<loan ids>)
  ```

  The borrower reads their own loans and has no access to Pinecrest's.

**The agent is not bounded, because of what kind of agent it is.**

- A Service Agent -- `BotDefinition.Type = ExternalCopilot`, `AgentType = EinsteinServiceAgent`
  -- runs as the agent user named in `BotUserId`, not as the signed-in person. So
  `UserInfo.getUserId()` returns the agent, its Contact is null, and an identity-scoped
  action is useless inside it. The org confirms the binding directly:

  ```sql
  SELECT DeveloperName, Type, BotUserId, BotUser.Name FROM BotDefinition
  ```

- **An Employee Agent behaves the other way.** It inherits the permissions of the logged-in
  user and its `default_agent_user` is optional. The limitation below is a property of the
  agent type, not of Agentforce.
- `get_loan_package` binds `with inputLoan = ...`, meaning the model fills it from the
  conversation. **A borrower could therefore ask a Service Agent about another company's
  loan by naming it.**
- The downscoped Box token bounds the workspace UI. It does not bound the agent, which reaches
  Box through Apex under the app's own credentials.

State this plainly to a security audience. That is why the borrower portal carries no
agent, and why the storyboard's "same agent, different access" beat is an internal
Employee Agent beat.

### Act 7 — The MCP boundary (2 minutes)

**Show**

- `McpServerDefinition:LOSLoanTools` exposing `listLoans`, `findDocumentsByRisk`,
  `getLoanPackage`, `askLoanDocument`, `extractLoanTerms`, `applyLoanTerms`,
  `generateCommitmentLetter`, and `prepareSignatureRequest`.
- `LOS_MCP_Client`, an empty permission set that exists only to gate who may authenticate.

**Explain**

The Box credential never leaves Apex. A client holding an MCP token holds no Box token, and
reads loan-file content only through the same governed Apex the site uses.

Two constraints worth naming: `McpServerDefinition` is **Metadata API and source-tracking
only** -- not packages, not change sets -- and activation is not in the metadata at all. It is
a `McpServerAccess` Tooling API record whose `DeveloperName` must equal the server's. Without
it a client authenticates and sees no tools.

### Act 8 — Run the gate (1 minute)

```bash
python3 scripts/validate_los.py
```

Every repository-mode check, including a secret and runtime-ID scan across every tracked
text file, the React unit, lint, build, and Playwright suites, local Markdown link
resolution, and the SOQL-projection-versus-permission-set check.

## Technical pass criteria

- The UI Bundle builds without a Salesforce org.
- Unit, lint, build, and end-to-end suites pass.
- Browser code contains no client secret; no runtime environment ID is committed.
- The downscoped token is bound to one folder and the parent token is never returned.
- Preview renders with no script request to the Box CDN.
- The borrower's record access is confirmed by `UserRecordAccess`.
- Extract writes nothing; Apply refuses without confirmation and outside the allow-list.
- The agent's inability to scope by identity is stated, not omitted.
- Record creation is **not** claimed to be idempotent.

## References

- [Executive walkthrough](01-executive-walkthrough.md)
- [Box metadata entry-point variation](04-box-metadata-automate-entry.md)
- [Box + Salesforce Loan Origination scenario](../README.md)
- [Operator setup and activation](../../../start-here.md)
