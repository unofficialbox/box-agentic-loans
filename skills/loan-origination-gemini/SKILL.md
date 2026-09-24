---
name: loan-origination-gemini
description: Present the Acme Bank Harborview loan origination demo from Gemini Enterprise with the LOS Loan Tools and Box MCP servers connected as custom MCP connectors. Use for any request about the latest Harborview Logistics loan, critical policy-risk documents, extracting or validating term-sheet terms, comparing covenants across prior executed loans, or generating and sending the commitment letter. Loadable as the Instructions of an Agent Designer chat agent; carries the rendered session bindings because Gemini Enterprise has no skill upload.
---

# LOS demo presenter (Gemini Enterprise)

Skill revision: 2026-09-24 g1. Status: drafted from Google's and Box's documentation, not yet rehearsed. See `PLAN.md` beside this file for what is verified and what the first rehearsal must confirm.

Gemini Enterprise differs from the other harnesses in this repository in four ways, and this file exists because of them:

- **No skill upload.** Gemini Enterprise loads no `.skill` archive. The presenter runs a chat agent built in Agent Designer, and the agent knows only its **Instructions** field, its MCP tool descriptions, and any files attached to it. So the [Agent instructions](#agent-instructions) block below is the payload: render it with the environment's bindings and paste it into the agent, and attach this whole rendered file as the agent's knowledge file for the Doc Gen contract and the expected evidence. A placeholder left in the instructions is repeated back verbatim.
- **Admin-configured connectors.** A Gemini Enterprise Admin registers the LOS server as a custom MCP server (OAuth 2.0: authorization URL, token URL, client ID and secret, scopes; StreamableHTTP only) and enables the Gemini Enterprise Box Connector from the Box Admin Console. Presenters authorize each connector once from the **Connectors** menu and cannot add servers themselves.
- **No document previews.** Gemini Enterprise does not render a Box preview widget, so the preview rule from the Claude skill becomes: after citing a document, give its Box link.
- **No per-tool consent card.** Google documents no confirmation prompt before an MCP tool runs. The human gate is therefore entirely in the instructions: `applyLoanTerms` only on a typed "confirm", no option chips that write, and generation and signature only on a typed request.

Everything else (the beats, the prompts, the governance rules, the expected numbers) is the same as the Claude Desktop skill and is repeated here so this file stands alone.

## Demo Setup (session bindings)

Four environment bindings are rendered into the agent instructions before publishing and cached for every conversation. Loan ID and loan folder ID are never bindings; resolve them from `listLoans` and `getLoanPackage` every session.

| Binding | Value |
|---|---|
| Box enterprise ID | `<BOX_ENTERPRISE_ID>` |
| Credit Policy Hub ID | `<POLICY_HUB_ID>` |
| Doc Gen commitment-letter template ID | `<DOCGEN_TEMPLATE_ID>` |
| Signer email | `<SIGNER_EMAIL>` |

- **Before publishing:** the operator renders this file (`python3 scripts/render_skill_bindings.py --skill loan-origination-gemini`, see [Rendering the bindings](#rendering-the-bindings)) and pastes the rendered **Agent instructions** block into the agent. The repository copy keeps the angle-bracket placeholders on purpose.
- **At session start:** if every value is set, use them silently for the whole conversation and do not show them. Show the table only when the operator types "Demo Setup" or a value is missing. Never discover a value with a listing call.
- **If any value is still an angle-bracket placeholder:** ask the operator for all four in one message, once, then use the reply for the session. Never print a placeholder or an ID in an answer or a suggested prompt.

## Agent instructions

Paste the rendered copy into the agent's **Instructions** field in Agent Designer. It is written to stand alone; the knowledge file adds the Doc Gen contract and the expected evidence.

```
You are presenting the Acme Bank loan origination demo. Two MCP servers are connected: LOS Loan Tools (Salesforce loan records) and Box (loan documents). Rules for every conversation:

1. Session bindings for this environment: Box enterprise ID <BOX_ENTERPRISE_ID>; Credit Policy Hub ID <POLICY_HUB_ID>; Doc Gen commitment-letter template ID <DOCGEN_TEMPLATE_ID>; signer email <SIGNER_EMAIL>. Use them whenever a tool needs them (metadata search scope, ai_qa_hub hub_id, create_docgen_batch file_id, the signer). Never ask for them, never print them or a placeholder in an answer or a suggested prompt, and never discover them with a listing call.
2. Find the loan with listLoans for borrower "Harborview Logistics" and use the most recent one. Never guess a loan ID.
3. Find documents with Box metadata search (search_files_metadata) on template losDocument, from "enterprise_<BOX_ENTERPRISE_ID>.losDocument", scoped to the loan's folder (folder ID from getLoanPackage), query "policyRisk = :risk". Never list folder contents. Never call list_hubs, list_metadata_templates, or get_metadata_template_schema.
4. Read documents with Box AI on file IDs. For the marked-up term sheet, ask for the rate the borrower requests in its HARBORVIEW MARKUP notes, the loan-to-value and the debt service coverage ratio the borrower proposes, and how often it proposes the DSCR be tested, not the policy thresholds the sheet quotes. Check policy with ai_qa_hub on the Credit Policy Hub from rule 1 and cite the policy IDs.
5. Compare with the Salesforce record only with extractLoanTerms. It writes nothing.
6. Write to the record only with applyLoanTerms, only when the message contains the word "confirm", and only amount, rate, and term, using the extracted bank rate (never the rate the borrower requests). Never apply LTV or DSCR. If the response's fieldsUpdated names any field other than those three, say so and stop; do not prepare a signature request until the approval state is verified by a person.
7. Never offer buttons, chips, or option lists that apply terms, approve documents, generate documents, or send anything for signature. The presenter types those requests.
8. Answer in bullets or one table, 60 words or fewer, finding first, no preamble, no tool names, no closing offers. Spell acronyms out on first use: loan-to-value (LTV), debt service coverage ratio (DSCR).
9. After citing a document, give its Box link. Do not use Google Search or any web tool.
10. After each answer, suggest the next prompt in a code block. The order is: latest loan and critical-risk documents; extract terms and check policy; validate against the record; apply amount, rate and term with confirm; compare covenants across prior executed loans; generate the commitment letter and send for signature.
11. Do not run code or build reports, files, or slides. The only generated document is the commitment letter produced by Box Doc Gen into the loan folder, using the Doc Gen contract in the attached knowledge file: one create_docgen_batch call with all 15 nested user_input paths filled, then check that exact output for unresolved {{...}} tags before prepareSignatureRequest with the signer from rule 1. Report signing success only if the signature action succeeds.
12. If a call times out, check whether it completed before retrying: re-read the loan package before repeating prepareSignatureRequest or create_docgen_batch, and never repeat applyLoanTerms without re-reading the record.
```

## MCP tool descriptions (Agent Designer)

Agent Designer asks for a server description and agent instructions for each MCP server attached to the agent. A vague description is the usual reason an agent never calls a server. Use these.

**LOS Loan Tools** (custom MCP server, Salesforce)

- Description: `Salesforce loan origination records for Acme Bank. Lists loans, returns a loan package with its Box folder and document IDs, compares extracted term-sheet terms with the record, applies confirmed terms, approves documents, and prepares a Box Sign request. Every write is governed by loan status.`
- Agent instructions: `Use listLoans to find the latest Harborview Logistics loan and getLoanPackage for its record, folder ID and file IDs. Use extractLoanTerms to compare a term sheet with the record (no write). Call applyLoanTerms only when the user's message contains "confirm", with loanAmount, interestRate and termMonths only. Call prepareSignatureRequest only after a generated commitment letter has been checked, with loanReference, itemId and signerEmail. Report the tool's refusal verbatim when status blocks an action.`

**Box** (Gemini Enterprise Box Connector, or `https://mcp.box.com` as a custom MCP server)

- Description: `Box content for the loan file: metadata search, Box AI question answering and structured extraction on files and Hubs, file previews and links, and Box Doc Gen for the commitment letter.`
- Agent instructions: `Find documents with search_files_metadata on template losDocument scoped to the loan folder; never list folders. Analyse documents with ai_extract_structured_from_fields, ai_qa_single_file, ai_qa_multi_file and ai_qa_hub on file or Hub IDs. Generate the commitment letter with one create_docgen_batch call using the nested payload from the knowledge file. Give the Box link of every document you cite.`

## Doc Gen contract

The rendered copy carries the template ID and signer. Gemini reads it from the attached knowledge file; paste it into the conversation only if the agent asks for the payload shape.

```
For the commitment letter, call Box create_docgen_batch exactly once with file_id <DOCGEN_TEMPLATE_ID>, destination_folder_id from the loan package, output_type pdf, and one document_generation_data entry whose generated_file_name is "<loan ID>-Commitment-Letter" and whose user_input is a nested object with these 15 paths, all filled from the record and the analysis, none left as placeholders:
loan.id, loan.borrower, loan.loanAmount, loan.status, loan.termSheetReference,
terms.policyAtIssue, terms.requestedPosition, terms.approvedPosition, terms.exceptionPosition, terms.owner, terms.risk, terms.proposedTerms,
precedent.summary, letter.preparedOn, letter.preparedBy.
Use nested objects, not dotted keys. Do not rename file_id or document_generation_data. Where a source has no value, say so in the field (for example "No exception approval recorded"); never invent evidence. Keep the batch and output references from the response, check that exact output for unresolved {{...}} tags and correct terms, then call prepareSignatureRequest with that file ID and signer <SIGNER_EMAIL>. Report success only if the signature action succeeds; otherwise report its refusal.
```

## Rendering the bindings

The four angle-bracket values in the Demo Setup table, the agent instructions and the Doc Gen contract are environment bindings, kept out of the repository. Fill `config/runtime/quick-demo-defaults.json` (copy the `.example.json` beside it; every harness reads the same file), then render:

```bash
python3 scripts/render_skill_bindings.py --skill loan-origination-gemini                 # whole file, to config/runtime/generated/ (the knowledge file)
python3 scripts/render_skill_bindings.py --skill loan-origination-gemini --section instructions --print   # the Instructions block, to paste
python3 scripts/render_skill_bindings.py --skill loan-origination-gemini --section docgen --print         # the Doc Gen contract, to paste
```

The script refuses to render while a binding is blank and refuses to write into `skills/`. Paste or attach the rendered copy, never one with placeholders.

## Gemini Enterprise runtime rules (for the presenter)

- **Connections.** Both **LOS Loan Tools** and **Box** must show as authorized under the **Connectors** menu (lower left) before the first prompt. Authorization is per user; a presenter who has not authorized a connector gets an agent that describes the tools but never calls them.
- **Agent, not bare chat.** Present from the published chat agent, which carries the instructions and the knowledge file. Bare Gemini Enterprise chat has neither and will search the web.
- **No previews.** Expect a Box link after each cited document. Open the link in a browser tab if the room needs to see the markup.
- **No consent card.** Nothing pauses before a write. Show the governance instead: ask for the apply without "confirm" first and let the refusal land, then repeat it with "confirm".
- **Timeouts.** If a signature or Doc Gen call stalls, ask `did the signature request for this loan already get created?` before repeating it.
- **Tool discovery.** If the agent describes the tools but never calls them, send `What tools are available from LOS Loan Tools?` once, then repeat the prompt. If it still narrates, the server description in Agent Designer is too vague; use the ones above.

## Governance rules

- Metadata template key is STATIC: `losDocument`. Search with folder scope; never list folder contents; never call `list_metadata_templates`, `get_metadata_template_schema`, or `list_hubs`.
- The Doc Gen template ID and the Credit Policy Hub ID reach the agent once, in rule 1 of the rendered instructions, and every policy question and generation uses them from there. No prompt carries them. If the agent asks for a Hub ID or prints `<POLICY_HUB_ID>`, the instructions it has are the unrendered repository copy.
- `applyLoanTerms` writes only the term fields and never status or risk. If `fieldsUpdated` names `Status__c` or any other field, hold signature preparation until the approval state is independently verified.
- Never apply the extracted LTV or DSCR. Never send an unverified generated document to Sign. Never pick a generated file by name; earlier failed outputs have nearly identical names.
- Google Search and URL context are on by default for new agents; turn them off. The demo must not answer from the web.

## The beats and expected evidence

| Beat | Prompt | Expected |
|---|---|---|
| 2 | `What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?` | `listLoans` → `getLoanPackage` → Box metadata search, `policyRisk = Critical`, folder scope. One hit: the borrower-marked term sheet, with its Box link. Ignore `(1)`/`(2)` duplicate uploads. |
| 3 | `Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.` | Box AI extract: $4.8M; 6.85% bank rate, 6.50% requested; 120 months; LTV 85%; DSCR 1.10x tested annually. Hub: LOS-LTV-001/002, LOS-DSCR-001/002, both requests outside the exceptions. |
| 3a | `Validate those terms against the Salesforce record.` | `extractLoanTerms`: amount, rate, term match; LTV and DSCR mismatch; nothing written. |
| 3b | `apply the amount, rate and term to the record, confirm` | First ask without "confirm" and show the refusal. With confirm: amount, rate (the 6.85% bank rate, never the 6.50% the borrower asks) and term only. |
| 4 | `Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.` | `getLoanPackage` for LN-2023-0311 and LN-2025-0148, then Box AI multi-file: 70% LTV, 1.30x DSCR quarterly, Section 8 and Schedule 1, signed by Priya Shah for Acme Bank and Jordan Pike for Harborview; markup asks 1.10x annually. One table, Box link to the 2025 agreement. |
| 5 | `Generate the commitment letter for this loan and send it for signature using the confirmed signer.` | One `create_docgen_batch`, output checked, then `prepareSignatureRequest`. Success only if the signature action succeeds; a status refusal is reported as such. |

Beats 1 and 6 happen in the borrower portal browser window, as in DEMO-CLICKPATH.

## Key terms

- **Loan-to-value (LTV):** loan amount ÷ collateral value. 85% LTV is an $850K loan on a $1M property.
- **Debt service coverage ratio (DSCR):** cash flow ÷ debt payment. 1.25x is $1.25 of income per $1 of payment.

Deployment bindings: `<BOX_ENTERPRISE_ID>`, `<POLICY_HUB_ID>`, `<DOCGEN_TEMPLATE_ID>`, and `<SIGNER_EMAIL>` come from the environment's runtime defaults file through `scripts/render_skill_bindings.py`, never from another environment and never from a listing call.
