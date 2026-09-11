# Demo Clickpath

A borrower starts an application in the Acme Borrower Portal; a term sheet marked up on the borrower's numbers is read against the credit policy library and the two loans Harborview already closed. Six beats, two windows, an 11-minute full walkthrough. The 6:30 shortened stage variant and reset procedure are in [docs/PRESENTING.md](docs/PRESENTING.md).

Headless, not branded: Box holds the file, Salesforce holds the record, and the harness is whatever the room uses. Beats 2 to 5 are written for Claude Desktop with the LOS and Box connectors; the same prompts work from ChatGPT, Slack, or the Loan Copilot inside Agentforce.

---

## Quick Preflight Checks

Before starting:
- [ ] **P1:** Loan Copilot has active version
- [ ] **P2:** Claude Desktop custom instructions set (bullets/tables, 60 words, preview files)
- [ ] **P3:** Both connectors loaded (Box + LOS), LOS refreshed
- [ ] **P4:** Loan statuses: LN-2023-0311 Closed, LN-2025-0148 Closed, latest Harborview loan in Approved status
- [ ] **P5:** Required documents uploaded with metadata (see [docs/DOCUMENTS-SETUP.md](docs/DOCUMENTS-SETUP.md))
- [ ] **P6:** Dana Whitfield borrower login ready
- [ ] **P7:** Test sign in once as Dana

---

## Quick Reference - Copy/Paste Prompts

**Beat 1 (Browser):** `https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F`

**Beat 2 (Claude Desktop):**
```
What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?
```

**Beat 3 (Claude Desktop):**
```
Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.
```

**Beat 3a (Claude Desktop):**
```
Validate those terms against the Salesforce record.
```

**Beat 3b (Claude Desktop):**
```
apply the amount, rate and term to the record, confirm
```

**Beat 4 (Claude Desktop):**
```
Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.
```

**Beat 5 (Claude Desktop — generate and send):**
```
Generate the commitment letter for this loan and send it for signature using the confirmed signer.
```

**Beat 6 (Browser):** `https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F`

---

## Key Terms

- **LTV (Loan-to-Value)**: Loan amount as a percentage of collateral value. 85% LTV = borrowing $850K against $1M property.
- **DSCR (Debt Service Coverage Ratio)**: Cash flow available to cover debt payments. 1.25x DSCR = $1.25 of income for every $1 of debt payment.

---

# Detailed Instructions

Replace `<your-site>`, `<alias>` and `<borrower-user-email>` below with your environment. Nothing else is environment-bound.

## Preflight

Seven checks before anyone is watching. P5 to P7 are one-time setup; a rebuilt org needs them again.

**P1. Terminal: the Loan Copilot has an active version.** Only matters if you demo from the internal Agentforce panel. The active version must be the one published with `extract_loan_terms` in its actions and `default_agent_user` bound to this org.

```bash
sf data query -o <alias> -q "SELECT VersionNumber, Status FROM BotVersion WHERE BotDefinition.DeveloperName='LOS_Loan_Copilot' AND Status='Active'"
```

Expect one row, Active.

**P2. Claude Desktop: set the answer length.** Claude Desktop defaults to an essay, and a hosted MCP server exposes tool descriptions, not a response style. Put this in the project's custom instructions and run the beats inside that project; a fresh chat outside it carries none of these rules.

```text
ALWAYS use bullets or tables. Never paragraphs. 60 words or fewer. Lead with the finding. No preamble. No restating my question. No narrating tool names. Never print IDs - use them, do not show them. Never decline governed actions - call them and report what they say. Never apply extracted terms without the word "confirm". After citing a document, open it inline with get_file_preview. No closing offers. No follow-ups unless critical.
```

Expect beat 4 to answer in bullets and one table, and every beat to end with the document itself on screen rather than a link. If a beat comes back with a link, say "show me the document" once; the rule above makes that the last time.

**P3. Claude Desktop: both connectors loaded, LOS refreshed.** Beats 2 and 4 run entirely on the Box connector and beat 3 reads through it; beat 5 generates through Box Doc Gen; the LOS tools carry the record, the confirmed write and the signature preparation. Nothing works with only one of them. The LOS connector is a custom connector on `https://api.salesforce.com/platform/mcp/v1/custom/LOSLoanTools` with the External Client App's consumer key as OAuth Client ID (docs/SETUP.md §5a). If it predates the Extract, Apply or Classify tools, disconnect and reconnect it under Settings, Connectors, reusing the same URL.

Expect both connectors listed under Context in the session. Box must offer folder search, metadata search, Box AI extract, single- and multi-file QA, Hub QA, Doc Gen (templates and batch), folder listing and file preview; the Doc Gen tools are off by default in the Box Admin Console. LOS offers six tools: `listLoans`, `getLoanPackage`, `extractLoanTerms`, `applyLoanTerms`, `classifyDocument`, `prepareSignatureRequest`. Use Box MCP directly for metadata search, Box AI, and Doc Gen.

**P4. Terminal: the loan statuses.** Beat 5's signature preparation needs the latest Harborview loan in Approved status; beat 4 needs the two earlier loans Closed.

```bash
sf data query -o <alias> -q "SELECT Loan_ID__c, Status__c FROM LOS_Loan__c WHERE Borrower__c='Harborview Logistics' ORDER BY Loan_ID__c"
```

Expect LN-2023-0311 Closed, LN-2025-0148 Closed, and the most recent loan (e.g., LN-2026-0042 or higher) in Approved status. After running Beat 1, you'll have a new Application-status loan - manually update its status to Approved before running Beats 2-5.

**P5. Box: required documents with metadata.** See [docs/DOCUMENTS-SETUP.md](docs/DOCUMENTS-SETUP.md) for explicit upload instructions:
- **Latest Harborview loan** needs: Term sheet with borrower markup (policyRisk="Critical"), optional financials/appraisal
- **LN-2023-0311** needs: Executed loan agreement ($1.5M, 70% LTV, 1.30 DSCR, Pike/Shah signatures)
- **LN-2025-0148** needs: Executed loan agreement ($2.15M, 78% LTV, 1.28 DSCR, Pike/Shah signatures)

After Beat 1 creates a new loan, upload `harborview-term-sheet-2026-borrower-markup.pdf` to its folder and ensure it has `policyRisk="Critical"` metadata. Check for duplicates: inventory each loan's `02 - Borrower Documents` subfolder for `(1)` copies left by earlier seeds. Unclassified duplicates are excluded from the borrower listing.

**P6. Salesforce Setup: the borrower's login.** Dana Whitfield needs either a real password (Setup, Users, Dana Whitfield, Reset Password; the mail goes to `<borrower-user-email>`) or an admin who opens the site as her with Log in to Experience as User from her user record, which needs no password. Confirm she is a site member with a `NetworkMember` query first; a non-member's login failure looks like bad credentials.

**P7. Private window: sign in as Dana once.** Use the login path from beat 1, not `/loans/`.

Expect the portal to open on Your loans with the three Harborview loans and a Start a new application button under the Acme Bank mark. A borrower with no loans lands on Start an application; a signed-out visitor gets the sign-in prompt, never an error card.

## The six beats

**Note on loan identification:** Beats 2-5 query for the latest Harborview loan (the one just created in Beat 1) instead of using a hardcoded ID. The LOS `listLoans` tool finds it, then subsequent operations use that loan's ID or record ID. This ensures the demo works with freshly created loans after cleanup.

### 1. Their paper arrives (private window, 0:00 to 3:10)

```text
https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F
```

Sign in as Dana Whitfield, Harborview's CFO. Start a new application: Commercial Real Estate, amount, term, one line of purpose. The borrowing entity is filled from her account; she cannot apply for anyone else. Submit.

Expect the workspace to open on the new loan with a Required documents card listing the seven things the bank asks a real-estate borrower for, each with one sentence of why, every row missing with an Upload button.

Upload two files from `output/pdf/`: `harborview-appraisal-2026.pdf`, then `harborview-financial-statements-fy2025.pdf`.

Expect "Classified as Appraisal by Box AI", then "Classified as Financial Statement by Box AI", and two ticks on the checklist. Nobody chose a type from a menu; Box AI read the document against the `losDocument` template. A file it cannot name is still received, but remains excluded from the document listing until the loan officer classifies it. The upload notice explains the pending classification.

Then the lender's side: open the new record in Salesforce. Expect Status Application, Record Source Borrower Portal, the purpose she typed, a loan ID numbered after the last one that year, and a Box folder already holding her two classified files. One classification feeds the Copilot, the portfolio search in beat 2, and her own checklist.

If asked: creating the record and provisioning its folder are two requests, because Apex cannot make a callout after DML. If the folder step fails the workspace says so; retry from the workspace, not the form. A borrower who emails the package instead is captured onto the Opportunity's Box folder, and `losLoan` metadata in `01 - Application Intake` starts the alternate Automate path. Say it in one sentence; do not show it.

**Beats 2 to 5 work with the loan just created in Beat 1.** Query for the latest Harborview loan to get its ID, then use that for subsequent operations.

### 2. The portfolio already knows what's risky (Claude Desktop, to 4:05)

```text
What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?
```

Expect `listLoans` with borrower filter to find the latest Harborview loan, then `getLoanPackage` to get the folder ID, then Box metadata search for `policyRisk = Critical` with folder scope. One hit: `harborview-term-sheet-2026-borrower-markup.pdf`. **MUST call `get_file_preview` to show the document inline**. The document should appear on screen, not just a filename or link. Ask for High or above and the FY2025 financial statements and the appraisal join it.

**If the assistant only cites "Source: filename.pdf" without showing the document:** Say "show me the document" — P2 custom instructions require preview after citing. The beat is not complete until the document appears.

### 3. Extract the terms, then read them against policy (to 6:30)

Box reads; Salesforce compares and writes.

```text
Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.
```

Expect `getLoanPackage` to name the folder, then Box AI structured extraction on the markup: $4,800,000; 6.85% bank rate and 6.50% requested; 120 months; DSCR proposed at 1.10x tested annually. Then Box AI over the policy Hub: LOS-LTV-001 (75%) with exception LOS-LTV-002 (80%, interest reserve), LOS-DSCR-001 (1.25x) with exception LOS-DSCR-002 (1.15x, cash reserve); 85% and 1.10x are outside even the exceptions, Credit Risk owns the deviation. **The markup MUST preview inline** with `get_file_preview` showing the red interest and guaranty changes.

Land it: a CRM record cannot find this, because the borrower's number is what was typed into it, and the markup never uses the phrase "loan-to-value". Then the record:

```text
Validate those terms against the Salesforce record.
```

Expect `extractLoanTerms` to report amount, rate and term matching the record and LTV and DSCR mismatching it, with nothing written. Then:

```text
apply the amount, rate and term to the record, confirm
```

First request the same write without confirmation and verify the action refuses. Then use the explicit confirmation above and verify it updates only those fields. That is the one write in the demo, and a person just authorised it. Never apply the extracted LTV or DSCR: they are policy thresholds and markup requests, not the borrower's numbers on the record.

### 4. What they agreed the last two times (to 7:25)

Box does this beat across three files.

```text
Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.
```

Expect `listLoans` or `getLoanPackage` for the two closed loans (LN-2023-0311, LN-2025-0148) to hand over the executed agreements, then one Box AI multi-file answer: both closed loans at 70% LTV and 1.30x DSCR tested quarterly, Section 8 and Schedule 1 of each executed agreement, signed by Jordan Pike for Harborview and Priya Shah for Acme Bank; the 2026 markup asks 1.10x tested annually. One table, then the 2025 agreement previewed at Schedule 1.

Land it: Harborview's markup regresses two positions their own CFO agreed, in writing, twice.

### 5. Put the terms on paper, then stop (to 9:20)

Box generates; Salesforce refuses.

```text
Generate the commitment letter for this loan.
```

Expect `getLoanPackage` for the record and folder, then `create_docgen_batch` with template ID from `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` into the loan folder with the letter's fields filled from beats 3 and 4. Doc Gen is asynchronous: follow the [Doc Gen contract](docs/DOCGEN-GUIDE.md), read the matching batch job until `completed`, then inspect and preview its exact `output_file.id`. Stop on job warnings, unresolved tags, or incorrect loan terms. Do not select a similarly named file through metadata search; a previous failed output may still exist. Expect borrower and entity, amount, rate, term, the covenants at issue, the approved exceptions, Credit Risk as owner, the precedent, and on its face that it is a draft pending Credit Committee.

If the Box connector refuses Doc Gen: the Box Admin Console must have the Doc Gen MCP tools enabled and the connector reconnected afterwards (docs/SETUP.md §5a).

```text
Send the commitment letter for signature.
```

Expect `prepareSignatureRequest` to be called and succeed. The loan's Approved status passes the state check (`SIGNABLE = Approved, Commitment`). The sign request is created with:
- `is_document_preparation_needed = false` (tags pre-placed in template)
- `embed_url_external_user_id` = signer email (for embedded signing)
- Embed URL stored on `LOS_Loan__c.Sign_Embed_URL__c`

**What changed from old flow:** No prepare URL, no field placement. The borrower signs immediately in beat 6 via embedded iframe in their portal. Signature and date fields are pre-placed using Box Sign tags in the Doc Gen template.

If the assistant declines without calling the action, the beat has not happened. Say "call it anyway and show me what it returns".

### 6. The same platform, scoped to the other side (private window, to 11:00)

```text
https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F
```

Sign in as Dana Whitfield with the password from P6. Use the login path: `/loans/` serves the app for every URL beneath it and never redirects a signed-out visitor.

Expect the header to name her, Dana Whitfield · Harborview Logistics, above the three seeded Harborview loans plus the beat 1 application, and no Pinecrest. Same code, different identity, different rows: a Salesforce sharing set on the borrower account, with upload-only folder access and separately authorized per-file preview tokens.

Open the 2026 loan. **Expect to see the embedded Box Sign iframe** at the top of the workspace with the commitment letter ready to sign. The signature and date fields are interactive (converted from Box Sign tags). 

**Optional: Complete the signature flow in the demo**
- Click signature field → draw or type signature
- Date auto-fills when signed
- Click "Finish" → document signed
- Expect success message, iframe disappears, workspace refreshes

Compare the document inventory with the officer package: the server omits Internal and unclassified documents and grants preview access one authorized file at a time, and her LTV, DSCR and risk rating are not in the projection at all.

There is no Copilot on this page. A Service Agent runs as its own user and takes the loan name from the conversation, so it could be asked about another borrower's loan; it was left off rather than left for someone to find.

## Rehearse the Loan Copilot (internal only, ten minutes)

Setup, Agentforce Agents: confirm Loan Copilot shows Active, open it, and click Preview in Agentforce Builder. The chat runs as the agent user, not as you. Send each message on its own.

| Send | Expect |
|---|---|
| `What's the latest loan for Harborview Logistics?` | The most recent loan ID and status (the one created in Beat 1). |
| `What's in that loan package?` | The record summary and the current document inventory, term-sheet markup included. No record or folder IDs. |
| `What does the borrower's markup change about the rate and the guaranty?` | 6.50% requested against 6.85% fixed; limited guaranty capped at $1,000,000 each; cited to the markup PDF. |
| `Extract the terms from the term sheet and validate them against the record.` | Seven fields. LTV 75 vs 85 and DSCR 1.25 vs 1.12 flagged as mismatches. States that nothing was written. |
| `Does credit policy allow 85% LTV (loan-to-value) and 1.12x DSCR (debt service coverage ratio)? Cite the policy IDs.` | LOS-LTV-001 and LOS-LTV-002, LOS-DSCR-001 and LOS-DSCR-002. Both requests outside the approved exceptions. |

Expect five answers without a fallback. If one falls to the fallback or narrates tool names, note the message and send it to the maintainer: the fix is an edit to the `.agent` file and a republish. Never edit the agent in the builder; the next publish overwrites it.

## Show new applications to the loan officer

Portal applications arrive in Application status with Record Source "Borrower Portal". The **New applications** list view ships with the metadata (`objects/LOS_Loan__c/listViews/New_applications`). Pin it once per org: App Launcher, Loan Origination, Loans tab, pick New applications, then Pin list.

Expect the loan created in Beat 1 with Record Source "Borrower Portal". Each rehearsal of beat 1 adds another. If the view is missing, run `python3 scripts/demo_operator.py salesforce-deploy`.

## What a rehearsal leaves behind

Every run of beat 1 creates a real `LOS_Loan__c` in Application status and a real Box folder, numbered after the last one that year. Present with the latest one in view, or have the demo owner remove earlier ones and their folders (MT-074). Do not delete records during setup.

## If someone asks

- **Know which control enforces each write.** The borrower explicitly submits the application and uploads; Apex performs classification. `extractLoanTerms` reads; `applyLoanTerms` requires confirmation and refuses Closed or Servicing loans. Direct Box Doc Gen follows the presenter's authorization and Box permissions, rather than the Apex confirmation gate. The LOS signature action prepares a request only in allowed loan states. Record the actual unconfirmed refusal and confirmed field changes during this rehearsal; historical runs are not current evidence.
- **This is not Claudeforce.** Claudeforce is a Salesforce pilot connector for Sales Cloud that neither Box nor this demo can open. What is shown is the headless pattern it will sit inside. Do not claim compatibility with a product nobody in the room can use.
- **The Box MCP server package for Agentforce is not generally available.** Its security review is stalled. The Loan Copilot runs on Apex actions and does not depend on it.
- **Where do the documents live? In Box.** Documents stay in Box; Salesforce permission sets decide what a user may read or write on the record; Box permissions decide which content they may see; the assistant reads both; extracted values and generated draft content cross those interfaces while source documents remain in Box.
- **Why no Copilot on the borrower site?** A Service Agent runs as its assigned agent user and cannot inherit Dana's access. An Employee Agent inherits the signed-in user's permissions; that is where the internal Loan Copilot runs.
- **The tagging on seeded files is manual.** Portal uploads are classified by Box AI as they land; the seeded Harborview files were tagged by the seed script and by hand. A metadata cascade policy on the loan folder is what would make it survive the next loan.

**Pre-seeded loans:** LN-2023-0311 (Harborview, Closed), LN-2025-0148 (Harborview, Closed), Pinecrest LN-2026-0088 (different borrower). Each rehearsal of Beat 1 creates a new Harborview loan in Application status that becomes the demo loan for Beats 2-5. Use `python3 scripts/cleanup_demo.py` to remove test loans between presentations.

The borrower’s Documents table lists supporting files and signing artifacts once, alongside any missing requirements. Signed Commitment Letter and Signing Log remain accessible without adding to supporting-document approval totals.
