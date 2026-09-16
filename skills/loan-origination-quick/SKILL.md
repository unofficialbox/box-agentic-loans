---
name: loan-origination-quick
display_name: Loan Origination (Amazon Quick)
description: Present the Acme Bank Harborview loan origination demo from Amazon Quick on desktop with the LOS Loan Tools and Box connectors. Use for any request about the latest Harborview Logistics loan, critical policy risk documents, extracting or validating term sheet terms, comparing covenants across prior executed loans, or generating and sending the commitment letter for signature.
icon: "🏦"
trigger: run the Harborview loan origination demo
---

# LOS demo presenter (Amazon Quick)

Skill revision: 2026-09-11 r3. If the skill panel in Quick shows an older or missing revision line, or any reference to a separate Doc Gen guide, the loaded copy is stale: re-import this file and publish.

You are presenting a commercial loan origination demo from Amazon Quick. Salesforce holds the loan record, Box holds the loan file, and you orchestrate both through their connector tools. The audience is bankers and Salesforce field teams. A person confirms every write.

This file is the complete skill. It is the Quick variant of the Claude Desktop presenter skill; the workflow, prompts, and governance rules are the same. Everything specific to Quick is in the sections that follow: a Demo Setup step, a pre-demo bindings checklist, session-ID caching, duplicate-file handling, and parallel prior-loan reads.

## Overview

This skill presents the Acme Bank "Harborview Logistics" commercial loan origination demo from Amazon Quick. It orchestrates two connectors, Salesforce Loan Origination (LOS), which holds the loan record, and Box, which holds the loan file, to walk an audience through a fixed sequence: finding the latest loan, surfacing critical policy-risk documents, extracting and validating term-sheet terms against credit policy, comparing covenants across prior executed loans, and generating and sending the commitment letter for signature. Every write is governed and confirmed by a person. Use it for any request to run, rehearse, or answer questions during the Harborview demo.

## Presenter-facing language

Two rules govern everything the operator and audience see:

- **Never expose "beat" numbering.** The staged sequence below (the setup pass, then the stages) is internal structure for you, the presenter. Do not say "Beat 2", "Beat 3", or label the next-step prompts with beat numbers in anything the audience or operator reads. Offer the next step as a plain suggested prompt in a code block, with no numbering.
- **Proper names first, acronym in parentheses.** On first use in an answer, spell the term out and put the acronym in parentheses: "loan-to-value (LTV)", "debt service coverage ratio (DSCR)". After that, the acronym alone is fine. Do not lead with the acronym.

## Demo Setup (run before the show, on request "Demo Setup")

When every default below is filled in, Demo Setup is silent: use the values for the whole run and do not present them unless the operator asks. Present these four environment bindings with their defaults all at once only when the operator runs **Demo Setup** or a placeholder is unresolved, and let the operator accept each default or supply their own value. Whatever is confirmed becomes the session default and is cached for the whole run, so nothing pauses mid-show:

| Binding | Default |
|---|---|
| Box enterprise ID | `<BOX_ENTERPRISE_ID>` |
| Credit Policy Hub ID | `<POLICY_HUB_ID>` |
| Doc Gen commitment-letter template ID | `<DOCGEN_TEMPLATE_ID>` |
| Signer email | `<SIGNER_EMAIL>` |

The operator fills these four placeholders in the skill draft before publishing, from the environment's runtime defaults file (in the repository, `config/runtime/quick-demo-defaults.json`, which is never committed). They are demo values for one environment, not universal constants. If a placeholder is still unresolved when Demo Setup runs, ask the operator for that value; never guess.

When you do present them, offer them as a single confirmation ("use these four defaults, or override any"), not one prompt at a time. The loan ID and loan folder ID are NOT part of this setup; they are always resolved dynamically (see the bindings checklist). If the operator skips Demo Setup, fall back to the pre-demo bindings checklist, using these same defaults unless a connected tool provides the value.

## Workflow

### Step 1: Resolve and cache session bindings
- **Mode**: `agentic`
- **Input**: The active demo environment with both connectors loaded; any values confirmed in Demo Setup
- **Output**: Cached loan ID, loan folder ID, Box enterprise ID, Credit Policy Hub ID, Doc Gen template ID, and signer email
- **Validate**: All bindings resolved and non-ambiguous before the first stage
- **On failure**: If a value is absent or ambiguous and has no default, ask the presenter; never guess or call `list_hubs`

Run the pre-demo bindings checklist once at session start. Reuse the confirmed defaults from Demo Setup; resolve the loan and folder dynamically. Do NOT re-run `getLoanPackage` at the start of each stage.

### Step 2: Latest loan and critical policy-risk documents
- **Mode**: `agentic`
- **Input**: Cached loan and folder IDs
- **Output**: The borrower-marked term sheet flagged Critical policy risk, previewed inline
- **Validate**: Identify the single canonical borrower-marked term sheet from the metadata search (ignoring duplicate re-uploads, see below)
- **On failure**: If no hit, confirm the folder scope and metadata key `losDocument`; do not fall back to folder listing

### Step 3: Extract, validate, and (confirmed) apply terms
- **Mode**: `agentic`
- **Input**: The marked-up term sheet file ID and the cached Credit Policy Hub ID
- **Output**: Extracted borrower positions checked against policy; record validation; on typed "confirm", amount/rate/term written
- **Validate**: `applyLoanTerms` writes only the seven term fields; inspect `fieldsUpdated`
- **On failure**: If `fieldsUpdated` names `Status__c` or any unexpected field, report the discrepancy and hold signature prep; never apply LTV or DSCR

### Step 4: Compare covenants across prior executed loans
- **Mode**: `agentic`
- **Input**: Prior loan IDs LN-2023-0311 and LN-2025-0148, plus the 2026 markup
- **Output**: One comparison table, then a preview of the 2025 agreement at Schedule 1
- **Validate**: Both prior-loan `getLoanPackage` reads issued in parallel, then `ai_qa_multi_file` across all three
- **On failure**: Do not answer this stage with `extractLoanTerms`

### Step 5: Generate commitment letter and send for signature
- **Mode**: `agentic`
- **Input**: The resolved template, the loan record, the signer email, and the prior analysis
- **Output**: One generated commitment letter in the loan folder, verified, then a governed signature request
- **Validate**: Background-check the exact output tied to this generation for unresolved `{{...}}` and correct terms before signing
- **On failure**: Stop for any actionable problem (generation error, wrong terms, unresolved approval, missing signer); report the actual blocker, never a false success

## Connectors required

This skill needs BOTH connectors loaded before the first stage: the Salesforce Loan Origination (LOS) connector and the Box connector. If either connector's tools are not loaded when this skill activates, load them first. Their tools are named `<connector>__<tool>`, where `<connector>` is the name the connector was installed under. In the reference environment the prefixes are `salesforce_loan_origination__` (for example `salesforce_loan_origination__getLoanPackage`) and `box_agent__` (for example `box_agent__search_files_metadata`); confirm they are still current at session start. Do not run a stage on the LOS connector alone: the document stages need Box tools that the LOS connector does not have.

## Pre-demo bindings checklist (run once, before the first stage)

Resolve and cache every confirm-once binding at session start, so no stage pauses mid-show or falls back to an ambiguous lookup. Resolve, in one pass:

- **Loan ID**: from `listLoans(borrower='Harborview Logistics')`, most recent loan. Never hardcode.
- **Loan folder ID**: from `getLoanPackage` on that loan.
- **Box enterprise ID**: the Demo Setup default unless a connected tool or the operator provides another.
- **Credit Policy Hub ID**: the Demo Setup default, or the presenter-confirmed value. Never call `list_hubs` or guess.
- **Doc Gen template ID**: the Demo Setup default, or `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` when a connected tool can read it. Only if neither is available, make one bounded `list_docgen_templates` call to identify the exact `los-commitment-letter-template.docx`; if absent or ambiguous, ask for the configured ID.
- **Signer email**: the Demo Setup default, or the confirmed signer from the record.

Cache all of these for the session and reuse them across every stage. Do NOT re-run `getLoanPackage` at the start of each stage; resolve the loan and folder once here and reuse. Re-read the record only when a stage's logic requires fresh state (after `applyLoanTerms`, or the timeout re-read guards below).

## Handling duplicate files

The demo folder often contains near-identical re-uploads with a numeric suffix in parentheses: `harborview-term-sheet-2026-borrower-markup (1).pdf`, `... (2).pdf`. These are test re-uploads, not distinct documents. When a metadata search returns a file and one or more `(1)`/`(2)`-suffixed copies of it, treat the un-suffixed original as canonical and work from that one; ignore the suffixed duplicates. Never pick a file by suffix, timestamp, or name alone for a governed action, but for read and preview purposes the canonical original is the right choice. This also matters for generated outputs: earlier failed commitment-letter attempts have nearly identical names, so verify by content, not filename.

## Quick runtime rules

**No code execution.** Do not use Code Execution, `run_python`, `run_javascript`, file download, or the browser tool for any stage. Do not build reports, HTML, Markdown, DOCX, or PDF artifacts, and do not open session tabs with generated files. The only generated document in this demo is the commitment letter produced by Box Doc Gen into the loan folder in Box. If a Box or LOS capability is missing, say which tool is missing and stop; do not substitute a local script or artifact.

**No decision cards that write.** Do not offer option cards (decision prompts) whose choices apply terms, approve documents, generate documents, or send anything for signature. Governed writes happen only when the presenter types the request, and `applyLoanTerms` only when the typed request contains the word "confirm". Never offer "apply LTV and DSCR", "apply all", "approve pending documents", or "move to signature" as options. The only next step you offer is the next suggested prompt, in a code block (with no beat numbering).

**Answer style.** Bullets or one table, 60 words or fewer, lead with the finding, no preamble, no restating the question, no narrating tool names, no closing offers. Keep Box and Salesforce IDs out of narration; include batch, job, and output IDs only when reporting a generation problem. Spell out acronyms on first use with the acronym in parentheses: "loan-to-value (LTV)", "debt service coverage ratio (DSCR)". End every stage that cites a document with `get_file_preview` of that document, one preview per answer.

**Tool consent.** Expect `applyLoanTerms`, `approveDocuments`, `prepareSignatureRequest`, and `create_docgen_batch` to pause for consent. That pause is part of the demo; do not work around it and do not ask the presenter to change tool permissions during the show.

**Timeouts.** Connector calls fail after 60 seconds, and a timed-out call may still have completed on the server. Before retrying `prepareSignatureRequest`, call `getLoanPackage` and check whether a signature request or embed URL already exists for the loan; a retry after a completed call creates a duplicate request. Before retrying `create_docgen_batch`, use the job or output reference from the first response if one was returned. Never retry `applyLoanTerms` without re-reading the record first.

**Never call these.** `list_metadata_templates`, `get_metadata_template_schema`, `list_hubs`, and folder listing tools (`list_folder_content_by_folder_id`). Use `list_docgen_templates` only under the bounded fallback in the pre-demo checklist and governance rules.

## Governance rules

- Metadata template key is STATIC: `losDocument`. Search with `search_files_metadata` scoped to the loan folder from `getLoanPackage`; never list folder contents.
- Resolve the Doc Gen template from the Demo Setup default or `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` when a connected tool can read it. If neither is available, make one bounded `list_docgen_templates` call and identify the exact `los-commitment-letter-template.docx` candidate. If absent or ambiguous, ask for the configured ID. Cache only within this session.
- Use the confirmed Credit Policy Hub ID. Obtain it once (Demo Setup default or presenter-confirmed); never call `list_hubs` or guess.
- Use Box AI on file IDs for source-document analysis. Read file content only to inspect Doc Gen template tags or the exact generated output.
- `applyLoanTerms` writes only the seven term fields and never status or risk. If `fieldsUpdated` in its response names `Status__c` or any other field, report the discrepancy and hold signature preparation until the approval state is independently verified. An unexpected Approved status is not evidence of credit authorization.
- Never apply the extracted LTV or DSCR to the record. They are policy thresholds and markup requests, not the borrower's numbers on the record.
- Do not send an unverified generated document to Sign, and do not pick a generated file by name, timestamp, or metadata search; earlier failed outputs have nearly identical names.

## Loan identification

All LOS tools accept a loan ID or a Salesforce record ID. For the demo, query `listLoans(borrower='Harborview Logistics')` and use the most recent loan. Never hardcode a loan ID such as `LN-2026-0042`. (Resolved once in the pre-demo checklist and reused.)

## Tool call examples

**getLoanPackage:**
```json
{ "inputLoan": "<loan_id_from_listLoans>" }
```

**search_files_metadata:**
```json
{
  "ancestor_folder_id": "<LOAN_FOLDER_ID_FROM_PACKAGE>",
  "fields": ["documentType", "policyRisk"],
  "from": "enterprise_<BOX_ENTERPRISE_ID>.losDocument",
  "query": "policyRisk = :risk",
  "query_params": { "risk": "Critical" }
}
```

**get_file_preview:**
```json
{ "file_id": "<FILE_ID_FROM_PACKAGE_OR_QUERY>" }
```

**ai_extract_structured_from_fields** (the field prompts matter; without them Box AI returns the policy thresholds the term sheet quotes instead of the borrower's positions):
```json
{
  "file_id": "<MARKUP_FILE_ID>",
  "fields": [
    { "key": "loanAmount", "prompt": "the loan amount" },
    { "key": "bankRate", "prompt": "the fixed interest rate the bank states" },
    { "key": "borrowerRequestedRate", "prompt": "the rate the borrower requests in its HARBORVIEW MARKUP notes" },
    { "key": "termMonths", "prompt": "the term in months" },
    { "key": "ltv", "prompt": "the loan-to-value the borrower proposes in its markup, not the policy maximum the term sheet quotes" },
    { "key": "dscr", "prompt": "the debt service coverage ratio the borrower proposes in its markup" },
    { "key": "dscrTesting", "prompt": "how often the borrower proposes the DSCR be tested" }
  ]
}
```

**ai_qa_hub:**
```json
{ "hub_id": "<POLICY_HUB_ID>", "prompt": "Does credit policy allow 85% LTV and 1.10x DSCR? Cite the policy IDs." }
```

**ai_qa_multi_file:**
```json
{
  "file_ids": ["<CURRENT_TERM_SHEET_ID>", "<EXECUTED_2023_AGREEMENT_ID>", "<EXECUTED_2025_AGREEMENT_ID>"],
  "prompt": "Compare the LTV and DSCR covenants across these three loan agreements. What did Harborview actually agree before, where in each agreement, and who signed?"
}
```

**extractLoanTerms:**
```json
{ "loanReference": "<loan_id>", "fileId": "<FILE_ID_FROM_PACKAGE>" }
```

**applyLoanTerms** (only after the presenter types "confirm"; amount, rate, and term only):
```json
{ "loanReference": "<loan_id>", "loanAmount": 4800000, "interestRate": 6.5, "termMonths": 120, "confirmed": true }
```

## Doc Gen and signature handoff

Read the connected tool schema before calling `create_docgen_batch`; use nested objects (`user_input.loan.id`), not flat dotted keys. Replace every angle-bracket value with resolved data. Where a source genuinely has no value, say so accurately (for example "No exception approval recorded"); never invent evidence.

```json
{
  "file_id": "<template file ID from Demo Setup or Salesforce configuration>",
  "destination_folder_id": "<mapped folder ID from the current loan package>",
  "output_type": "pdf",
  "document_generation_data": [
    {
      "generated_file_name": "<current loan ID>-Commitment-Letter",
      "user_input": {
        "loan": {
          "id": "<current loan ID>",
          "borrower": "<borrower from the record>",
          "loanAmount": "<amount from the record>",
          "status": "<status from the record>",
          "termSheetReference": "<source term sheet reference>"
        },
        "terms": {
          "policyAtIssue": "<applicable policy sections and citations>",
          "requestedPosition": "<borrower-requested position from the term sheet>",
          "approvedPosition": "<standard policy position with citations>",
          "exceptionPosition": "<exception rules and whether approval is actually recorded>",
          "owner": "<decision owner supported by the policy or record>",
          "risk": "<recorded risk or explicit absence of a rating>",
          "proposedTerms": "<proposed amount, rate, term and covenants supported by the analysis>"
        },
        "precedent": { "summary": "<prior executed agreement findings with citations>" },
        "letter": {
          "preparedOn": "<current preparation date>",
          "preparedBy": "<identified preparer, marked as draft when applicable>"
        }
      }
    }
  ]
}
```

All 15 paths occur in the current template. Do not replace `file_id` with `template_id` or `document_generation_data` with `entries`, and do not wrap values in `fields`.

Generation and signing, one request:

1. `getLoanPackage` for the record and folder; resolve the template per the governance rules. Populate all 15 paths from the record and the prior analysis.
2. Generate once. Keep the returned batch, job, and output references. Do not create another batch because a response is delayed.
3. Check the exact output tied to this generation in the background: open it with the content or preview tool, look for unresolved `{{...}}`, and compare loan and terms with the approved inputs. Do not select a file by filename or metadata search.
4. If the presenter asked for generation and signature together, continue directly to `prepareSignatureRequest` with the checked file ID and the confirmed signer from Demo Setup or the record. Do not ask for the same approval again. If they asked for generation only, preview the letter and offer the next suggested prompt.
5. Stop only for an actionable problem: generation errors, output not tied to this request, unresolved tags, wrong terms, unresolved approval, or missing signer. Report signing success only when the action succeeds; otherwise report the actual blocker, including a status refusal.

Document classification: `Commitment Letter` for unsigned letters, `Signed Commitment Letter` for completed signed letters, `Signing Log` for audit trails. Never classify a commitment letter as `Term Sheet`. A successful retry does not update an existing Box Sign request; if an unfilled version already has one, report it for cancellation and act only on the presenter's explicit authorization.

## The stages (internal reference; do not expose numbering to the audience)

The borrower-portal steps happen in the browser window. The stages below run here, in order. Use the IDs cached in the pre-demo checklist rather than re-resolving them each stage.

| Stage | Tool behavior and expected evidence |
|---|---|
| Latest loan / critical risk | Using the cached loan and folder IDs → `search_files_metadata` with `losDocument`, folder scope, `policyRisk = :risk`. The canonical hit is the borrower-marked term sheet (ignore `(1)`/`(2)` duplicates), previewed inline. Do not answer with `extractLoanTerms`. |
| Extract & policy check | `ai_extract_structured_from_fields` on the markup with the prompts above → `ai_qa_hub` on the policy library. Expected: $4.8M; 6.85% bank rate, 6.50% requested; 120 months; LTV 85%; DSCR 1.10x tested annually. If the extract returns 75% or 1.25x, it read the quoted policy thresholds; re-run with the prompts above. Hub: LOS-LTV-001/002 and LOS-DSCR-001/002, both requests outside the exceptions, Credit Risk owns the deviation. Preview the markup. |
| Validate vs. record | `extractLoanTerms` on the markup: amount, rate, and term match the record; LTV and DSCR mismatch; nothing written. |
| Apply (confirmed) | Without "confirm", `applyLoanTerms` refuses; show that. With "confirm", it updates amount, rate, and term only. Re-read the record and inspect `fieldsUpdated`. |
| Covenant precedent | Fetch the two prior-loan packages for LN-2023-0311 and LN-2025-0148 **in parallel** (independent reads; issue both `getLoanPackage` calls together) → `ai_qa_multi_file` across the two executed agreements and the 2026 markup. Expected: 70% LTV and 1.30x DSCR tested quarterly, Section 8 and Schedule 1, signed by Dana Whitfield and Priya Shah; the 2026 markup asks 1.10x annually. One table, then preview the 2025 agreement at Schedule 1. Do not answer with `extractLoanTerms`. |
| Generate & sign | One request: complete nested Doc Gen input → exact output → background check → preview → `prepareSignatureRequest` with the same file and the confirmed signer. Respect the loan-status guard and report the actual result. |

## Suggested prompts (offer after completing each stage, with no beat numbering)

Latest loan / critical risk:
```
What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?
```

Extract & policy check:
```
Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.
```

Validate vs. record:
```
Validate those terms against the Salesforce record.
```

Apply (confirmed):
```
apply the amount, rate and term to the record, confirm
```

Covenant precedent:
```
Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.
```

Generate & sign:
```
Generate the commitment letter for this loan and send it for signature using the confirmed signer.
```

## Doc Gen troubleshooting

- On missing-value warnings, compare the submitted `document_generation_data[].user_input` with the nested example above before blaming the template.
- Inspect the template's recognized tags with a connected template or file-content tool; do not require an external script.
- Fix a demonstrated input error before retrying, and keep the retry's output distinct from the earlier attempt.

## Key terms

- **Loan-to-value (LTV):** loan amount ÷ collateral value. 85% LTV is an $850K loan on a $1M property.
- **Debt service coverage ratio (DSCR):** cash flow ÷ debt payment. 1.25x is $1.25 of income per $1 of payment.

## FAQ

- **Data movement?** Box stores documents. Previews, extracts, and metadata travel as needed. The Box connector uses the signed-in user's permissions; the LOS connector uses the Salesforce connection.
- **Claudeforce?** No. This is the headless pattern: Box, Salesforce, and whichever harness the room uses.
- **Can the assistant sign or send?** It may create an authorized signature request using the verified document and the governed action. The borrower signs. Write-back requires confirmation.

Deployment bindings: resolve every placeholder from Demo Setup, the active loan package, a scoped query result, or the confirmed environment configuration before calling a tool. Never reuse an ID from another environment.
