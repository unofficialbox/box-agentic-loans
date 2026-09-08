# Demo Clickpath

A borrower starts an application in the Acme Borrower Portal; a term sheet marked up on the borrower's numbers is read against the credit policy library and the two loans Harborview already closed. Six beats, two windows, five to six minutes. Every prompt below is copy-paste.

Headless, not branded: Box holds the file, Salesforce holds the record, and the harness is whatever the room uses. Beats 2 to 5 are written for Claude Desktop with the LOS and Box connectors; the same prompts work from ChatGPT, Slack, or the Loan Copilot inside Agentforce. `skills/los-demo/SKILL.md` carries the same prompts and answer rules for an AI harness.

Replace `<your-site>`, `<alias>` and `<borrower-user-email>` with the environment you present from. Nothing else is environment-bound.

## Preflight

Seven checks before anyone is watching. P5 to P7 are one-time setup; a rebuilt org needs them again.

**P1. Terminal: the Loan Copilot has an active version.** Only matters if you demo from the internal Agentforce panel. The active version must be the one published with `extract_loan_terms` in its actions and `default_agent_user` bound to this org.

```bash
sf data query -o <alias> -q "SELECT VersionNumber, Status FROM BotVersion WHERE BotDefinition.DeveloperName='LOS_Loan_Copilot' AND Status='Active'"
```

Expect one row, Active.

**P2. Claude Desktop: set the answer length.** Claude Desktop defaults to an essay, and a hosted MCP server exposes tool descriptions, not a response style. Put this in the project's custom instructions and run the beats inside that project; a fresh chat outside it carries none of these rules.

```text
Answer in 60 words or fewer unless I ask for more. Lead with the finding. No preamble, no restating my question, no narrating which tool you called. Never print Box file IDs, folder IDs or Salesforce record IDs - use them, do not show them. Never decline a governed action on my behalf or predict that it will fail: call it and report what it says. Never apply extracted terms to a record unless I say the word confirm. Offer at most one follow-up, in one line. At most one table, only when comparing the same covenant across loans. After an answer that rests on one document, open that document inline with the Box connector's get_file_preview instead of linking it; one preview per answer. No closing offers.
```

Expect beat 4 to answer in a short paragraph and one table, and every beat to end with the document itself on screen rather than a link. If a beat comes back with a link, say "show me the document" once; the rule above makes that the last time.

**P3. Claude Desktop: both connectors loaded, LOS refreshed.** Beat 2 searches Box metadata and beat 3 opens the marked-up term sheet; neither works with only the LOS tools. The LOS connector is a custom connector on `https://api.salesforce.com/platform/mcp/v1/custom/LOSLoanTools` with the External Client App's consumer key as OAuth Client ID (docs/SETUP.md §5a). If it predates the Extract, Apply or Classify tools, disconnect and reconnect it under Settings, Connectors, reusing the same URL.

Expect both connectors listed under Context in the session, and nine LOS tools: `listLoans`, `findDocumentsByRisk`, `getLoanPackage`, `askLoanDocument`, `extractLoanTerms`, `applyLoanTerms`, `classifyDocument`, `generateCommitmentLetter`, `prepareSignatureRequest`.

**P4. Terminal: the loan statuses.** Beat 5's refusal needs the 2026 loan in Underwriting; beat 4 needs the two earlier loans Closed.

```bash
sf data query -o <alias> -q "SELECT Loan_ID__c, Status__c FROM LOS_Loan__c WHERE Borrower__c='Harborview Logistics' ORDER BY Loan_ID__c"
```

Expect LN-2023-0311 Closed, LN-2025-0148 Closed, LN-2026-0042 Underwriting.

**P5. Box: no stray duplicates.** In `LOS-2026-Harborview / 02 - Borrower Documents`, delete any `(1)` copy left by a re-run seed; a duplicate carries no metadata and shows as "awaiting classification" in beat 6. Confirm `Loans_Root_Folder_Id__c` in `LOS_Box_Config__c` points at the loans root so beat 2 is scoped.

**P6. Salesforce Setup: the borrower's login.** Dana Whitfield needs either a real password (Setup, Users, Dana Whitfield, Reset Password; the mail goes to `<borrower-user-email>`) or an admin who opens the site as her with Log in to Experience as User from her user record, which needs no password. Confirm she is a site member with a `NetworkMember` query first; a non-member's login failure looks like bad credentials.

**P7. Private window: sign in as Dana once.** Use the login path from beat 1, not `/loans/`.

Expect the portal to open on Your loans with the three Harborview loans and a Start a new application button under the Acme Bank mark. A borrower with no loans lands on Start an application; a signed-out visitor gets the sign-in prompt, never an error card.

## The six beats

### 1. Their paper arrives (private window, 0:00 to 3:10)

```text
https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F
```

Sign in as Dana Whitfield, Harborview's CFO. Start a new application: Commercial Real Estate, amount, term, one line of purpose. The borrowing entity is filled from her account; she cannot apply for anyone else. Submit.

Expect the workspace to open on the new loan with a Required documents card listing the seven things the bank asks a real-estate borrower for, each with one sentence of why, every row missing with an Upload button.

Upload two files from `output/pdf/`: `harborview-appraisal-2026.pdf`, then `harborview-financial-statements-fy2025.pdf`.

Expect "Classified as Appraisal by Box AI", then "Classified as Financial Statement by Box AI", and two ticks on the checklist. Nobody chose a type from a menu; Box AI read the document against the `losDocument` template. A file it cannot name is still received and sits under the checklist awaiting the loan officer's classification.

Then the lender's side: open the new record in Salesforce. Expect Status Application, Record Source Borrower Portal, the purpose she typed, a loan ID numbered after the last one that year, and a Box folder already holding her two classified files. One classification feeds the Copilot, the portfolio search in beat 2, and her own checklist.

If asked: creating the record and provisioning its folder are two requests, because Apex cannot make a callout after DML. If the folder step fails the workspace says so; retry from the workspace, not the form. A borrower who emails the package instead is captured onto the Opportunity's Box folder, and `losLoan` metadata in `01 - Application Intake` starts the alternate Automate path. Say it in one sentence; do not show it.

Beats 2 to 5 pick up LN-2026-0042, the Harborview loan now in Underwriting, with the term sheet the CFO sent back on her numbers.

### 2. The portfolio already knows what's risky (Claude Desktop, to 4:05)

```text
Which loan documents across the portfolio are flagged critical policy risk?
```

Expect `harborview-term-sheet-2026-borrower-markup.pdf` as the one Critical document. Ask for High or above and the FY2025 financial statements and the appraisal join it.

If it returns another borrower's file: Box metadata search is enterprise-wide, and only `ancestor_folder_id` bounds it; `findDocumentsByRisk` reads that from `Loans_Root_Folder_Id__c` (P5).

### 3. Extract the terms, then read them against policy (to 6:30)

```text
Extract the loan terms from the Harborview application package and validate them against the record, then tell me where we are outside credit policy and cite the policy library.
```

Expect seven extracted fields with a citation each ($4,800,000, 6.85%, 120 months, collateral $5,650,000 from the appraisal rather than the borrower's $6,000,000, LTV 85%, DSCR 1.12x), LTV and DSCR flagged against the record, then the exposure: Section 9.3 restates DSCR to 1.10x tested annually and Schedule A adds FF&E at book value; LOS-LTV-001 (75%) with exception LOS-LTV-002 (80%), LOS-DSCR-001 (1.25x) with exception LOS-DSCR-002 (1.15x); 85% / 1.12x is outside even the exceptions, and Credit Risk owns the deviation.

Land it: a CRM record cannot find this, because the borrower's number is what was typed into it, and the markup never uses the phrase "loan-to-value".

Then:

```text
apply those values to the record, confirm
```

Expect `applyLoanTerms` to refuse without the confirmation and, with it, to update only the allow-listed fields. That is the one write in the demo, and a person just authorised it.

### 4. What they agreed the last two times (to 7:25)

```text
Compare the LTV and DSCR covenants across the two Harborview loans we have already closed and this 2026 term sheet. What did Harborview actually agree before?
```

Expect both closed loans (the 2023 line of credit and the 2025 equipment loan) at a negotiated 70% LTV and 1.30x DSCR tested quarterly, from Schedule 1 of each executed agreement, and the 2026 markup walking both back.

Land it: Harborview's markup regresses two positions their own CFO agreed, in writing, twice.

### 5. Put the terms on paper, then stop (to 9:20)

```text
Draft the commitment letter for this Harborview loan at the approved terms, using the policy exception and the precedent from the closed loans.
```

Doc Gen is asynchronous: the reply says "submitted" and `commitment-letter-LN-2026-0042.pdf` lands in the Harborview folder a few seconds later. Keep that folder open in a tab and refresh it.

Expect the letter to carry borrower and entity, amount, rate, term, collateral, the covenants at issue, the approved exceptions, Credit Risk as owner, the precedent, and on its face that it is a draft pending Credit Committee.

```text
Send the Harborview commitment letter for signature.
```

Expect the action to be called and to refuse, naming Underwriting. That is a state check in Apex (`SIGNABLE = Approved, Commitment`), not a prompt instruction; once approved, the action still only prepares a request for a person to send.

If the assistant declines without calling the action, the beat has not happened. Say "call it anyway and show me what it returns".

### 6. The same platform, scoped to the other side (private window, to 11:00)

```text
https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F
```

Sign in as Dana Whitfield with the password from P6. Use the login path: `/loans/` serves the app for every URL beneath it and never redirects a signed-out visitor.

Expect the header to name her, Dana Whitfield · Harborview Logistics, above the three seeded Harborview loans plus the beat 1 application, and no Pinecrest. Same code, different identity, different rows: a Salesforce sharing set on the borrower account, with the Box token downscoped to one folder.

Open the 2026 loan. Expect five documents where the internal package lists six: anything tagged Internal is withheld by metadata, not by a different folder, and her LTV, DSCR and risk rating are not in the projection at all.

There is no Copilot on this page. A Service Agent runs as its own user and takes the loan name from the conversation, so it could be asked about another borrower's loan; it was left off rather than left for someone to find.

## Rehearse the Loan Copilot (internal only, ten minutes)

Setup, Agentforce Agents: confirm Loan Copilot shows Active, open it, and click Preview in Agentforce Builder. The chat runs as the agent user, not as you. Send each message on its own.

| Send | Expect |
|---|---|
| `What's in the loan package for LN-2026-0042?` | The record summary and eight document names, term-sheet markup included. No record or folder IDs. |
| `What does the borrower's markup change about the rate and the guaranty?` | 6.50% requested against 6.85% fixed; limited guaranty capped at $1,000,000 each; cited to the markup PDF. |
| `Extract the terms from the term sheet and validate them against the record.` | Seven fields. LTV 75 vs 85 and DSCR 1.25 vs 1.12 flagged as mismatches. States that nothing was written. |
| `Does credit policy allow 85% LTV and 1.12x DSCR? Cite the policy IDs.` | LOS-LTV-001 and LOS-LTV-002, LOS-DSCR-001 and LOS-DSCR-002. Both requests outside the approved exceptions. |
| `What has Harborview submitted for LN-2026-0043 so far?` | The Equipment Finance application: Financial Statement and Tax Return classified, loan application still missing. |

Expect five answers without a fallback. If one falls to the fallback or narrates tool names, note the message and send it to the maintainer: the fix is an edit to the `.agent` file and a republish. Never edit the agent in the builder; the next publish overwrites it.

## Show new applications to the loan officer

Portal applications arrive in Application status with Record Source "Borrower Portal". The **New applications** list view ships with the metadata (`objects/LOS_Loan__c/listViews/New_applications`). Pin it once per org: App Launcher, Loan Origination, Loans tab, pick New applications, then Pin list.

Expect one row, LN-2026-0043 with Record Source "Borrower Portal", until the next rehearsal of beat 1 adds another. If the view is missing, run `python3 scripts/demo_operator.py salesforce-deploy`.

## What a rehearsal leaves behind

Every run of beat 1 creates a real `LOS_Loan__c` in Application status and a real Box folder, numbered after the last one that year. Present with the latest one in view, or have the demo owner remove earlier ones and their folders (MT-074). Do not delete records during setup.

## If someone asks

- **Every write is governed, and a person is in each one.** The application and each classification are written by Apex actions the borrower cannot bypass. `extractLoanTerms` only reads; `applyLoanTerms` writes seven allow-listed fields when a person says confirm and refuses on a Closed or Servicing loan. Doc Gen drafts into the governed folder; Box Sign only prepares a request. Both sides of the write-back ran live: the unconfirmed call was refused, and a confirmed call wrote amount, rate and term and nothing else.
- **This is not Claudeforce.** Claudeforce is a Salesforce pilot connector for Sales Cloud that neither Box nor this demo can open. What is shown is the headless pattern it will sit inside. Do not claim compatibility with a product nobody in the room can use.
- **The Box MCP server package for Agentforce is not generally available.** Its security review is stalled. The Loan Copilot runs on Apex actions and does not depend on it.
- **Where does the data move? Nowhere.** Documents stay in Box; Salesforce permission sets decide what a user may read or write on the record; Box permissions decide which content they may see; the assistant calls both and copies nothing.
- **Why no Copilot on the borrower site?** A Service Agent runs as its assigned agent user and cannot inherit Dana's access. An Employee Agent inherits the signed-in user's permissions; that is where the internal Loan Copilot runs.
- **The tagging on seeded files is manual.** Portal uploads are classified by Box AI as they land; the seeded Harborview files were tagged by the seed script and by hand. A metadata cascade policy on the loan folder is what would make it survive the next loan.

Loans: LN-2023-0311, LN-2025-0148, LN-2026-0042, Pinecrest LN-2026-0088, plus each rehearsal's application.
