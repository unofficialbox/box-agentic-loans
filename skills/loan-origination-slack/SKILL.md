---
name: loan-origination-slack
description: Present the Acme Bank Harborview loan origination demo from Slackbot (Slack's AI assistant) with the LOS Loan Tools and Box MCP servers connected. Slackbot loads no skills and has no custom instructions, so this file is a primer the presenter pastes into the Slackbot direct message, plus the Slack-specific rules that differ from the Claude Desktop skill.
---

# LOS demo presenter (Slack)

Skill revision: 2026-09-11 s1.

Slack differs from every other harness in this repository in three ways, and this file exists because of them:

- **Nothing is loaded for you.** Slackbot discovers tools from the connected MCP servers and nothing else. It cannot read this file, a skill, a project, or custom instructions. The presenter pastes the **Primer** below as the first message of the direct message, and pastes the **Doc Gen contract** before the letter stage.
- **Direct message only, no previews.** Tools run only in a direct message with Slackbot, never in a channel. Slack does not render a Box document preview, so the preview rule from the other skills becomes: after citing a document, give its Box link.
- **Consent per tool.** Slackbot asks **Allow once**, **Always allow**, or **Deny** the first time each tool runs. Reads can be set to Always allow before the show; writes stay at Allow once so the human gate is visible.

Everything else (the beats, the prompts, the governance rules, the expected numbers) is the same as the Claude Desktop skill and is repeated here so this file stands alone.

## Primer

Paste this as the first message of the Slackbot direct message, once per rehearsal. It is short on purpose; Slackbot follows a recent message better than a long one.

```
You are presenting the Acme Bank loan origination demo. Two MCP servers are connected: LOS Loan Tools (Salesforce loan records) and Box (loan documents). Rules for this whole conversation:

1. Find the loan with listLoans for borrower "Harborview Logistics" and use the most recent one. Never guess a loan ID.
2. Find documents with Box metadata search on template losDocument scoped to the loan's folder (folder ID from getLoanPackage). Never list folder contents. Never call list_hubs or list_metadata_templates.
3. Read documents with Box AI on file IDs. For the marked-up term sheet, ask for the rate the borrower requests in its markup notes and the DSCR the borrower proposes, not the policy thresholds the sheet quotes.
4. Compare with the Salesforce record only with extractLoanTerms. It writes nothing.
5. Write to the record only with applyLoanTerms, only when my message contains the word "confirm", and only amount, rate, and term. Never apply LTV or DSCR. If the response says any field other than those three changed, tell me and stop.
6. Never offer buttons or options that apply terms, approve documents, generate documents, or send anything for signature. I type those requests.
7. Answer in bullets or one table, 60 words or fewer, finding first, no preamble, no tool names, no closing offers. Spell acronyms out on first use: loan-to-value (LTV), debt service coverage ratio (DSCR).
8. After citing a document, give its Box link.
9. After each answer, suggest the next prompt in a code block. The order is: latest loan and critical-risk documents; extract terms and check policy; validate against the record; apply amount, rate and term with confirm; compare covenants across prior executed loans; generate the commitment letter and send for signature.
10. Do not run code or build reports. The only generated document is the commitment letter produced by Box Doc Gen into the loan folder. If a call times out, check whether it completed before retrying; never retry applyLoanTerms without re-reading the record.
```

## Doc Gen contract

Paste this before the prompt that generates the commitment letter. Replace the two angle-bracket IDs first; the rest Slackbot fills from the analysis.

```
For the commitment letter, call Box create_docgen_batch exactly once with file_id <DOCGEN_TEMPLATE_ID>, destination_folder_id from the loan package, output_type pdf, and one document_generation_data entry whose generated_file_name is "<loan ID>-Commitment-Letter" and whose user_input is a nested object with these 15 paths, all filled from the record and the analysis, none left as placeholders:
loan.id, loan.borrower, loan.loanAmount, loan.status, loan.termSheetReference,
terms.policyAtIssue, terms.requestedPosition, terms.approvedPosition, terms.exceptionPosition, terms.owner, terms.risk, terms.proposedTerms,
precedent.summary, letter.preparedOn, letter.preparedBy.
Use nested objects, not dotted keys. Do not rename file_id or document_generation_data. Where a source has no value, say so in the field (for example "No exception approval recorded"); never invent evidence. Keep the batch and output references from the response, check that exact output for unresolved {{...}} tags and correct terms, then call prepareSignatureRequest with that file ID and signer <SIGNER_EMAIL>. Report success only if the signature action succeeds; otherwise report its refusal.
```

## Slack runtime rules (for the presenter)

- **Connections.** Both `LOS Loan Tools` and `Box` must show under **Your apps** in the Slackbot **Integrations** tab. Slackbot allows five connected apps at a time.
- **Consent.** Before the show, run the first prompt once and choose **Always allow** for `listLoans`, `getLoanPackage`, `extractLoanTerms`, `search_files_metadata`, `ai_extract_structured_from_fields`, `ai_qa_hub`, `ai_qa_multi_file`, and `get_file_preview`. Leave `applyLoanTerms`, `approveDocuments`, `create_docgen_batch`, and `prepareSignatureRequest` at **Allow once** so each write shows its consent card on stage.
- **Timeouts.** Every tool must answer within 60 seconds. Doc Gen is asynchronous and may return before the file exists; the primer tells Slackbot to use the batch reference from the response, not to search by name. If a signature call times out, ask `did the signature request for this loan already get created?` before repeating it.
- **No previews.** Expect a Box link after each cited document. Open the link in a browser tab if the room needs to see the markup.
- **Tool discovery.** If Slackbot describes the tools but never calls them, send `What tools are available from LOS Loan Tools?` once, then repeat the prompt.
- **Session hygiene.** A new direct message thread starts with nothing; paste the primer again. Do not present from a channel.

## Governance rules

- Metadata template key is STATIC: `losDocument`. Search with folder scope; never list folder contents; never call `list_metadata_templates`, `get_metadata_template_schema`, or `list_hubs`.
- Resolve the Doc Gen template ID from `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` or the operator's runtime defaults; paste it into the Doc Gen contract. Do not let Slackbot discover it by listing templates.
- Use the operator-confirmed Credit Policy Hub ID for policy questions. Slackbot needs it in the prompt the first time: `check these against credit policy in Box Hub <POLICY_HUB_ID>`.
- `applyLoanTerms` writes only the seven term fields and never status or risk. If `fieldsUpdated` names `Status__c` or any other field, hold signature preparation until the approval state is independently verified.
- Never apply the extracted LTV or DSCR. Never send an unverified generated document to Sign. Never pick a generated file by name; earlier failed outputs have nearly identical names.

## The beats and expected evidence

| Beat | Prompt | Expected |
|---|---|---|
| 2 | `What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?` | `listLoans` → `getLoanPackage` → Box metadata search, `policyRisk = Critical`, folder scope. One hit: the borrower-marked term sheet, with its Box link. Ignore `(1)`/`(2)` duplicate uploads. |
| 3 | `Extract loan terms from the marked-up term sheet for that loan and check them against credit policy in Box Hub <POLICY_HUB_ID>.` | Box AI extract: $4.8M; 6.85% bank rate, 6.50% requested; 120 months; LTV 85%; DSCR 1.10x tested annually. Hub: LOS-LTV-001/002, LOS-DSCR-001/002, both requests outside the exceptions, Credit Risk owns the deviation. |
| 3a | `Validate those terms against the Salesforce record.` | `extractLoanTerms`: amount, rate, term match; LTV and DSCR mismatch; nothing written. |
| 3b | `apply the amount, rate and term to the record, confirm` | First ask without "confirm" and show the refusal. With confirm: amount, rate, term only. Consent card appears. |
| 4 | `Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.` | `getLoanPackage` for LN-2023-0311 and LN-2025-0148, then Box AI multi-file: 70% LTV, 1.30x DSCR quarterly, Section 8 and Schedule 1, signed by Jordan Pike and Priya Shah; markup asks 1.10x annually. One table, Box link to the 2025 agreement. |
| 5 | Paste the Doc Gen contract, then: `Generate the commitment letter for this loan and send it for signature using the confirmed signer.` | One `create_docgen_batch`, output checked, then `prepareSignatureRequest`. Success only if the signature action succeeds; a status refusal is reported as such. |

Beats 1 and 6 happen in the borrower portal browser window, as in DEMO-CLICKPATH.

## Key terms

- **Loan-to-value (LTV):** loan amount ÷ collateral value. 85% LTV is an $850K loan on a $1M property.
- **Debt service coverage ratio (DSCR):** cash flow ÷ debt payment. 1.25x is $1.25 of income per $1 of payment.

Deployment bindings: `<DOCGEN_TEMPLATE_ID>`, `<SIGNER_EMAIL>`, and `<POLICY_HUB_ID>` come from the environment's runtime defaults file, never from another environment and never from a listing call.
