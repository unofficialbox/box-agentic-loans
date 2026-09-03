# Crestline Credit Policy Library Hub

## Purpose

A lived-in credit administration destination for approved lending standards and approved exceptions. The Hub publishes governed Box files; it does not duplicate policy text or become a second source of truth. `LosBoxAskDocument` reads this Hub (by the id in `LOS_Box_Config__c.Credit_Policy_Hub_Id__c`) when the Loan Copilot checks a term sheet against policy, so what is pinned here is what the agent cites.

## Hub identity

- **Name:** Crestline Credit Policy Library
- **Tagline:** Approved lending standards, approved exceptions, and review ownership for every deal team.
- **Hero copy:** Start with the standard. Use an approved exception only when the business reason is documented and the named owner has signed off. Escalate anything outside the exception to Credit Committee before it reaches commitment.
- **Audience:** Commercial Lending, Credit Risk, Collateral Review, Compliance, Loan Documentation, and Finance

## Live composition

1. **Policy source** — the governed `Credit Policies` folder remains the source of truth.
2. **Credit Operations** — a current-standard callout reports eight approved files (four families, standard and exception each), three policy owners (Credit Risk, Pricing Committee, Loan Documentation), the latest review, and named-expert routing for marked-up term sheets.
3. **Action cards** — `Start a New Application`, `Open LOS Dashboard`, and `Executed Loans` connect the Hub to intake, portfolio work, and closed loans.
4. **Governance & review cadence** — the annual LTV/DSCR policy refresh, quarterly ownership review, retirement rules, and demo-only disclaimer remain visible below the operational actions.

The Box-native blue banner, compact operations summary, and three-card action row intentionally echo the React workspace's blue operational styling without duplicating its custom UI.

## Lived-in details

- Seed view counts through realistic `usageCount` metadata rather than fake social activity.
- Use dates spanning April–July 2026 and owners across Credit Risk, Pricing Committee, and Loan Documentation.
- Pin `LOS-LTV-001`, `LOS-DSCR-001`, and `LOS-RATE-001` as most-used content.
- Feature a "2026 collateral and coverage refresh" callout for the LTV and DSCR policies (`LOS-LTV-001` excludes FF&E from the collateral pool; `LOS-DSCR-001` tests quarterly on trailing-twelve-month NOI).
- Add a quarterly review note and a clear demo-only / not-financial-advice footer.
- Keep the three operational link cards current whenever the App or executed-loans URL changes.

## Publishing guardrail

Only files with `approvalStatus = Approved` may be added. Publishing or sharing the Hub is a human-confirmed action. The loans Hub has not yet been built in any environment.
