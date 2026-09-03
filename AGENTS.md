# AI Assistant Router

Work from the Git root. Use repository-relative paths in durable files.

Read `README.md` and exactly one persona file before exploring further:

- Repository maintenance: `.codex/personas/maintainer.md`
- Environment setup, deployment, or demo operation: `.codex/personas/operator.md`
- Loan origination domain, architecture, controls, or value-story changes: `.codex/personas/use-case-creator.md`

If a task spans personas, finish the primary workflow before reading another persona. Search with `rg` and open only directly relevant files. Never load the entire documentation tree.

Never expose secrets or reuse environment identifiers. External deploy, publish, share, sign, delete, or other mutations require explicit approval and confirmed target identifiers.

## Response shape

Less is more. These bound every reply, and outrank any instinct to be thorough:

- **Lead with the answer or the result.** No preamble, no restating the request, no narrating what you are about to do.
- **Report what changed, not how you found it.** Tool-by-tool narration belongs in the transcript, not the reply.
- **Default to a few sentences.** A long reply needs a reason: several findings, or a decision the reader has to make.
- **Prose over tables.** A table earns its place only when the answer is genuinely tabular -- three or more items compared on the same axes.
- **No closing offers, no recap of what you just did.** Stop when the answer stops.
- **Corrections are one sentence**, then continue. Do not tally past mistakes.
- **Say plainly what is verified and what is not.** "Deployed, 14/14 validation" beats a paragraph of hedging.

State a real problem in a sentence or two and keep going; do not write an essay about it.
