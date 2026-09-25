# Claude Code Router

Work from the Git root and use repository-relative paths in durable files.

Read `README.md` and exactly one persona instruction before exploring:

- Maintainer: `.claude/personas/maintainer.md`
- Operator: `.claude/personas/operator.md`
- Use-case creator (loan origination domain): `.claude/personas/use-case-creator.md`

Read another persona only when the completed primary workflow genuinely crosses roles. Search with `rg`, open only linked evidence, and summarize large outputs. Never load the full documentation tree by default.

External deploy, publish, share, sign, delete, or other mutations require explicit approval and confirmed targets. Keep secrets and environment IDs out of committed files.

## Response shape

Less is more. These bound every reply, and outrank any instinct to be thorough:

- **Lead with the answer or the result.** No preamble, no restating the request, no narrating what you are about to do.
- **Report what changed, not how you found it.** Tool-by-tool narration belongs in the transcript, not the reply.
- **Default to a few sentences.** A long reply needs a reason: several findings, or a decision the reader has to make.
- **Prose over tables.** A table earns its place only when the answer is genuinely tabular: three or more items compared on the same axes.
- **No closing offers, no recap of what you just did.** Stop when the answer stops.
- **Corrections are one sentence**, then continue. Do not tally past mistakes.
- **Say plainly what is verified and what is not.** "Deployed, 14/14 validation" beats a paragraph of hedging.

State a real problem in a sentence or two and keep going; do not write an essay about it.

## Presenting with the LOS and Box connectors

When the **LOS Loan Tools** and **Box** MCP connectors are loaded, the presenter skill in `skills/loan-origination-claude/SKILL.md` is the authority: its beats, prompts, tool call shapes, expected evidence and governance rules win over anything here. This section is the short form.

**Split the work by system.** Box holds the documents; LOS holds the record and the governed writes.

| Need | Connector and tool |
|---|---|
| The distribution facility loan, its folder and file IDs | LOS `listLoans(borrower='Harborview Logistics')`, then `getLoanPackage` |
| Documents by type, risk or status | Box `search_files_metadata`, template `losDocument`, scoped to the loan folder |
| What a document says | Box `ai_qa_single_file`, `ai_qa_multi_file`, `ai_extract_structured_from_fields` on file IDs |
| Credit policy | Box `ai_qa_hub` on the configured Credit Policy Hub |
| Show a document | Box `get_file_preview`, one per answer, after every citation |
| Compare a term sheet with the record | LOS `extractLoanTerms` (writes nothing) |
| Write terms to the record | LOS `applyLoanTerms`, only on a typed "confirm", amount, rate and term only |
| The commitment letter | Box `create_docgen_batch` with the 15 nested paths in the skill |
| Send for signature | LOS `prepareSignatureRequest` with the checked output and the confirmed signer |

**Static bindings, never discovered.** The metadata template key is `losDocument`. The Credit Policy Hub ID, the Doc Gen template ID, the Box enterprise ID and the signer come from Demo Setup or the environment configuration. Never call `list_metadata_templates`, `get_metadata_template_schema`, `list_hubs` or a folder listing; they return the whole enterprise and swamp the session.

**Loan identification.** Resolve the loan every session from `listLoans` and use the distribution facility loan, never the borrower's newest application from beat 1. In the borrower portal use the `recordId` the page passes. Never hardcode a loan ID; every LOS tool accepts a loan ID or a Salesforce record ID.

**Metadata first, folder scoped.** Search with `from: enterprise_<BOX_ENTERPRISE_ID>.losDocument`, `ancestor_folder_id` from the loan package, and `query: policyRisk = :risk`. Use enterprise scope only for a portfolio-wide question. Fall back to keyword search only for unclassified documents or content that is not an attribute.

**Doc Gen.** The complete `create_docgen_batch` contract lives in the skill and in `docs/DOCGEN-GUIDE.md`. A batch acceptance is not a letter: check the exact output tied to this generation for unresolved tags and correct terms before previewing or signing. Never select a generated file by name or metadata search; failed attempts have near-identical names. A retry does not update an existing Box Sign request.

**Governance.** Never apply the extracted LTV or DSCR. If `applyLoanTerms` reports any field beyond amount, rate and term in `fieldsUpdated`, stop and hold signature preparation. Report signing success only when the signature action succeeds.
