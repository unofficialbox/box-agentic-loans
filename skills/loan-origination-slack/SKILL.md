---
name: loan-origination-slack
description: Present the Acme Bank Harborview loan origination demo from Slackbot (Slack's AI assistant) with the LOS Loan Tools and Box MCP servers connected. Use for any request about the latest Harborview Logistics loan, critical policy-risk documents, extracting or validating term-sheet terms, comparing covenants across prior executed loans, or generating and sending the commitment letter. Loadable as a Slackbot skill; also carries a primer for workspaces where Slackbot loads no skills.
---

# LOS demo presenter (Slack)

Skill revision: 2026-09-15 s2.

Slack differs from every other harness in this repository in three ways, and this file exists because of them:

- **This file is what Slackbot knows.** When Slackbot loads this skill it shows *Used Loan Origination Slack* under its answer, and it has no project, custom instructions, or runtime defaults beyond what is written here. So the four environment bindings must be in this file when it is uploaded (see [Demo Setup](#demo-setup-session-bindings)); a placeholder left in the skill is repeated back verbatim, which is why an unrendered copy asks for the Hub ID on every run. Where Slackbot loads no skills at all, the presenter pastes the **Primer** below as the first message of the direct message and the **Doc Gen contract** before the letter stage.
- **Direct message only, no previews.** Tools run only in a direct message with Slackbot, never in a channel. Slack does not render a Box document preview, so the preview rule from the other skills becomes: after citing a document, give its Box link.
- **Consent per tool.** Slackbot asks **Allow once**, **Always allow**, or **Deny** the first time each tool runs. Reads can be set to Always allow before the show; writes stay at Allow once so the human gate is visible.

Everything else (the beats, the prompts, the governance rules, the expected numbers) is the same as the Claude Desktop skill and is repeated here so this file stands alone.

## Demo Setup (session bindings)

Four environment bindings are confirmed once per session and cached. Loan ID and loan folder ID are never bindings; resolve them from `listLoans` and `getLoanPackage` every session.

| Binding | Value |
|---|---|
| Box enterprise ID | `<BOX_ENTERPRISE_ID>` |
| Credit Policy Hub ID | `<POLICY_HUB_ID>` |
| Doc Gen commitment-letter template ID | `<DOCGEN_TEMPLATE_ID>` |
| Signer email | `<SIGNER_EMAIL>` |

- **Before upload:** the operator renders this file with the environment's values (`python3 scripts/render_skill_bindings.py --skill loan-origination-slack`, see [Rendering the bindings](#rendering-the-bindings)) and uploads the rendered copy as the Slackbot skill. The repository copy keeps the angle-bracket placeholders on purpose.
- **At session start:** if every value in the table is set, use them silently for the whole conversation (the metadata search scope, `ai_qa_hub` `hub_id`, `create_docgen_batch` `file_id`, and the signer) and do not show them. Show the table only when the operator types "Demo Setup" or a value is missing. Never discover a value with a listing call.
- **If any value above is still an angle-bracket placeholder:** ask the operator for all four in one message, once, then cache the reply for the session. Never print a placeholder, and never put a Hub ID or any other binding into an answer or a suggested prompt; the prompts below are complete without them.
- Never offer buttons or options that apply terms, approve documents, generate documents, or send for signature. The only next step you offer is the next prompt in a code block.

## Primer

Only for a Slackbot that loads no skills (its answers never show *Used Loan Origination Slack*). Paste the rendered copy as the first message of the direct message, once per rehearsal. It is short on purpose; Slackbot follows a recent message better than a long one. The repository copy still has angle-bracket placeholders in rule 1, and Slackbot repeats a placeholder back instead of using a Hub ID it was never given.

```
You are presenting the Acme Bank loan origination demo. Two MCP servers are connected: LOS Loan Tools (Salesforce loan records) and Box (loan documents). Rules for this whole conversation:

1. Session bindings for this environment: Box enterprise ID <BOX_ENTERPRISE_ID>; Credit Policy Hub ID <POLICY_HUB_ID>; Doc Gen commitment-letter template ID <DOCGEN_TEMPLATE_ID>; signer email <SIGNER_EMAIL>. Use them whenever a tool needs them (metadata search scope, ai_qa_hub hub_id, create_docgen_batch file_id, the signer). Never ask me for them, never print a placeholder or an ID in an answer or a suggested prompt, and never discover them with a listing call.
2. Find the loan with listLoans for borrower "Harborview Logistics" and use the most recent one. Never guess a loan ID.
3. Find documents with Box metadata search on template losDocument scoped to the loan's folder (folder ID from getLoanPackage). Never list folder contents. Never call list_hubs or list_metadata_templates.
4. Read documents with Box AI on file IDs. For the marked-up term sheet, ask for the rate the borrower requests in its markup notes and the DSCR the borrower proposes, not the policy thresholds the sheet quotes. Check policy with ai_qa_hub on the Credit Policy Hub from rule 1.
5. Compare with the Salesforce record only with extractLoanTerms. It writes nothing.
6. Write to the record only with applyLoanTerms, only when my message contains the word "confirm", and only amount, rate, and term. Never apply LTV or DSCR. If the response says any field other than those three changed, tell me and stop.
7. Never offer buttons or options that apply terms, approve documents, generate documents, or send anything for signature. I type those requests.
8. Answer in bullets or one table, 60 words or fewer, finding first, no preamble, no tool names, no closing offers. Spell acronyms out on first use: loan-to-value (LTV), debt service coverage ratio (DSCR).
9. After citing a document, give its Box link.
10. After each answer, suggest the next prompt in a code block. The order is: latest loan and critical-risk documents; extract terms and check policy; validate against the record; apply amount, rate and term with confirm; compare covenants across prior executed loans; generate the commitment letter and send for signature.
11. Do not run code or build reports. The only generated document is the commitment letter produced by Box Doc Gen into the loan folder. If a call times out, check whether it completed before retrying; never retry applyLoanTerms without re-reading the record.
```

## Doc Gen contract

Paste this before the prompt that generates the commitment letter. The rendered copy already carries the template ID and signer; if you pasted the repository copy, replace the two angle-bracket values first. The rest Slackbot fills from the analysis.

```
For the commitment letter, call Box create_docgen_batch exactly once with file_id <DOCGEN_TEMPLATE_ID>, destination_folder_id from the loan package, output_type pdf, and one document_generation_data entry whose generated_file_name is "<loan ID>-Commitment-Letter" and whose user_input is a nested object with these 15 paths, all filled from the record and the analysis, none left as placeholders:
loan.id, loan.borrower, loan.loanAmount, loan.status, loan.termSheetReference,
terms.policyAtIssue, terms.requestedPosition, terms.approvedPosition, terms.exceptionPosition, terms.owner, terms.risk, terms.proposedTerms,
precedent.summary, letter.preparedOn, letter.preparedBy.
Use nested objects, not dotted keys. Do not rename file_id or document_generation_data. Where a source has no value, say so in the field (for example "No exception approval recorded"); never invent evidence. Keep the batch and output references from the response, check that exact output for unresolved {{...}} tags and correct terms, then call prepareSignatureRequest with that file ID and signer <SIGNER_EMAIL>. Report success only if the signature action succeeds; otherwise report its refusal.
```

## Rendering the bindings

The four angle-bracket values in the Demo Setup table, the primer and the Doc Gen contract are environment bindings, kept out of the repository. Fill `config/runtime/quick-demo-defaults.json` (copy the `.example.json` beside it; the Quick skill and the Demo Setup card read the same file), then render:

```bash
python3 scripts/render_skill_bindings.py --skill loan-origination-slack            # whole file, to config/runtime/generated/
python3 scripts/render_skill_bindings.py --section primer --print                  # just the primer block, to paste
python3 scripts/render_skill_bindings.py --section docgen --print                  # just the Doc Gen contract, to paste
```

The script refuses to render while a binding is blank and refuses to write into `skills/`. `python3 scripts/package_loan_skill.py --skill loan-origination-slack --bindings config/runtime/quick-demo-defaults.json --output /tmp/loan-origination-slack.skill` builds the rendered archive for a skill upload. Upload or hand presenters the rendered copy, never one with placeholders.

## Slack runtime rules (for the presenter)

- **Connections.** Both `LOS Loan Tools` and `Box` must show under **Your apps** in the Slackbot **Integrations** tab. Slackbot allows five connected apps at a time.
- **Consent.** Before the show, run the first prompt once and choose **Always allow** for `listLoans`, `getLoanPackage`, `extractLoanTerms`, `search_files_metadata`, `ai_extract_structured_from_fields`, `ai_qa_hub`, `ai_qa_multi_file`, and `get_file_preview`. Leave `applyLoanTerms`, `approveDocuments`, `create_docgen_batch`, and `prepareSignatureRequest` at **Allow once** so each write shows its consent card on stage.
- **Timeouts.** Every tool must answer within 60 seconds. Doc Gen is asynchronous and may return before the file exists; the primer tells Slackbot to use the batch reference from the response, not to search by name. If a signature call times out, ask `did the signature request for this loan already get created?` before repeating it.
- **No previews.** Expect a Box link after each cited document. Open the link in a browser tab if the room needs to see the markup.
- **Tool discovery.** If Slackbot describes the tools but never calls them, send `What tools are available from LOS Loan Tools?` once, then repeat the prompt.
- **Skill or primer.** If Slackbot shows *Used Loan Origination Slack* under an answer, the skill is loaded and no primer is needed. Otherwise paste the rendered primer; a new direct message thread starts with nothing, so paste it again there. Do not present from a channel.

## Governance rules

- Metadata template key is STATIC: `losDocument`. Search with folder scope; never list folder contents; never call `list_metadata_templates`, `get_metadata_template_schema`, or `list_hubs`.
- Resolve the Doc Gen template ID from `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` or the operator's runtime defaults; paste it into the Doc Gen contract. Do not let Slackbot discover it by listing templates.
- The Credit Policy Hub ID reaches Slackbot once, in the Demo Setup table of the rendered skill (or rule 1 of the rendered primer), and every policy question uses it from there. No prompt carries it, so the presenter never types it and Slackbot never asks. If Slackbot still asks for a Hub ID or prints `<POLICY_HUB_ID>`, the copy it loaded is the unrendered repository file.
- `applyLoanTerms` writes only the seven term fields and never status or risk. If `fieldsUpdated` names `Status__c` or any other field, hold signature preparation until the approval state is independently verified.
- Never apply the extracted LTV or DSCR. Never send an unverified generated document to Sign. Never pick a generated file by name; earlier failed outputs have nearly identical names.

## The beats and expected evidence

| Beat | Prompt | Expected |
|---|---|---|
| 2 | `What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?` | `listLoans` → `getLoanPackage` → Box metadata search, `policyRisk = Critical`, folder scope. One hit: the borrower-marked term sheet, with its Box link. Ignore `(1)`/`(2)` duplicate uploads. |
| 3 | `Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.` | Box AI extract: $4.8M; 6.85% bank rate, 6.50% requested; 120 months; LTV 85%; DSCR 1.10x tested annually. Hub: LOS-LTV-001/002, LOS-DSCR-001/002, both requests outside the exceptions, Credit Risk owns the deviation. |
| 3a | `Validate those terms against the Salesforce record.` | `extractLoanTerms`: amount, rate, term match; LTV and DSCR mismatch; nothing written. |
| 3b | `apply the amount, rate and term to the record, confirm` | First ask without "confirm" and show the refusal. With confirm: amount, rate, term only. Consent card appears. |
| 4 | `Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.` | `getLoanPackage` for LN-2023-0311 and LN-2025-0148, then Box AI multi-file: 70% LTV, 1.30x DSCR quarterly, Section 8 and Schedule 1, signed by Dana Whitfield and Priya Shah; markup asks 1.10x annually. One table, Box link to the 2025 agreement. |
| 5 | Paste the Doc Gen contract, then: `Generate the commitment letter for this loan and send it for signature using the confirmed signer.` | One `create_docgen_batch`, output checked, then `prepareSignatureRequest`. Success only if the signature action succeeds; a status refusal is reported as such. |

Beats 1 and 6 happen in the borrower portal browser window, as in DEMO-CLICKPATH.

## Key terms

- **Loan-to-value (LTV):** loan amount ÷ collateral value. 85% LTV is an $850K loan on a $1M property.
- **Debt service coverage ratio (DSCR):** cash flow ÷ debt payment. 1.25x is $1.25 of income per $1 of payment.

Deployment bindings: `<BOX_ENTERPRISE_ID>`, `<POLICY_HUB_ID>`, `<DOCGEN_TEMPLATE_ID>`, and `<SIGNER_EMAIL>` come from the environment's runtime defaults file through `scripts/render_skill_bindings.py`, never from another environment and never from a listing call.
