# LOS Demo Manual-Task Register

This register lists only work that cannot be completed safely by `scripts/demo_operator.py`. Complete it for each new environment; rows note when a task was last done.

Status values: **Required**, **Per run**, **Optional**, and **Confirmation required**.

## Environment and access

| ID | Task | Owner | Status | Complete when |
|---|---|---|---|---|
| MT-001 | Confirm the target Box enterprise and Salesforce org | Demo owner | Required | Hostname, org alias, and safe test scope are recorded locally |
| MT-002 | Confirm required Box and Salesforce licenses/features | Administrators | Required | Every selected product surface opens for its operator |
| MT-003 | Name workflow, credit, compliance, security, finance, publishing, and signing owners | Demo owner | Required | Owners and escalation path are recorded |
| MT-004 | Store credentials outside source control | Administrators | Required | Secrets exist only in managed connections or protected secret stores |

## Box browser work

| ID | Task | Owner | Status | Complete when |
|---|---|---|---|---|
| MT-010 | Review deterministic metadata applied by `seed-metadata` | Content owner | Required | Values are appropriate for the portfolio search and the Copilot's answers |
| MT-011 | Mark the four Word files as Doc Gen templates and record the commitment-letter template id in `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` | Doc Gen admin | Required | Templates appear in the Doc Gen catalog; `LosGenerateCommitmentLetter` refuses until the id is set |
| MT-012 | Verify the `losLoan` metadata template and the `01 - Application Intake` folder exist | Content owner | Required | Both are present in the workspace; the Automate intake that would trigger on them is the alternate path and stays specification-only |
| MT-014 | Build **Crestline Credit Policy Library** and record its Hub id in `LOS_Box_Config__c.Credit_Policy_Hub_Id__c` | Hub owner | Required | Standard positions, approved exceptions, ownership, and review cadence are visible; the Copilot's policy check reads this Hub and no other |
| MT-016 | Publish or republish the Hub | Hub owner | Confirmation required | Owner approves immediately before the consequential action |
| MT-018 | Generate a Doc Gen output | Authorized reviewer | Confirmation required | One intended file is created after approval |
| MT-019 | Send a Box Sign request | Signatory coordinator | Confirmation required | The loan is Approved or Commitment and send is separately approved |
| MT-020 | Share externally or change collaborators | Content owner | Confirmation required | Exact users, items, and access are approved |
| MT-021 | Record the loans root folder id in `LOS_Box_Config__c.Loans_Root_Folder_Id__c` | Box + Salesforce admins | Required for portfolio search | `LosPortfolioSearch` scopes every metadata query by this `ancestor_folder_id`; without it the query is enterprise-wide |

## Salesforce and Agentforce

| ID | Task | Owner | Status | Complete when |
|---|---|---|---|---|
| MT-030 | Authenticate Salesforce CLI and review the target org | Salesforce operator | Required | `sf org display` matches the intended org |
| MT-031 | Create a dedicated API-only integration user | Salesforce admin | Required | User has `LOS_Box_Automate_Integration` and no broad business access |
| MT-032 | Create/configure the environment-specific External Client App | Salesforce admin | Required | Client credentials, `api` scope, Run As user, and admin preauthorization are set |
| MT-033 | Configure the Box-managed OAuth connection | Box/Salesforce admins | Required | Token test succeeds without exposing the token |
| MT-034 | Add the UI Bundle to a Lightning or Experience page (requires MT-041) | Salesforce admin | Required for Box + Salesforce Loan Origination | Intended users can open it with record and Box context |
| MT-035 | Configure Loan Copilot topics, actions, and guardrails; bind `default_agent_user`; assign `LOS_Loan_Agent` to the agent user | Agentforce admin | Required for live Agentforce | Cited reads work; `extract_loan_terms` is offered; writes require confirmation |
| MT-036 | Configure the Salesforce origin in the Box application | Box app admin | Required for live embedded Box | Only approved origins can load content |
| MT-037 | Create and authorize the Box platform app **in the same enterprise the Box for Salesforce package writes to** | Box admin | Required for live Box preview | A Client Credentials Grant app is authorized in that enterprise's Admin Console. An app authorized elsewhere fails with `invalid_grant: App is not yet authorized for use`, and one authorized in a *different* enterprise from the package mints tokens fine but cannot see the folders the package creates -- the downscope then fails with `invalid_resource` |
| MT-038 | Set the Box client id and secret with `configure-los-box-credential.sh` | Salesforce admin | Required for live Box preview | `ClientId` and `ClientSecret` are set on `LOS_Box_Principal`; values stay encrypted in the org and never reach source |
| MT-039 | Set the Box CCG subject and folder allowlist with `configure-los-box-settings.sh` | Salesforce admin | Required for live Box preview | `LOS_Box_Config__c` has `Box_User_Id__c` (or `Enterprise_Id__c`), and `Allowed_Folder_Ids__c` restricts the endpoint to the demo workspace |
| MT-040 | Switch to per-user Box OAuth for production | Box/Salesforce admins | Optional; production hardening | The `LOS_Box` auth provider holds real consumer credentials, the Box app carries its callback URL, and the external credential uses a per-user principal |
| MT-041 | Enable Salesforce Multi-Framework in the target org | Salesforce admin | Required before any UI Bundle deploy | **Setup → React Development with Salesforce Multi-Framework** is on, and `UIBundle` appears in the org's metadata types |
| MT-042 | Grant the Experience Cloud site user access to the token endpoint | Salesforce admin | Required for live Box preview from a site | `LOS_Box_Preview_Guest` is assigned to the site's guest user (or community profile), including read on `UserExternalCredential` |
| MT-043 | Deploy the `LOS_Box_App` trusted site so previews can frame | Salesforce admin | Required for in-app document preview | **Setup → Trusted URLs** lists `https://*.app.box.com` with frame-src active; selecting a file in the workspace renders the document instead of an empty frame |
| MT-044 | Confirm the Box for Salesforce package can provision loan folders | Box + Salesforce admins | Required for live Box content | The workspace asks the package for a record's folder and provisions one when it has none, so no seeding is needed. Confirm the object root folder and the service account's rights allow `createFolderForRecordId` to succeed; a failure surfaces as `box_folder_not_provisioned` |
| MT-045 | Decide whether site visitors may read loan records, and create a guest user sharing rule if so | Demo owner + Salesforce admin | Required for a signed-out loan list | `LOS_Loan__c` is Private/Private, so the guest user sees no records and the portal reports an empty list. A guest user sharing rule makes real loans readable by **unauthenticated** visitors — approve that exposure before creating it |
| MT-046 | Publish Loan Copilot and record its agent id | Salesforce admin | Required for live Agentforce | `sf agent publish authoring-bundle --api-name LOS_Loan_Copilot` then `sf agent activate --version <n>`. In an org where a mis-typed agent already exists, delete it in Agent Builder first — the Metadata API refuses with "setup object in use" |
| MT-047 | Create a Lightning Out 2.0 app for the site and record its 18-digit id | Salesforce admin | Required only if an Agentforce panel is embedded on a site | Without a `LightningOutApp` record the conversation panel mounts empty, because the client loads through Lightning Out. Scriptable via the **Tooling API** — see `docs/operator/box-preview-setup.md` — or **Setup → Lightning Out 2.0 App Manager**. `IsEnabled` must be true, and the site origin must be added as a `LightningOutAppHost`. The borrower portal carries no agent, so this is optional |
| MT-048 | Give the borrower portal an authenticated Salesforce user (Dana Whitfield on Harborview Logistics) with `LOS_Borrower_Portal`, site membership, and a real password. Done 2026-09-04: the Customer Community User profile is a site member, the sharing set scopes her to Harborview, and an admin can open the site as her with "Log in to Experience as User" without touching her password | Demo owner + Salesforce admin | Required for live data | The GraphQL UI API returns 401 for the guest user; `NetworkMember` lists her; she can sign in at the `loansvforcesite` login path and sees only Harborview loans |

## Review routing and testing

| ID | Task | Owner | Status | Complete when |
|---|---|---|---|---|
| MT-050 | Select real domain experts or managed groups (Credit Risk, Collateral, Compliance, Loan Documentation, Pricing, Insurance, Servicing) | Credit Administration | Required | Every active domain has an owner and the Credit Administration Triage fallback is named |
| MT-051 | Grant least-privilege Box access to reviewers | Content owner | Required | Each reviewer can access only required items |
| MT-052 | Validate low-confidence and missing-owner triage | Credit Administration | Required | Exceptions route to the named triage owner |
| MT-054 | Validate duplicate-safe Salesforce behavior | Salesforce operator | Per run | Repeated loan ID updates the same record, or the duplicate is recorded and accepted |
| MT-055 | Inspect citations and human task ownership | Human validator | Per run | Unsupported output is corrected; people retain credit approval authority |
| MT-056 | Confirm signature is blocked | Credit Administration | Per run | A loan in Underwriting or Credit Review cannot be sent for signature |
| MT-057 | Run Extract and the write-back on a labeled loan | Demo operator | Per run | `LosExtractLoanTerms` returns values with a validation summary and writes nothing; `LosApplyLoanTerms` refuses without `confirmed = true` and updates only allow-listed fields with it |
| MT-058 | Submit a labeled application from the portal and confirm the record, folder and classification | Demo operator | Per run | Done 2026-09-04 on LN-2026-0043 (Equipment Finance): application created from the portal, folder provisioned, two uploads classified by Box AI as Financial Statement and Tax Return, checklist 2 of 3. Signed in as the borrower user (MT-048), **Start a new application** creates one `LOS_Loan__c` in Application status with `Record_Source__c = Borrower Portal`, `Purpose__c` as typed, and the next `LN-<yyyy>-<NNNN>`; the second request provisions its Box folder; an uploaded appraisal is written `losDocument.documentType = Appraisal` by `LosClassifyDocument` and the checklist ticks it. A guest gets the sign-in prompt, not an error, and a file Box AI cannot name is left untagged and reported as awaiting classification. Remove the test application and its folder afterwards only under MT-074 |

## Presenter and reset

| ID | Task | Owner | Status | Complete when |
|---|---|---|---|---|
| MT-070 | Rehearse the six-beat storyboard | Presenter | Per run | The storyboard completes inside its time box without hidden setup |
| MT-071 | Pre-open only the selected scenario's surfaces | Presenter | Per run | Every page loads under the intended account |
| MT-072 | Capture screenshots from the real page viewport and update `config/demo/screenshot-manifest.bcl` | Maintainer | After UI changes | Thirteen screens captured 2026-09-03/04 from the live org and enterprise (Salesforce record page, agents list, Agent Builder, the borrower application, loan list and workspace checklist; Box loan folder, workspace, Doc Gen templates, Hub, commitment letter, term-sheet metadata). When captured: no browser chrome, documentation pages, or unrelated content appears; source, date, scenario, and readiness are current |
| MT-073 | Record test artifacts and restore demo state | Operator | Per run | Workflows/tasks are ready for the next session |
| MT-074 | Delete data or remove collaborators | System owner | Confirmation required | Impact is reviewed and exact objects are approved |

Store environment-specific IDs and completion evidence only in the gitignored runtime files or the operator's external run log.

For fail-closed readiness, copy `config/runtime/validation-receipts.example.json` to the gitignored `config/runtime/validation-receipts.json`, record only secret-free references to the current external run log, and run `python3 scripts/validate_los.py --presenter-ready`.
