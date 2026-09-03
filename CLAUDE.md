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
- **Prose over tables.** A table earns its place only when the answer is genuinely tabular -- three or more items compared on the same axes.
- **No closing offers, no recap of what you just did.** Stop when the answer stops.
- **Corrections are one sentence**, then continue. Do not tally past mistakes.
- **Say plainly what is verified and what is not.** "Deployed, 14/14 validation" beats a paragraph of hedging.

State a real problem in a sentence or two and keep going; do not write an essay about it.
