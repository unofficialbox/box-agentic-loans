# Stage, rehearsal and reset

## Two windows, one officer harness

Dana uses the borrower portal. The officer uses one rehearsed Claude, Grok or ChatGPT session with both Box and LOS connectors under Context. Copilot is a separate optional booth rehearsal. The officer web Explorer is excluded from the consolidated portal.

[DEMO-CLICKPATH.md](../DEMO-CLICKPATH.md) is the sole source of technical prompts. Box MCP discovers content, previews sources and generates the draft with Doc Gen. Salesforce resolves loan facts, applies explicitly confirmed terms and enforces the signature state guard. The Apex generation wrapper is the documented fallback when Box Doc Gen is unavailable. Direct Doc Gen uses the human's conversational authorization, not an Apex approval gate; verify record-derived facts and destination before submitting it.

## Timing

The complete six-beat clickpath budgets **11 minutes**. A shortened **6:30 stage variant** starts with a pre-created application and already classified documents: show the intake result rather than upload live, then run the same officer prompts. Label that setup honestly. If live intake is required, use the full 11-minute path. These are budgets, not measured runtimes.

| Segment | Full walkthrough | Shortened stage variant |
|---|---|---|
| Borrower intake / intake result | 3:10 | 0:30 |
| Metadata discovery | 0:55 | 0:40 |
| Extraction, policy and confirmation | 2:25 | 1:50 |
| Precedent | 0:55 | 0:45 |
| Draft generation and signature refusal | 1:55 | 1:45 |
| Borrower view and close | 1:40 | 1:00 |

## Before doors

- Sign Dana in privately and confirm her borrower account and expected loans.
- Load both connectors in the officer session and verify source preview and Doc Gen tools.
- Check the two precedent loans are Closed and the current loan is Underwriting.
- Keep the New applications Salesforce view available to the operator, outside the officer's primary stage surface.
- Confirm the deployed borrower token checks deny other-account records and Internal files. A hidden row alone is not proof.
- Name the operator and cleanup owner in the private rehearsal record before starting.

## Rehearsal acceptance

Run three complete passes in the chosen variant. Each must prove all eight checks:

1. Markup preview renders and the intended covenant text is visible.
2. Critical-risk metadata search is scoped to the intended loans root.
3. Extraction distinguishes requested terms, recorded measurements and policy thresholds; unconfirmed write-back is refused.
4. Policy citations identify the LTV/DSCR standard and exception, and the Credit Risk owner.
5. Both closed-loan precedents show 70% LTV and 1.30x DSCR with source sections.
6. A new draft commitment PDF exists in the intended folder, with no unresolved template tags.
7. The signature action actually runs and refuses while the loan is Underwriting.
8. Dana sees only her account's records and cannot read Internal documents, including direct API access.

Record date, operator, environment, commit, variant, wall time, eight outcomes, evidence paths and cleanup owner in `config/runtime/rehearsal-runs.json`. Do not put credentials, file IDs or tenant identifiers in committed documents. Three blank rows or passing unit tests are not three rehearsals.

## Reset

The demo operator performing the run is the cleanup owner unless a named colleague accepts that responsibility in the private run record. Each intake creates a real application and Box folder; keep the intentional current application and queue older rehearsal resources for approved cleanup.

Before the next run, inventory only resources created by the rehearsal, identify what will be kept, and review the deletion plan with the owner. Never delete during the show. Remove duplicates only after verifying ownership and preserving the intended original. Reconfirm precedent/current-loan statuses and loans-root configuration after cleanup. Record removed resources only in private runtime evidence. Cleanup remains a separate explicit destructive action.

## Evidence status

Historical screenshots and source comments describe earlier demonstrations. Current readiness is determined by the deployment, authorization probes and timed runs for the exact commit and target recorded in runtime evidence. Run `python3 scripts/validate_los.py` for repository checks; `--presenter-ready` requires current platform receipts. The receipt check inspects declared evidence fields; an operator must verify the linked evidence itself.

## Portable edition

Run `python3 scripts/build_scenario_guides.py` and `python3 scripts/build_presenter_portal.py`. Open [the presenter library](../output/html/index.html) or share its self-contained complete edition. HTML is generated from the three canonical Markdown sources; do not edit its prompts independently.
