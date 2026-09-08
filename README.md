# Loan Origination Demo

This is the canonical loan demo repository. Application changes, deployment instructions and presenter materials are maintained here; the Dreamforce fork is retained for historical reference.

A commercial loan origination demo on Box + Salesforce: a governed loan file in Box, a structured `LOS_Loan__c` record in Salesforce, and governed Apex actions between them, presented headless through whichever harness the room uses (Claude Desktop, ChatGPT, Slack, or Agentforce). A borrower signs in to the Acme Borrower Portal, applies, and uploads documents that Box AI classifies as they land; a loan officer's assistant then extracts the terms of a marked-up term sheet, reads them against the credit policy library and the borrower's two closed loans, drafts the commitment letter, and is refused signature because the loan is still in Underwriting. Loan-file bytes never flow into Salesforce, and term write-back requires explicit confirmation, and signature preparation enforces the loan state; draft generation requires a human request.

## Present

- [`DEMO-CLICKPATH.md`](DEMO-CLICKPATH.md): preflight, the six beats with copy-paste prompts and expected answers, the Copilot rehearsal, and the honest answers.
- [`skills/los-demo/SKILL.md`](skills/los-demo/SKILL.md): tool contracts and answer rules for an AI harness; presenter prompts remain in the clickpath.

- [`docs/PRESENTING.md`](docs/PRESENTING.md): stage timing, rehearsal acceptance, reset ownership and the portable presenter library.

## Set up

[`docs/SETUP.md`](docs/SETUP.md): a new Box enterprise and Salesforce org, the Box preview, the Loan Copilot, and the administrator checklist. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains the boundary and the governed actions; [`docs/HANDOFF.md`](docs/HANDOFF.md) and [`docs/paved-path.md`](docs/paved-path.md) are for whoever maintains the code.

## Source map

- `config/` authored BCL specs and gitignored runtime JSON; `scripts/` generators, operator automation and validation; `tests/` offline checks.
- `los-salesforce-project/` Salesforce metadata, the React UI Bundle and the packaged sample data; `sample-data/policies/` the credit policy library.
- `output/` generated fixtures, Doc Gen templates and demo screenshots; `docs/diagrams/` Mermaid sources and renders.

## Validate

```bash
python3 scripts/validate_los.py                    # offline matrix; expect every check passed, live receipts skipped
python3 scripts/validate_los.py --presenter-ready  # fails closed without current secret-free receipts
```

AI assistants read this file and exactly one persona under `.claude/personas/` before exploring further. Keep credentials, org and enterprise IDs, and machine-specific paths out of committed files.

## Consolidated borrower security

See [SECURITY.md](docs/SECURITY.md) for record authorization, per-file preview grants, upload-only tokens and required live checks. The web app has no officer mode.
