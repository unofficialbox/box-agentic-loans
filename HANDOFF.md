# LOS Demo — Agent Handoff

Snapshot of `box-claudeforce-loans` for an agent picking up this repo cold. Written 2026-09-02, the day the loans port was cut. Verify anything time-sensitive against current `git log` / `validate_los.py` before relying on it.

## 1. What this repo is

A commercial **loan origination** (LOS) demo built on **Box + Salesforce**, ported from the mature Box + Salesforce contract lifecycle (CLM) demo in the sibling `box-bedrock-for-clm` repository. It ships deterministic local fixtures, portable configuration, and self-contained presenter HTML. Nothing here requires a live org to validate — "repository mode" is meant to be fully green offline; live presenter-readiness is a separate opt-in gate.

**One scenario:** **Box + Salesforce Loan Origination**. Primary surface is the Salesforce Multi-Framework React app (the borrower portal); governed Apex actions are the only path between Box and Salesforce, and humans keep credit authority. The borrower portal is the main entry point: a borrower signs in, starts an application (`LosCreateApplication`), and uploads the documents `config/los/required-documents.bcl` asks for, each classified by Box AI (`LosClassifyDocument`) against `losDocument`. The metadata-triggered Automate workflow is the alternate path — email or Box intake still reaches the record — so `config/box/*.bcl`, the 04 entry-point module, and the `LOS_Box_Automate_Integration` permission set are all retained.

**The story** (see `DEMO-STORYBOARD.html`): Alex Bennett, Commercial Loan Officer at Crestline Bank, works the Harborview Logistics distribution-facility loan (`LN-2026-0042`, $4.8M, in Underwriting). The borrower's marked-up term sheet weakens the DSCR test in Section 9.3 and inflates the collateral pool in Schedule A; the appraisal came in at $5.65M, so LTV is 85% and DSCR 1.12x — outside even the approved policy exceptions. Harborview accepted 70% / 1.30x on both loans it already closed (`LN-2023-0311`, `LN-2025-0148`). A commitment letter is generated; signature is refused because the loan is not Approved; the borrower portal shows Dana Whitfield only Harborview's loans with Internal documents withheld.

**Governance invariant:** Box is authoritative for loan-file *content*; Salesforce `LOS_Loan__c` is authoritative for structured *credit truth*; the Opportunity is the Box-mapped object. Loan-file bytes never flow to Salesforce. Human gates precede any generation, signature, or Salesforce write.

## 2. Working rules (from project CLAUDE.md — read before acting)

- Work from the Git root; use repository-relative paths in durable files.
- Read `README.md` + **exactly one** persona instruction before exploring: `.claude/personas/{maintainer,operator,use-case-creator}.md`. Don't load the whole doc tree.
- Search with `rg`, open only linked evidence, summarize large outputs.
- **External deploy / publish / share / sign / delete / any live-org mutation requires explicit approval and a confirmed target.** Keep secrets, environment IDs, live record IDs, and machine-specific paths out of committed files.
- Box Sign / signature sends are human-gated — never fired by an agent. The one governed write (`LosApplyLoanTerms`) requires an explicit `confirmed = true` from a person who has reviewed the extracted values.

## 3. Current state

- **Ported, then deployed once.** Every mechanical identifier was renamed (CLM → LOS, `CLM_Contract__c` → `LOS_Loan__c`, `Clm*` → `Los*`, `/clm/` → `/los/`, `/clm` → `/loans`) and the prose, fixtures, field semantics and storyboard were rewritten for loans. On 2026-09-03 the repository was deployed to one Salesforce org and one Box enterprise (the same ones as the CLM demo, reusing its CCG app) and smoke-tested: token endpoint, loan package, Box AI ask and extract, refused unconfirmed write-back, signature guard on an Underwriting loan, bounded portfolio search, Doc Gen template registration, credit policy Hub. The Box App, Form, Automate intake and the borrower-portal login remain untested browser surfaces. IDs from that run live only in the gitignored `config/runtime/*.json`.
- Validation expectation: `python3 scripts/validate_los.py` should report every repository-mode check passed with one skip (live receipts). Which checks run offline: secrets and runtime-ID scan, JSON/BCL parse, Markdown links, Mermaid/SVG drift, Python unit tests, React lint/test/build/Playwright, deterministic fixture drift, presenter HTML rebuild, screenshot manifest (allowed to be empty here — MT-072), reset and idempotency rules, and the SOQL-projection-versus-permission-set check. Four checks shell out to the UI bundle, so `npm ci` in `los-salesforce-project/force-app/main/default/uiBundles/losreactapp` has to run first.
- Two Apex actions are **new in this port** and have no CLM ancestor: `LosExtractLoanTerms` (Box AI structured extract of `loanAmount, interestRate, termMonths, collateralValue, ltv, dscr, maturityDate` from one file of the named loan, compared to the record, read-only) and `LosApplyLoanTerms` (writes human-accepted values to an allow-list of `LOS_Loan__c` fields; refuses without `confirmed = true` and refuses on Closed/Servicing loans). Together they are the storyboard's Extract and write-back. Both ran live on 2026-09-03: Extract returned five values from the term-sheet markup and flagged the LTV and DSCR mismatches against the record; Apply with `confirmed = false` wrote nothing.
- Two more Apex actions arrived with the borrower intake (2026-09-04) and have not run live: `LosCreateApplication` (`POST /los/applications`; creates one `LOS_Loan__c` in Application status for the signed-in borrower's own Account, `Record_Source__c = Borrower Portal`, `Purpose__c` from the form, `Loan_ID__c` numbered after the last one that year; user-mode DML) and `LosClassifyDocument` (`POST /los/classify?recordId=&fileId=`, also invocable; Box AI `extract_structured` against `losDocument`, writes `documentType` and `versionStatus = Draft` to the file, or writes nothing and says the document awaits the loan officer's classification). `LOS_Loan__c` gained `Purpose__c` and the `Borrower Portal` record source. MT-058 is the smoke test.
- The Loan Copilot (`LOS_Loan_Copilot`) is an internal surface only. No version has been published from this repo.

The CLM repo got live Box working through two waves of stacked failures, each masking the next; every constraint they discovered that still governs the code is in §6. The one habit worth carrying forward is why they were so slow to find — the workspace used to answer *any* Box failure with synthetic fixtures, so a CORS rejection, a dead endpoint and a crashed component all rendered the same plausible screen. That fallback is gone; every failure names itself on the page.

## 4. Config model (important — two formats on purpose)

- **Authored specs = BCL** (`config/**/*.bcl`): HCL2-subset envelope `locals { "bcl" = { resources = [{ "config" = {...} }] } }`. The real payload is `resources[0].config`. Parsed by external Go tooling; also by this repo's `scripts/bcl.py`.
- **Runtime files = JSON** (`config/runtime/*.json`, gitignored): written back by `setup_los_dev.py` and round-tripped by tooling. Deliberately NOT BCL (no external tool imports them; a BCL emitter would be lossy).
- `scripts/bcl.py` is a **dependency-free** recursive-descent reader (`load_bcl`, `parse_bcl`, `load_artifact`, `BCLError`). `demo_operator.py` dispatches via `load_config()` (`.bcl` → `bcl.load_bcl`, else JSON). Consumers: `demo_operator.py`, `validate_los.py`.
- Generated per-operator specs land in `config/runtime/generated/` as resolved `.json` (with parallel `.bcl` for the Go side).
- `config/runtime/*.example.json` are the committed templates; the real `demo-environment.json`, `bootstrap-state.json`, `validation-receipts.json`, and `generated/` are gitignored.

## 5. Key paths

| Path | Purpose |
|---|---|
| `scripts/demo_operator.py` | Operator automation: bootstrap, provision, seed, resolve-config, validate, teardown. `FOLDER_BINDINGS` / `FILE_BINDINGS` name the Harborview workspace folders and files; 16 metadata seeds |
| `scripts/validate_los.py` | The offline validation matrix (secrets, JSON/BCL, links, drift, tests, fixtures, presenters, manifests, idempotency, SOQL/FLS agreement) |
| `scripts/bcl.py` | Dependency-free BCL reader |
| `scripts/setup_los_dev.py` | One-command dev setup; writes runtime JSON |
| `scripts/generate_sample_loan_assets.py` | reportlab PDFs: the Harborview application package, the borrower-marked-up term sheet, the two executed loan agreements, the Pinecrest application, plus `harborview-los-records.json` and `credit-policy-playbook.json` |
| `scripts/generate_docgen_templates.py` | python-docx Doc Gen templates (credit memo, commitment letter, closing summary, maturity notice) and the 2026 term-sheet markup in Word |
| `config/box/automate-workflows.bcl` | Intake workflow (`LOS - Loan Application Intake Enrichment`) incl. the credit-memo and executed-covenants tails |
| `config/box/metadata-templates.bcl` | `losLoan`, `losDocument`, `losCovenant`, `losPolicy`, `losUnderwritingReview` |
| `config/los/expert-routing.bcl` | Underwriting domains and named owners (Credit Risk, Collateral, Compliance, Loan Documentation, Pricing, Insurance, Servicing) |
| `config/los/required-documents.bcl` | The borrower checklist per `Loan_Type__c` (`documentType`, `label`, `why`); `src/lib/requiredDocuments.ts` mirrors it and `tests/test_required_documents.py` fails when they drift |
| `sample-data/policies/` | The credit policy library: `LOS-LTV-*`, `LOS-DSCR-*`, `LOS-RATE-*`, `LOS-GUAR-*` |
| `los-salesforce-project/.forceignore` | Keeps `node_modules` out of the UI bundle deploy — do not delete |
| `.../classes/LosBoxTokenService.cls` | Downscoped Box token endpoint (`/services/apexrest/los/box-token`); reads the `LOS_Box` external credential |
| `.../classes/LosLoanPackage.cls`, `LosBoxAskDocument.cls`, `LosPortfolioSearch.cls` | Resolve a loan and its Box documents; ask Box AI about one file or the credit policy Hub; metadata search by `policyRisk` bounded by `Loans_Root_Folder_Id__c` |
| `.../classes/LosExtractLoanTerms.cls`, `LosApplyLoanTerms.cls` | **New.** The storyboard's Extract (read-only, with validation against the record) and the human-confirmed write-back — the only governed write in the demo |
| `.../classes/LosGenerateCommitmentLetter.cls`, `LosSendForSignature.cls` | Doc Gen commitment letter into the loan's folder; Box Sign preparation gated on `SIGNABLE = {'Approved','Commitment'}` |
| `.../classes/LosLoanListService.cls`, `LosBorrowerLoans.cls` | `/los/loans` projection for the borrower portal (`LoanSummary`); "Get my loans" for the signed-in borrower via Contact → Account |
| `.../classes/LosCreateApplication.cls`, `LosClassifyDocument.cls` | **New.** The borrower's own intake: create the application record (then the browser provisions the folder, §6.10), and classify each upload with Box AI against `losDocument` |
| `.../externalCredentials/LOS_Box.externalCredential-meta.xml` | Where the Box client id/secret live (encrypted in the org, never in source) |
| `.../objects/LOS_Box_Config__c/` | `Box_User_Id__c` / `Enterprise_Id__c`, `Allowed_Folder_Ids__c`, `Credit_Policy_Hub_Id__c`, `Loans_Root_Folder_Id__c`, `Commitment_Letter_Template_ID__c` |
| `.../permissionsets/` | `LOS_Demo_Operator`, `LOS_Box_Preview_Guest` (MT-042), `LOS_Borrower_Portal`, `LOS_Loan_Agent`, `LOS_MCP_Client`, `LOS_Box_Automate_Integration` |
| `.../sharingSets/LOS_Borrower_Access.sharingSet-meta.xml` | Maps `LOS_Loan__c.Borrower_Account__c` to the community user's Account — the borrower portal's record boundary |
| `.../mcpServerDefinitions/LOSLoanTools.mcpServerDefinition-meta.xml` | Hosted MCP server: `listLoans, findDocumentsByRisk, getLoanPackage, askLoanDocument, extractLoanTerms, applyLoanTerms, generateCommitmentLetter, prepareSignatureRequest` |
| `.../aiAuthoringBundles/LOS_Loan_Copilot/` | Agent Script for the internal Loan Copilot (`get_loan_package`, `ask_box_ai`, `extract_loan_terms`); `default_agent_user` is bound per org |
| `los-salesforce-project/scripts/configure-los-box-*.sh` | Set the Box credential (MT-038) and CCG subject + folder allowlist (MT-039) |
| `.../losreactapp/src/components/BoxWorkspace.tsx` | Token, then folder listing; either failure renders `DataError` with the reason, and no fixture stands in |
| `.../losreactapp/src/components/BoxElements.tsx` | Folder table + lazy Content Preview; needs `react-intl` and `MemoryRouter` providers |
| `.../losreactapp/src/components/LoanList.tsx`, `PortfolioCharts.tsx` | The borrower's loans (Loan, Borrowing entity, Amount, Matures, Status); loans by status and maturities in 90 days |
| `.../losreactapp/src/components/ApplicationForm.tsx`, `RequiredDocuments.tsx` | The application form (`?view=apply`) and the checklist card shown on Application and Underwriting loans; `src/lib/applications.ts`, `classify.ts`, `requiredDocuments.ts` behind them |
| `.../losreactapp/src/lib/box.ts` | `WITHHELD_VERSION_STATUS = "Internal"` — internal underwriting documents never reach the borrower; default `loanId` `LN-2026-0042` |
| `.../cspTrustedSites/LOS_Box_App.cspTrustedSite-meta.xml` | frame-src grant for `*.app.box.com`, without which the preview frame is blank (MT-043) |
| `.../losreactapp/vite.live-box.ts` | Dev-only plugin serving a real downscoped token locally (`npm run preview:live`; env `LOS_BOX_FOLDER_ID`, `LOS_ORG_ALIAS`) |
| `.../losreactapp/src/lib/loaded.ts` | `Loaded<T>` — every remote read returns a value or the reason there is none |
| `.../losreactapp/src/styles.test.ts` | Guards against sharing a CSS class name with box-ui-elements |
| `.../losreactapp/.npmrc` | `legacy-peer-deps=true`, without which `npm ci` cannot reproduce the lockfile — do not delete |
| `los-salesforce-project/sample-data/los-sample-records.bcl` | Sample Salesforce records (the three Harborview loans and the Pinecrest application) |
| `los-salesforce-project/scripts/seed-los-*.apex` / `.sh` | Anonymous-apex seeders (records; per-loan Box file uploads from the `Los_Sample_*` static resources) |
| `docs/operator/box-preview-setup.md` | Box app, credential, CORS, folder-id gotcha, error→cause table |
| `docs/maintainers/README.md` | The local live-Box harness: `preview:live` vs `dev:live`, and why |
| `docs/operator/manual-task-register.md` | MT register; MT-036–MT-048 are the live-Box and site tasks; MT-058 is the borrower intake smoke test |
| `tests/` | `test_bcl.py`, `test_required_documents.py` (BCL ↔ React checklist), `test_demo_operator.py`, `test_validate_los.py`, presenter/branding/navigation checks |
| `docs/conventions.md` | Readiness vocabulary (4 states) + safety rules |

## 6. Constraints that will bite you

Compressed from the debugging that found them in the CLM predecessor, and from the paved-path brief at the repo root. Each is a property of Box, Salesforce or box-ui-elements that the code has already paid for once. The loans port has not re-run any of them live; assume every one still applies.

### 6.1 A Box folder needs a *direct* collaboration before it can be downscoped

Inherited access is not enough, and the failure is disguised: `GET /2.0/folders/<id>`
returns 200 with `can_upload = true`, and the token exchange still returns
`{"error":"invalid_resource"}`. You will look at scopes, at the enterprise, at caching —
all fine. The tell is `GET /2.0/folders/<id>/collaborations`: a folder that downscopes
lists `LOS_Box_Config__c.Box_User_Id__c` **directly**.

It is wider than the downscope. The Box for Salesforce Toolkit and the LOS Box app
authenticate as different Box identities, and only the Toolkit's owns what the Toolkit
creates — folders made by calling `box.Toolkit.createFolderForRecordId` directly returned
404 `not_found` to the app *and* to an admin's own Box session.

`LosBoxFolderService.grantWorkspaceAccess` makes the `POST /2.0/collaborations` call
immediately after creating the folder and deliberately **before** `commitChanges()` — the
Toolkit has only staged the association at that point, so a callout is still legal, and
would not be after the DML. A 409 counts as success. **Provision through
`LosBoxFolderService`, or grant the collaboration yourself.**

Two neighbours of the same trap: `createObjectFolderForRecordId` returns the folder for the
*object* — the shared parent every loan sits under — so mapping a record to it makes every
read for that loan return the whole tree. And a folder the Toolkit just created may refuse
writes from the CCG token (`404 not_found` naming `new_parent_folder` on a move or copy)
even though `GET` reports `can_upload: true`; write through the package's `box__MoveFile`
invocable instead.

### 6.2 Content Preview: four things must be true at once

Any one missing gives a blank frame or the "Sad Box Cloud", and none of them names itself:

- **`box-annotations` installed and passed as `boxAnnotations`.** ContentPreview expects an
  instance and does not construct one. Pinned `5.2.1-beta.18`; `5.3.0` fails the build.
- **A react-router `Router` above it.** The annotations layer is wrapped in `withRouter`.
  box-ui-elements supplies a router only when a sidebar is mounted, which this view is not,
  so `BoxElements` wraps the preview in its own `MemoryRouter`. This invariant, not CSP,
  was the real cause of the CLM repo's long preview outage.
- **The token passed as a function, not a string.** Preview 3.x asserts
  `typeof annotatorToken === "function"` and the throw aborts the viewer *silently* — empty
  frame, nothing in `onError`.
- **`item_preview` scope**, plus the `LOS_Box_App` (frame-src `*.app.box.com`) and
  `LOS_Box_Content_Delivery` (connect-src `*.boxcloud.com`) trusted sites. Preview fetches
  bytes from a per-request `dl.boxcloud.com` host; only `public.boxcloud.com` is allowed by
  default.

**The renderer is bundled from npm, not fetched from the Box CDN**, because Experience
Cloud sends `script-src 'self'` and `CspTrustedSite` has **no script-src field at all** —
confirmed against both REST and Tooling describes. There is no security-level switch to
flip: an app-container React site cannot be opened in Experience Builder, which is where
that setting lives. `src/lib/boxPreviewRuntime.ts` owns the seam; read its comments before
touching it. A bundled copy needs `location: { staticBaseURI }` or it requests
`undefinedexif/exif.min.js` — and `location` is also the prop `withRouter` injects, so it is
set by subclassing rather than passed as a prop. `PREVIEW_LIBRARY_VERSION` selects only the
**stylesheet** and is pinned to 3.83.0 because that is the newest release the CDN actually
serves (3.84/3.85 404 there even though npm ships them — probe before bumping).

Content Explorer was dropped: it never emitted a file activation in this embedding, so the
workspace lists the folder itself and owns the row click.

### 6.3 Every borrower-portal permission gap fails without saying "permission"

Four grants are needed to get a borrower to a Box document, and each fails differently.
None of the failures names the missing thing:

| Missing | What you see |
|---|---|
| Field-level security on **any** selected field | UI API rejects the whole query — the list reads as "this borrower has no loans" |
| `API Enabled` | Apex REST refuses with a bare 403, while GraphQL keeps working through the site's own bridge |
| Read on `UserExternalCredential` + the `LOS_Box-LOS_Box_Principal` external credential | The endpoint runs and throws `System.CalloutException` |
| A **sharing set** (`LOS_Borrower_Access`) | Zero rows, with no error |

When a borrower surface half-works, diff its permission set against
`LOS_Box_Preview_Guest`, which is the one the CLM predecessor proved reaches Box end to end.

Two verification traps: `LOS_Loan__Share` shows **zero rows** for a community user —
sharing sets compute access rather than materialise shares, so an empty share table is a
false negative; use `UserRecordAccess`. And most of this metadata caps `description` at
**255 characters**.

`Borrower_Account__c` is the anchor, not the `Borrower__c` text, which can hold both
"Harborview Logistics" and "Harborview Logistics Holdings LLC" for one borrower. Do not
grant `viewAllRecords` to `LOS_Borrower_Portal`: a community user with View All can query
every loan straight through the REST API with their own session, which is the hole the
scoped class exists to close.

**Signing in as the borrower.** Dana Whitfield
(`dana.whitfield@harborviewlogistics.example`, Customer Community User on Harborview
Logistics) is the seeded portal user. Two org gates had to open first in the CLM org and
neither announces itself: `CommunitiesSettings.enableOotbProfExtUserOpsEnable` was off, so
creating a user on a standard external profile failed outright; and the site's
`networkMemberGroups` listed only `admin`, so she could not log in even though the user was
valid and the sharing set already granted her records — **a non-member's login failure
looks like bad credentials**. Confirm membership with a `NetworkMember` query rather than by
trying to log in.

**"Log in as" is not available for her Customer Community licence**, so she needs a real
password (Setup → Users → Reset Password; the mail goes to the address on the user record,
not yours). The login page is **not** under the app path: `/loans/` serves the React app for
every URL beneath it, so `/loans/login` and `/loans/s/login/` both render the workspace and a
signed-out visitor is never redirected. Sign in at
`https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F`.

### 6.4 Guest users enforce field-level security *inside SOQL*

Apex ignores FLS in SOQL for authenticated users but **not for guests**, and it reports a
field the guest cannot read as `No such column '<field>' on entity` — a `QueryException`,
so the whole request 500s naming no field rather than one column coming back blank. Adding
a field to a REST projection therefore breaks the site for signed-out visitors while
working perfectly for an administrator.

`validate_los.py` checks offline that every `LOS_Loan__c` field `LosLoanListService`
selects is readable by both permission sets that serve the site (`LOS_Box_Preview_Guest`,
`LOS_Borrower_Portal`).

The mirror-image trap: because Apex does *not* enforce FLS for authenticated users, a field
in the projection reaches the browser whatever the permission set says. `Risk_Rating__c`,
`LTV__c`, `DSCR__c` and `Underwriting_Notes__c` are the bank's own assessment and are kept
out of the `LoanSummary` **projection**, not merely out of the permission set.

### 6.5 The external agent is scoped by nothing, which is why there isn't one

The workspace runs as the signed-in user, so `LosBorrowerLoans` can resolve their
Contact → Account and filter. An **ACC Service Agent runs as its own user**
(`BotDefinition.Type = ExternalCopilot`, `AgentType = EinsteinServiceAgent`), so identity
is not available to it and `UserInfo.getUserId()` is the bot. Its action bindings take the
loan from the conversation, so a borrower could name another company's loan. The
downscoped token bounds the workspace UI; it does not bound the agent, which reaches
Box through Apex under the app's credentials.

The Copilot is therefore **not on the borrower portal**. Tests assert its absence so the
decision does not drift back. An **Employee Agent** inherits the signed-in user's
permissions and is the surface where "same agent, different access" holds — which is the
storyboard's flow 6.

Related: ACC offers no way to pass context to the agent — checked three ways in the CLM org
(`embedAgentforceClient` has no such option, the mounted element exposes no methods, and
`lightning/accApi` is importable only from an LWC).

### 6.6 Agent Script and publishing

- **`subagents:` is not a field on `start_agent`.** A subagent is a top-level block with
  its own `actions:`; routing is `@utils.transition to @subagent.<name>`.
- **`with x = ...` (a literal `...`) lets the model fill an argument.** Binding to a
  variable instead *overrides* the model, and an unset variable is an empty string — which
  surfaces as a platform `REQUIRED_FIELD_MISSING` and a 500, never reaching the class's own
  error handling. This cost the CLM repo two publish cycles.
- **An action output must be declared in `outputs:` before any binding may reference it.**
  That compile check is the only structural verification available: the retrieved
  `agentGraph` JSON serializes no variable bindings, so grepping it proves nothing.
- **Ordering is enforced with guards, not prose.** Told five times to call one action
  first, the planner ignored it; `available when @variables.x == True` fixed it.
  `ask_box_ai` and `extract_loan_terms` are guarded on the loan package having loaded.
- **Nothing reaches the site until a version is activated.** `sf agent publish
  authoring-bundle` then `sf agent activate --version <n>`. Publish outputs land in
  `bots/` and `genAiPlannerBundles/`, both gitignored.
- **When an action never appears in a trace, suspect permissions before prompting** — an
  unavailable action is invisible, not failed. A `TraceFlag` on the agent user names every
  such failure in one line. `LOS_Loan_Agent` must be assigned to the agent user or the
  Extract and Apply actions are never offered.
- **`default_agent_user` in the agent script is org-specific.** It ships as
  `loan_assistant@your-org-agent-user.ext` and must be bound per org at publish time.

### 6.7 Box metadata is the index, and it must be scoped

`search_files_metadata` over `losDocument` replaces a folder listing plus a per-file AI
read — but metadata search is **enterprise-wide**, and a demo enterprise accumulates
documents from earlier environments with the same file names and different ids.
Unscoped, the query returns files that are not in a governed loan folder at all. Always pass
`ancestor_folder_id`; `LosPortfolioSearch` reads it from `Loans_Root_Folder_Id__c`.

Request metadata inline on a listing as `metadata.enterprise.<templateKey>` — the
shorthand for the caller's own enterprise, so no enterprise id reaches the browser. That is
how the borrower portal's filter works: it matches on `versionStatus = Internal`, not on the
file name, because an internal credit memo named `v5-final.pdf` is still internal. Untagged
files are shown — an unclassified upload is a tagging gap, not a document to hide.

**Enum values are case-sensitive, and people are not.** `policyRisk` defines
`Low|Medium|High|Critical`; `critical` fails with `400 invalid_query: unknown enum option`.
`LosPortfolioSearch` normalises against the template's options and refuses anything else in
words rather than sending it to Box to fail.

**The tagging is still manual.** A metadata cascade policy on the loan folder is what
would make it survive the next loan.

### 6.8 Doc Gen and Sign

`LosGenerateCommitmentLetter` → `/2.0/docgen_batches`; `LosSendForSignature` →
`/2.0/sign_requests`. Both go through `LosBoxAuth`, so an MCP client holds no Box token.
Neither is on the borrower surface.

- **Doc Gen is versioned**: `box-version: 2025.0` required; Sign wants 2024.0 or no header.
- **Doc Gen is asynchronous**: a 202 means accepted, not written. Poll
  `GET /2.0/docgen_batch_jobs/<id>`. The commitment letter lands as
  `commitment-letter-<Loan_ID__c>.pdf` a few seconds after the reply says "submitted".
- **The template id lives in configuration** (`Commitment_Letter_Template_ID__c`). The
  agent may generate the document; it may not choose what the org generates from.
- **Sign prepares and does not send.** `is_document_preparation_needed` returns a
  `prepare_url`; no mail leaves. It also refuses unless `Status__c` is Approved or
  Commitment. If Salesforce should carry a record of the request, go through
  `box.BoxSignService.sendSignRequests` (which writes `box__BoxSign__c`), not the REST
  endpoint — and `box__BoxSign__c` needs a lookup whose `referenceTo` is `LOS_Loan__c`.
  Nothing refreshes Sign status on its own; schedule `box.UpdateSignRecordsSchedulable`.
- **`@InvocableVariable` attributes are space-separated** — `(label='x', required=true)` is
  a parse error with a misleading cascade.
- **`documentIdsFor` returns nothing in a test context** because the Toolkit does, so
  bounded callers (`LosBoxAskDocument`, `LosExtractLoanTerms`) can only be tested on their
  refusal path.
- **`pushFileToBox` appends the extension**, so a `.docx` title becomes `.docx.docx`.
- **`GET /2.0/files/<id>/content` answers 302 to `dl.boxcloud.com`**; a named credential
  scoped to `api.box.com` will not follow it, so download-and-re-upload is unavailable.

### 6.9 Hosted MCP metadata is undocumented

`McpServerDefinition` is **not in the Metadata API Developer Guide**. Shape learned from a
deployed example and two org errors: an Apex tool is `aa:apex-<ClassName>` with `apiSource`
`API_CATALOG` and `operation` set to the **class** name (not `apex://ClassName`, which is
what the *agent* bundle uses for the same classes); the developer name is **alphanumeric
only**; only `global` `@InvocableMethod` methods can be exposed. Activation is not in the
metadata at all — it is a `McpServerAccess` Tooling API record whose `DeveloperName` must
equal the server's. It exists from **API v66.0** and is **source-deploy only** (no
packaging, no change sets). **Never retrieve `ExtlClntAppGlobalOauthSettings`** — it brings
back the consumer secret.

### 6.10 Salesforce platform edges

- **Callouts are forbidden after DML.** Any provision-then-call sequence makes the callout
  first or splits into two requests (`BoxEmailAttachmentUploader` chains a second job).
  The borrower intake is the visible case: `LosCreateApplication` inserts the record and
  returns `boxFolderId = null`; the browser then calls `POST /los/box-folder?recordId=`
  (`LosBoxFolderService`, whose folder creation is a callout) as a second request. Do not
  fold them into one endpoint — it will compile and fail at runtime with
  `CalloutException: You have uncommitted work pending`. If the second request fails, the
  record exists without a folder and the workspace names that; retry the folder call, never
  the form, which would create a second application.
- **Apex REST discards the body of some status codes**, so an upstream 502 reaches the
  caller as `INTERNAL_SERVER_ERROR`; catch upstream failures and return your own 500.
- **Apex reserves `when` and `list`.** `HttpRequest list = ...` fails with `Missing ';'`.
- **Permission set metadata is grouped by element type.** A `fieldPermissions` block after
  `label` is rejected as "duplicated at this location".
- **XML comments cannot contain `--`.**
- **"sObject type X is not supported"** means the running user cannot see a managed-package
  object, not a platform bug.
- **`.forceignore` must exclude `node_modules`** or the first UI Bundle deploy exceeds the
  50 MB Metadata API limit.
- **Salesforce Multi-Framework must be enabled per org** before `UIBundle` exists (MT-041).

### 6.10a What the live intake run taught (2026-09-04)

- **Writes from the bundle need the Platform SDK.** A plain `fetch` through `SFDC_ENV.apiPath`
  reads fine, but the gateway answers every POST, PUT and PATCH with an empty 401 unless the
  request carries the surface's CSRF token, which only `createDataSDK().fetch` obtains (from
  `.../ui-api/session/csrf`, sent as `X-CSRF-Token`, retried once on rejection). `apexFetch`
  in `src/lib/apexRest.ts` routes every write through it and falls back to plain `fetch`
  off-platform. GETs stay on plain `fetch`.
- **No `box-version` header on Box AI.** `/2.0/ai/extract_structured` rejects
  `box-version: 2025.0` with `invalid_api_version`; only Doc Gen wants that header.
  `LosClassifyDocument` sends none, like `LosExtractLoanTerms`.
- **The loan lookup states its access level.** `LosLoanPackage.LoanLookup` runs its dynamic
  SOQL with `AccessLevel.SYSTEM_MODE` explicitly. Defaulted, a borrower's classify call died
  with "No such column 'Risk_Rating__c'" before the folder was resolved, because the borrower
  has no FLS on the bank-only fields. Each caller still decides what it returns; the
  borrower-facing ones return none of those fields.
- **`LOS_Borrower_Portal` grants `LosBoxFolderService`.** Creating an application is one
  request and provisioning its folder is the next, from the browser, so the borrower must be
  allowed to call the provisioning endpoint or every new loan opens on a 404.
- **Borrower uploads are attributed to the CCG subject.** The downscoped token acts as the
  configured Box user, so a document Dana uploads shows "Updated by" that user in Box and in
  the workspace history. Per-user Box OAuth (MT-040) is the fix; until then the storyboard
  should not draw attention to the uploader name.

### 6.11 The borrower portal's entry flow and identity

- **Where a borrower lands is decided by the loan count.** After `LosWhoAmI` resolves,
  a borrower with zero loans opens on **Start an application** (`?view=apply`); one with
  loans opens on **Your loans** (`?view=loans`) with a **Start a new application** button.
  A guest gets the sign-in prompt, whether the list call answered 401 or the Apex class
  gate answered 403 — an error card here is a bug, not a state.
- **The form submits, provisions, then opens the workspace** with `loanId`, `recordId` and
  `folderId` in the URL exactly as `openLoan` does. One inline sentence on failure; the
  page never invents a loan id.
- **Uploads classify themselves, off the UI thread.** After the upload dialog closes the
  page calls `/los/classify` per new file id, bumps `reloadKey`, and shows "Classified as
  Appraisal by Box AI" or the awaiting-classification sentence. The checklist ticks on
  `metadata.enterprise.losDocument.documentType`; untagged files are listed beneath it,
  never ticked and never hidden. `Internal` is still withheld.
- **It is not the CLM portal, and should not look like it.** Left rail (232px, icons under
  980px) with the "CB" monogram, **Crestline Bank**, and the line *Borrower Portal*; a slim
  top bar with the page title and `ProfileMenu`; no top-bar tabs and no "Headless 360".
  Tokens live on `:root` in `styles.css` (`--cb-ink`, `--cb-bg` warm cream, `--cb-green`
  evergreen primary, `--cb-amber` accent, `--cb-line`, `--cb-muted`, and the
  success/warning/danger trio). Serif headings, Lato body (box-ui-elements needs it),
  tabular numbers, 6px card radius with a 1px line and no shadow, pill primary buttons,
  outlined secondary, small-caps status chips; charts in evergreen, amber and sand, not
  blue. `styles.test.ts` asserts on the tokens — update it with them, not around them.

### 6.12 Dependency pins that are load-bearing

- **`.npmrc` sets `legacy-peer-deps=true`.** Without it `npm ci` fails ERESOLVE and four
  validation checks go red. It changes no resolved version.
- **`react-router` must be pinned to `^5.3.4`**, matching `react-router-dom@5`.
  box-ui-elements imports `MemoryRouter`/`Router` from `react-router` directly, so it has to
  be a top-level dependency — two majors in one bundle is a silent context break.
- **`o11y` and `o11y_schema` must be declared explicitly.** `@salesforce/platform-sdk`
  imports `o11y/client` without installing it; the build fails to resolve otherwise.
- **box-ui-elements declares 68 peer dependencies.** Almost every unfamiliar entry in
  `package.json` is one of them. Check the peer list before assuming a dep is unused.
- **Never share a CSS class name with box-ui-elements.** Its stylesheets are unscoped and
  load after ours as lazy chunks, so at equal specificity they win: its `.modal-backdrop`
  carries `z-index: -1` and painted the upload dialog behind the page. `styles.test.ts`
  guards this; every loan class is namespaced (`.loan-banner`, `.loan-table`, …).

## 7. What is still open

1. **Nothing has run live.** Every "Deployed integration" claim from the CLM predecessor is
   downgraded to **Portable specification** or **Local deterministic fixture** here until a
   confirmed Box enterprise and Salesforce org prove it and `validation-receipts.json` says so.
2. **MT-072 — screenshot inventory captured where a screen exists.** Eleven screens from
   the live org and enterprise: the Salesforce record page, Agentforce agents list and Agent
   Builder topology, the signed-in borrower loan list and workspace; the Box loan folder,
   workspace, Doc Gen templates, credit policy Hub, generated commitment letter and the
   term-sheet metadata. Box App and Box Automate have no screen yet and render "Screen
   capture pending".
3. **MT-045 — guest sharing decision.** `LOS_Loan__c` is Private/Private and the
   Experience Cloud guest has no record access. Granting a guest sharing rule would make loan
   records readable by anyone who can open the site: a deliberate exposure, not a bug to fix.
4. **MT-040 — per-user Box OAuth** (optional production hardening). The `LOS_Box` auth
   provider is committed with placeholder credentials so the path is scaffolded.
5. **`LosBoxAuth` has no test coverage.** Fine in a dev org; blocks any production
   deploy or packaging.
6. **The generate/sign tail of the Automate workflow is spec-only.**
   `config/box/automate-workflows.bcl` orders 8–10 are designed, not built.
7. **The Extract write-back has run live only in refusal mode.** `LosExtractLoanTerms`
   extracted and validated against LN-2026-0042 in a real org; `LosApplyLoanTerms` was
   exercised with `confirmed = false` and wrote nothing. A confirmed write (MT-057) is still
   the demo owner's call.
8. **`default_agent_user` in `LOS_Loan_Copilot` must be bound per org** before publish.
9. **No live-org state in commits.** Any org mutation needs explicit approval and a
   confirmed target, and is the user's call to fire.
10. **MT-058 — the borrower intake has not run live.** `LosCreateApplication` and
    `LosClassifyDocument` have unit tests with mocked callouts only. The first live run
    creates a real record and folder; remove them only under MT-074.

## 8. How to verify you're in a good state

```bash
npm ci --prefix los-salesforce-project/force-app/main/default/uiBundles/losreactapp
python3 scripts/validate_los.py            # expect every check passed, 1 skipped (live receipts)
python3 -m unittest discover -s tests -p 'test_*.py'
```

Requires Python 3.11+ (`validate_los.py` imports `datetime.UTC`). The `npm ci` is not optional
on a fresh clone: four checks are React lint/test/build/Playwright, and they fail closed
without `node_modules`.

If validation is red, the first suspects are: a BCL file that doesn't parse (`scripts/bcl.py`), a stale set-comparison rule in `validate_los.py` (`EXPECTED_SCENARIOS`, `EXPECTED_PRESENTERS`, `DETERMINISTIC_DATA_FIXTURES`, PDF/docx manifests), a runtime JSON drifted from its `.example`, or a new Markdown file with a relative link that doesn't resolve — `check_local_links` walks every non-excluded `.md` in the tree, tracked or not.

One failure mode is worth naming because it only appears on a **fresh** clone or worktree: `.gitattributes` normalizes text to LF, so anything a generator writes with CRLF reads back as `Deterministic fixture drift` even though the content is identical. A checkout that predates the generator keeps its CRLF copy on disk and passes, which is why this can be green locally and red everywhere else. Writers must pin LF explicitly — see `write_csv` in `scripts/generate_sample_loan_assets.py`.
