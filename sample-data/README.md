# LOS Sample Data Plan

This directory holds the synthetic credit policy library for the LOS demo. The generated loan-file artifacts live under `output/` so they are clearly separated from source notes and can be regenerated.

| File | Purpose |
|------|---------|
| `output/pdf/harborview-loan-application-2026.pdf` | Borrower's application summary with its own $6,000,000 collateral figure |
| `output/pdf/harborview-term-sheet-2026-borrower-markup.pdf` | Term sheet with borrower markup hidden in Section 9.3 and Schedule A |
| `output/pdf/harborview-financial-statements-fy2025.pdf` | FY2025 statements; NOI $448,000 against $400,000 debt service (1.12x) |
| `output/pdf/harborview-tax-return-summary-2025.pdf` | Tax return summary reconciled to the financial statements |
| `output/pdf/harborview-bank-statements-q2-2026.pdf` | Operating deposits (~$310,000 average) for the relationship-pricing test |
| `output/pdf/harborview-appraisal-2026.pdf` | Bank-ordered appraisal at $5,650,000; LTV on $4,800,000 is 85% |
| `output/pdf/harborview-insurance-certificate.pdf` | Insurance renewal tracking (expires 2027-06-30) |
| `output/pdf/harborview-environmental-report-2026.pdf` | Phase I ESA, no recognized environmental conditions |
| `output/pdf/harborview-loan-agreement-2023-executed.pdf` | Executed line of credit; Schedule 1 covenants LTV 70% / DSCR 1.30x |
| `output/pdf/harborview-loan-agreement-2025-executed.pdf` | Executed equipment loan; same Schedule 1 carried forward |
| `output/pdf/pinecrest-loan-application-2026.pdf` | Second borrower's SBA 7(a) application ($650,000) |
| `output/pdf/pinecrest-financial-statements-fy2025.pdf` | Second borrower's FY2025 statements |
| `output/json/harborview-los-records.json` | Mock loan, opportunity, prior-loan, and credit approval matrix data |
| `output/json/credit-policy-playbook.json` | Standard and approved-exception positions by policy family |
| `sample-data/policies/approved/LOS-*.md` | The eight governed credit policy files ([library README](policies/README.md)) |

Use the PDFs, Box metadata, structured records, and approved policy Markdown across the scenario packages. These are **Local deterministic fixture** evidence for Box + Salesforce Loan Origination; they are not proof of a **Deployed integration**.

Regenerate all sample assets from the LOS demo root:

```bash
python3 scripts/generate_sample_loan_assets.py
```
