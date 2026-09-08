# Demo Clickpath

Two exercises before a demo: rehearse the Loan Copilot in Agent Builder, and give the loan officer a place where new borrower applications appear. Each takes about ten minutes. Beats 2 to 5 of the stage demo run in Claude Desktop and are covered by the storyboard's preflight (P2, P3); this page does not repeat them.

Prerequisites: the org is deployed and seeded, `LOS_Loan_Copilot` has an active version (storyboard P1), and the borrower login works (P6, P7). Replace `<alias>` with your org alias.

## 1. Rehearse the Loan Copilot

1. **Setup → Agentforce Agents** (type "Agents" in Quick Find). Confirm **Loan Copilot** shows the Active tick.
2. Click **Loan Copilot**. Agentforce Builder opens in a new tab.
3. Click **Preview** at the top of the canvas. The chat runs as the agent user, not as you.
4. Send each message on its own and check the expectation before the next.

| Send | Expect |
|---|---|
| `What's in the loan package for LN-2026-0042?` | The record summary and eight document names, term-sheet markup included. No record or folder IDs. |
| `What does the borrower's markup change about the rate and the guaranty?` | 6.50% requested against 6.85% fixed; limited guaranty capped at $1,000,000 each; cited to the markup PDF. |
| `Extract the terms from the term sheet and validate them against the record.` | Seven fields. LTV 75 vs 85 and DSCR 1.25 vs 1.12 flagged as mismatches. States that nothing was written. |
| `Does credit policy allow 85% LTV and 1.12x DSCR? Cite the policy IDs.` | LOS-LTV-001 and LOS-LTV-002, LOS-DSCR-001 and LOS-DSCR-002. Both requests outside the approved exceptions. |
| `What has Harborview submitted for LN-2026-0043 so far?` | The Equipment Finance application: Financial Statement and Tax Return classified, loan application still missing. |

5. If an answer falls to the fallback or narrates tool names, write down the message. In the left rail, **Subagents → Document Answers** shows the topic and its three actions. Send the misrouted message to the maintainer; the fix is an edit to the `.agent` file and a republish. Never edit the agent in the builder, which the next publish would overwrite.

Expect: five answers in a row without a fallback.

## 2. Show new applications to the loan officer

Borrower applications arrive in Application status with Record Source "Borrower Portal". The **New applications** list view ships with the metadata (`objects/LOS_Loan__c/listViews/New_applications`), so nothing is built by hand. Pin it once per org:

1. **App Launcher → Loan Origination → Loans** tab.
2. Open the list view picker and choose **New applications**.
3. List view gear → **Pin list**.

Expect: one row, LN-2026-0043 with Record Source "Borrower Portal", until the next rehearsal of beat 1 adds another. If the view is missing, the object folder was not deployed; run `python3 scripts/demo_operator.py salesforce-deploy`.

## What a rehearsal leaves behind

Every run of beat 1 creates a real loan and a real Box folder. Keep the latest one as the in-progress application the demo shows, and have the demo owner remove earlier ones (MT-074). Do not delete records during setup.
