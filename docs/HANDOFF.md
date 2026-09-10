# Handoff

For an agent picking up this repo cold. Verify anything time-sensitive against `git log` and `validate_los.py` before relying on it.

## 1. What this repo is

A commercial loan origination (LOS) demo on Box + Salesforce, ported from the Box + Salesforce CLM demo in the sibling `box-bedrock-for-clm` repository. Repository mode is fully green offline; live presenter-readiness is a separate opt-in gate.

One scenario, two surfaces. The borrower portal (a Salesforce Multi-Framework React app on an Experience Cloud site) is the intake: a borrower signs in, starts an application (`LosCreateApplication`), and uploads the documents `config/los/required-documents.bcl` asks for, each classified by Box AI (`LosClassifyDocument`). The internal surface is the `LOSLoanTools` hosted MCP server or the `LOS_Loan_Copilot` Employee Agent. Governed Apex actions are the only path between Box and Salesforce, and humans keep credit authority. The metadata-triggered Automate workflow is the alternate intake, so `config/box/*.bcl` and `LOS_Box_Automate_Integration` stay.

The story is in `DEMO-CLICKPATH.md`: Alex Bennett at Acme Bank works the Dockwright Logistics loan `LN-2026-0042` ($4.8M, Underwriting). The borrower's marked-up term sheet weakens the DSCR test and inflates the collateral pool; the appraisal puts LTV at 85% and DSCR at 1.12x, outside even the approved exceptions, while Dockwright accepted 70% / 1.30x on `LN-2023-0311` and `LN-2025-0148`. A commitment letter is generated; signature is refused; Dana Whitfield sees only Dockwright's loans with Internal documents withheld.

**Governance invariant:** Box is authoritative for loan-file content; `LOS_Loan__c` for structured credit truth; the Opportunity is the Box-mapped object. Loan-file bytes never flow to Salesforce. Draft generation follows a human request; signature preparation enforces status; `LosApplyLoanTerms` needs `confirmed = true` from a person who reviewed the values.

## 2. Working rules

- Work from the Git root; repository-relative paths in durable files.
- Read `README.md` and exactly one persona under `.claude/personas/` before exploring.
- Any live-org or enterprise mutation needs explicit approval and a confirmed target. No secrets, environment IDs, live record IDs or machine paths in committed files.
- Update sources before generated output; run the narrowest test, then `python3 scripts/validate_los.py` without skip flags.

## 3. Current state

- Deployed once to one org and one enterprise (2026-09-03/04) and smoke-tested: token endpoint, loan package, Box AI ask and extract, refused unconfirmed write-back and a confirmed write of amount, rate and term (2026-09-08), signature guard, bounded portfolio search, Doc Gen registration, policy Hub, and the borrower intake (application, folder, two classified uploads). IDs from that run live only in gitignored `config/runtime/*.json`.
- `python3 scripts/validate_los.py` should pass every repository-mode check with one skip (live receipts). Four checks shell out to the UI bundle, so `npm ci` in `los-salesforce-project/force-app/main/default/uiBundles/losreactapp` runs first.
- Two actions have no CLM ancestor: `LosExtractLoanTerms` (read-only Box AI extract compared to the record) and `LosApplyLoanTerms` (allow-listed write; refuses without `confirmed = true` and on Closed/Servicing). Two more arrived with the intake: `LosCreateApplication` and `LosClassifyDocument`.
- The Loan Copilot is internal only. Its `default_agent_user` is bound per org at publish.
- The old fixture fallback is gone: every Box or Salesforce failure names itself on the page. Keep it that way; a plausible synthetic screen hid three stacked failures in the predecessor.

## 4. Config model

- Authored specs are BCL (`config/**/*.bcl`), an HCL2-subset envelope `locals { "bcl" = { resources = [{ "config" = {...} }] } }`; the payload is `resources[0].config`. `scripts/bcl.py` is the dependency-free reader; `demo_operator.py` and `validate_los.py` load through it.
- Runtime files are JSON (`config/runtime/*.json`, gitignored) and are round-tripped by tooling. Only the `*.example.json` templates are committed; resolved specs land in `config/runtime/generated/`.

## 5. Key paths

| Path | Purpose |
|---|---|
| `scripts/demo_operator.py` | bootstrap, box-foundation, seed-metadata, salesforce-deploy, resolve-config, validate; `FOLDER_BINDINGS` / `FILE_BINDINGS` and the 16 metadata seeds |
| `scripts/validate_los.py` | Offline matrix: secrets, JSON/BCL, links, Mermaid drift, tests, React gates, fixture drift, screenshot manifest, idempotency, SOQL/FLS agreement |
| `scripts/generate_sample_loan_assets.py`, `generate_docgen_templates.py` | The PDFs, JSON fixtures, Doc Gen templates and the Word term-sheet markup |
| `config/box/metadata-templates.bcl`, `automate-workflows.bcl`, `https-connectors.bcl` | Templates, the alternate intake workflow, the connector |
| `config/los/required-documents.bcl` | Borrower checklist per `Loan_Type__c`; `src/lib/requiredDocuments.ts` mirrors it and `tests/test_required_documents.py` fails on drift |
| `config/los/expert-routing.bcl` | Underwriting domains and owners |
| `sample-data/policies/` | The credit policy library uploaded to Box |
| `.../classes/LosBoxTokenService.cls`, `LosBoxFolderService.cls` | Downscoped token endpoint; folder provisioning with the direct collaboration grant |
| `.../classes/LosLoanPackage.cls`, `LosBoxAskDocument.cls`, `LosPortfolioSearch.cls` | Resolve a loan; ask Box AI; metadata search bounded by `Loans_Root_Folder_Id__c` |
| `.../classes/LosExtractLoanTerms.cls`, `LosApplyLoanTerms.cls` | Extract and the confirmed write-back |
| `.../classes/LosGenerateCommitmentLetter.cls`, `LosSendForSignature.cls` | Doc Gen; Sign preparation gated on `SIGNABLE = {'Approved','Commitment'}` |
| `.../classes/LosLoanListService.cls`, `LosBorrowerLoans.cls`, `LosCreateApplication.cls`, `LosClassifyDocument.cls` | The borrower projection, list, create and classify |
| `.../externalCredentials/LOS_Box.externalCredential-meta.xml`, `.../objects/LOS_Box_Config__c/` | Where the Box credential and non-secret settings live |
| `.../permissionsets/`, `.../sharingSets/LOS_Borrower_Access.sharingSet-meta.xml` | `LOS_Demo_Operator`, `LOS_Box_Preview_Guest`, `LOS_Borrower_Portal`, `LOS_Loan_Agent`, `LOS_MCP_Client`, `LOS_Box_Automate_Integration`; the borrower's record boundary |
| `.../mcpServerDefinitions/LOSLoanTools.mcpServerDefinition-meta.xml` | The nine hosted MCP tools |
| `.../aiAuthoringBundles/LOS_Loan_Copilot/` | Agent Script for the Copilot |
| `.../objects/LOS_Loan__c/listViews/New_applications` | The loan officer's view of portal applications |
| `.../cspTrustedSites/` | `LOS_Box_App` (frame-src) and `LOS_Box_Content_Delivery` (connect-src) |
| `.../losreactapp/src/components/BoxWorkspace.tsx`, `BoxElements.tsx` | Token then listing, with `DataError` on either failure; folder table plus lazy Content Preview |
| `.../losreactapp/src/components/ApplicationForm.tsx`, `RequiredDocuments.tsx`, `LoanList.tsx` | The form, the checklist, the borrower's loans |
| `.../losreactapp/src/lib/box.ts`, `boxPreviewRuntime.ts`, `apexRest.ts`, `loaded.ts` | `WITHHELD_VERSION_STATUS = "Internal"`; the bundled preview seam; CSRF-bearing writes; `Loaded<T>` |
| `.../losreactapp/vite.live-box.ts` | `npm run preview:live` serves a real downscoped token locally; `dev:live` cannot mount Box UI Elements |
| `.../losreactapp/.npmrc`, `los-salesforce-project/.forceignore` | `legacy-peer-deps=true`; keep `node_modules` out of the deploy. Do not delete either |
| `los-salesforce-project/scripts/` | `configure-los-box-*.sh`, `configure-los-oauth.sh`, `seed-los-*.sh` |
| `skills/loan-origination/SKILL.md` | Presenter skill for any AI harness |
| `tests/` | BCL, required documents, operator, validator, setup, navigation and persona checks |

## 6. Constraints that will bite you

Each is a property of Box, Salesforce or box-ui-elements the code has already paid for once.

### 6.1 Box folders and tokens

- A folder needs a **direct** collaboration with `Box_User_Id__c` before it can be downscoped. Inherited access returns 200 with `can_upload = true`, then `invalid_resource` on exchange. `GET /2.0/folders/<id>/collaborations` is the tell.
- The Box for Salesforce Toolkit and the LOS Box app are different Box identities; only the Toolkit's owns what the Toolkit creates. `LosBoxFolderService.grantWorkspaceAccess` posts the collaboration before `commitChanges()`, while a callout is still legal; 409 counts as success. Provision through it or grant the collaboration yourself.
- `createObjectFolderForRecordId` returns the shared object folder, not the record's. A folder the Toolkit just created may refuse CCG writes (`404 not_found` on move or copy); write through the package's `box__MoveFile` invocable.
- Metadata search is enterprise-wide; always pass `ancestor_folder_id`. Enum values are case-sensitive (`critical` fails with `invalid_query`); `LosPortfolioSearch` normalises. Request metadata on listings as `metadata.enterprise.<templateKey>` so no enterprise id reaches the browser.
- Borrower uploads are attributed to the CCG subject in Box history; per-user OAuth (MT-040) is the fix.

### 6.2 Content Preview

Four things must be true at once, and none names itself: `box-annotations` (pinned `5.2.1-beta.18`) installed and passed as `boxAnnotations`; a react-router `Router` above the preview (`BoxElements` wraps it in `MemoryRouter`); the token passed as a function, not a string; `item_preview` in scope plus the `LOS_Box_App` and `LOS_Box_Content_Delivery` trusted sites.

The renderer is bundled from npm because Experience Cloud sends `script-src 'self'` and `CspTrustedSite` has no script-src field. A bundled copy needs `location: { staticBaseURI }`, set by subclassing because `withRouter` also injects `location`. `PREVIEW_LIBRARY_VERSION` selects only the stylesheet and is pinned to 3.83.0, the newest the CDN serves. Content Explorer never emitted a file activation here; the workspace owns the row click.

### 6.3 Borrower-portal permissions

Each gap fails without saying "permission": missing FLS on any selected field reads as "no loans"; missing `API Enabled` is a bare 403 on Apex REST; missing read on `UserExternalCredential` or the `LOS_Box-LOS_Box_Principal` principal is a `CalloutException`; a missing sharing set is zero rows. Diff against `LOS_Box_Preview_Guest`, the set proven end to end.

- `LOS_Loan__Share` shows zero rows for a community user; use `UserRecordAccess`. Most permission metadata caps `description` at 255 characters.
- Never grant `viewAllRecords` to `LOS_Borrower_Portal`; a community user with it can query every loan through REST.
- `LOS_Borrower_Portal` must grant `LosBoxFolderService`, or every new loan opens on a 404.
- Dana Whitfield needs `CommunitiesSettings.enableOotbProfExtUserOpsEnable` on and the site's `networkMemberGroups` to include her profile; a non-member's login looks like bad credentials. Login As is unavailable for her licence. The login page is `/loansvforcesite/login?startURL=%2Floans%2F`, not under `/loans/`.

### 6.4 Guests and FLS

Apex enforces FLS in SOQL for guests and not for authenticated users. A field a guest cannot read is a `QueryException` (`No such column`), a 500 naming no field. The mirror: a field in the projection reaches an authenticated browser whatever the permission set says, so `Risk_Rating__c`, `LTV__c`, `DSCR__c` and `Underwriting_Notes__c` are kept out of `LoanSummary`. `LosLoanPackage.LoanLookup` runs `AccessLevel.SYSTEM_MODE` explicitly so a borrower's classify call survives; each caller decides what it returns.

### 6.5 No agent on the borrower portal

A Service Agent (`ExternalCopilot`) runs as its own user and takes the loan from the conversation; the downscoped token bounds the UI, not the agent. Tests assert its absence. ACC offers no way to pass context or identity. An Employee Agent inherits the signed-in user, which is where the internal Copilot runs.

### 6.6 Agent Script and publishing

- A subagent is a top-level block with its own `actions:`; route with `@utils.transition to @subagent.<name>`. `subagents:` is not a field on `start_agent`.
- `with x = ...` lets the model fill an argument; binding an unset variable sends an empty string and a platform 500 (`REQUIRED_FIELD_MISSING`).
- Declare every action output in `outputs:` before binding it; the retrieved `agentGraph` proves nothing.
- Enforce ordering with guards (`available when @variables.x == True`), not prose.
- Nothing is live until `sf agent publish authoring-bundle` then `sf agent activate --version <n>`. Publish outputs in `bots/` and `genAiPlannerBundles/` are gitignored.
- An action missing from a trace is a permissions problem, not a prompting one; `LOS_Loan_Agent` must be assigned to the agent user. A `TraceFlag` on that user names it.

### 6.7 Doc Gen and Sign

- Doc Gen needs `box-version: 2025.0`; Box AI rejects that header (`invalid_api_version`); Sign wants 2024.0 or none.
- Doc Gen is asynchronous: 202 is accepted, not written. The letter lands as `commitment-letter-<Loan_ID__c>.pdf` seconds later. The template id lives in `Commitment_Letter_Template_ID__c`.
- Sign prepares (`prepare_url`) and never sends; it refuses unless Approved or Commitment. A Salesforce record of the request would need `box.BoxSignService.sendSignRequests` and a `box__BoxSign__c` lookup to `LOS_Loan__c`.
- `@InvocableVariable` attributes are space-separated. `documentIdsFor` returns nothing in tests, so bounded callers test only their refusal path. `pushFileToBox` appends the extension. `GET /2.0/files/<id>/content` answers 302 to `dl.boxcloud.com`, which a named credential will not follow.

### 6.8 Hosted MCP

`McpServerDefinition` is undocumented: an Apex tool is `aa:apex-<ClassName>` with `apiSource API_CATALOG` and `operation` set to the class name; the developer name is alphanumeric only; only `global @InvocableMethod` methods are exposed; activation is a `McpServerAccess` Tooling record (`DeveloperName`, `MasterLabel`, `Active = true`, `McpServerId` = the definition Id) and the client URL is `https://api.salesforce.com/platform/mcp/v1/custom/<DeveloperName>` (`v1/sandbox/custom/` for sandboxes); API v66.0+, source-deploy only. Never retrieve `ExtlClntAppGlobalOauthSettings`; it returns the consumer secret.

### 6.9 Salesforce platform edges

- No callout after DML. `LosCreateApplication` returns `boxFolderId = null`; the browser then calls `POST /los/box-folder`. Folding them fails at runtime with `uncommitted work pending`. Retry the folder call, never the form.
- Writes from the bundle need the Platform SDK: `createDataSDK().fetch` obtains the CSRF token; plain `fetch` POSTs get an empty 401. `apexRest.ts` routes writes through it.
- Apex REST discards some upstream bodies; catch and return your own 500. `when` and `list` are reserved. Permission set XML is grouped by element type. XML comments cannot contain `--`. "sObject type X is not supported" is a visibility problem. Multi-Framework is per org (MT-041).

### 6.10 The portal's entry flow and look

Landing is decided by loan count: none opens Start an application, some open Your loans; a guest gets the sign-in prompt, never an error card. The form submits, provisions, then opens the workspace with `loanId`, `recordId`, `folderId`. Uploads classify after the dialog closes; the checklist ticks on `metadata.enterprise.losDocument.documentType`, unclassified files remain unavailable until classified; Internal files are omitted by the server and cannot receive a borrower preview grant. The design is Acme Bank, not the CLM portal: left rail, serif headings, Lato body, evergreen and amber tokens on `:root` in `styles.css`; `styles.test.ts` asserts on the tokens and on never sharing a class name with box-ui-elements (its unscoped `.modal-backdrop` carries `z-index: -1`).

### 6.11 Dependency pins

`legacy-peer-deps=true` in `.npmrc`; `react-router` pinned `^5.3.4` as a top-level dependency; `o11y` and `o11y_schema` declared explicitly for `@salesforce/platform-sdk`; box-ui-elements declares 68 peers, so check its list before calling a dependency unused.

### 6.12 Other harnesses

Claude Desktop is the rehearsed path. ChatGPT needs the same External Client App with its callback URL and the `mcp` and `api` scopes. Slack needs the workspace connected to the org with the LOS MCP server enabled. Neither is tested here. "Claudeforce" is a Sales Cloud pilot connector nobody outside the pilot can open; the Box MCP server package for Agentforce is not GA.

## 7. What is still open

1. Live proof is per environment. Every integration is a portable specification or deterministic fixture until a confirmed enterprise and org prove it and `validation-receipts.json` says so.
2. MT-072: thirteen screens captured under `output/screenshots/`, indexed by `config/demo/screenshot-manifest.bcl`. Box App and Automate have no screen because they were never built.
3. MT-045: guest sharing. A guest sharing rule would expose loans to anyone who can open the site; a deliberate decision, not a bug.
4. MT-040: per-user Box OAuth, scaffolded by the committed `LOS_Box` auth provider.
5. `LosBoxAuth` has no test coverage; blocks production deploy or packaging.
6. The generate/sign tail of the Automate workflow (`automate-workflows.bcl` orders 8 to 10) is spec-only.
7. MT-057 is closed: a confirmed write of amount, rate and term ran on 2026-09-08. The extracted LTV and DSCR were not applied because the extract returns the policy thresholds the markup quotes, not the borrower's numbers; a demo that applies them erases beat 3's mismatch.
8. `default_agent_user` must be bound per org before publish.
9. Any org mutation is the user's call to fire, with a confirmed target.
10. MT-058 has run once; each rehearsal creates a real record and folder, removed only under MT-074.

## 8. Verify

```bash
npm ci --prefix los-salesforce-project/force-app/main/default/uiBundles/losreactapp
python3 scripts/validate_los.py
python3 -m unittest discover -s tests -p 'test_*.py'
```

Python 3.11+. If validation is red, suspect a BCL file that does not parse, a stale set rule in `validate_los.py` (`DETERMINISTIC_DATA_FIXTURES`, the PDF/docx sets, the screenshot manifest), a runtime JSON drifted from its `.example`, or a Markdown link that does not resolve. On a fresh clone, `.gitattributes` normalises to LF, so a generator writing CRLF reads as fixture drift; writers pin LF (`write_csv` in `generate_sample_loan_assets.py`).
