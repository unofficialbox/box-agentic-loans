# Credit Policy Library

This folder is the source for the LOS demo's governed credit policy library. Each approved lending standard and each approved exception is a standalone Markdown file so Box can govern, search, preview, classify, and publish it independently.

## Publishing model

- Upload the files under `approved/` to the live Box `Credit Policies` folder in the `LOS-2026-Dockwright` workspace.
- Apply the `Credit Policy` (`losPolicy`) metadata template to each file.
- Publish the approved folder and selected policy files to the `Acme Credit Policy Library` Hub; pin `LOS-LTV-001`, `LOS-DSCR-001`, and `LOS-RATE-001`.
- Keep approved-exception language visually distinct from the standard position.
- Use the `lastReviewed`, `nextReview`, and `usageCount` metadata to make the Hub and Box App feel operational rather than static.

| Policy | Family | Position | Owner |
|---|---|---|---|
| `LOS-LTV-001` | Loan-to-Value | Standard | Credit Risk |
| `LOS-LTV-002` | Loan-to-Value | Approved Exception | Credit Risk |
| `LOS-DSCR-001` | Debt Service Coverage | Standard | Credit Risk |
| `LOS-DSCR-002` | Debt Service Coverage | Approved Exception | Credit Risk |
| `LOS-RATE-001` | Pricing | Standard | Pricing Committee |
| `LOS-RATE-002` | Pricing | Approved Exception | Pricing Committee |
| `LOS-GUAR-001` | Guaranty | Standard | Loan Documentation |
| `LOS-GUAR-002` | Guaranty | Approved Exception | Loan Documentation |

The policy text is fictional and demo-only. It is not financial or legal advice.
