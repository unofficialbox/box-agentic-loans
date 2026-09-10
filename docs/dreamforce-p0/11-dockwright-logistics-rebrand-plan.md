# Dockwright Logistics rebrand plan (Dreamforce-safe borrower names)

**Repo:** `unofficialbox/box-claudeforce-loans` (original LOS demo — not the `-dreamforce` fork)  
**Scope:** in-repo only. Live Salesforce Accounts/Contacts/Opportunities/Loans and live Box workspace folders/files/metadata are **out of scope** for this PR; they need a separate operator pass after merge.

## Why Harborview is unsafe

`Harborview Logistics` / `Harborview Logistics Holdings LLC` collide with real-world commercial and logistics naming. Dreamforce and customer-facing demos must not present a borrower brand that an attendee can map to a real company. The demo already seeds that string into Salesforce sample data, Box workspace names (`LOS-2026-Harborview`), PDF/DOCX assets, emails (`@harborviewlogistics.example`), UI tests, and presenter copy — so a surface rename is not enough; the inventory below must all move together.

## Rejected alternatives

| Candidate | Why rejected |
|---|---|
| **Express Logistics** | Real carrier/logistics brand collisions |
| **Quaystone Logistics** | Real / near-real logistics naming |
| **Harborview Logistics** (status quo) | Real-world collisions; Dreamforce-unsafe |
| **Crateline / Velora** | Explicitly banned for this rebrand |
| **Microsoft fictional brands** (Contoso, Fabrikam, Northwind, Tailspin, Adventure Works, Litware, etc.) | Competitor optics at a Salesforce/Box event |

## Chosen name + screening note

- **Borrower company:** Dockwright Logistics  
- **Borrowing entity:** Dockwright Logistics Holdings LLC  
- **Employee LP (guaranty exclusion):** Dockwright Employee Holdings LP  
- **Email domain:** `@dockwrightlogistics.example`  
- **Workspace label:** `LOS-2026-Dockwright` (and `LOS-{year}-Dockwright` on executed agreements)  
- **Asset prefix:** `dockwright-*`  
- **Bank brand:** keep **Acme Bank** (no Crestline found in this repo; Crestline is a real bank and remains banned)  
- **Loan IDs unchanged:** `LN-2026-0042`, `LN-2023-0311`, `LN-2025-0148`, `LN-2026-0088`  
- **Geography preserved:** street address `1200 Harbor Way, Everett, Massachusetts 02149` is not borrower branding and stays as-is  

**Screening note:** Dockwright is a coined compound (dock + wright) aimed at a fictional 3PL / distribution borrower. It is not a Microsoft Contoso-family name and is not one of the explicitly rejected logistics brands. Re-screen closer to Dreamforce if corporate legal publishes an updated banned-name list.

## Deep audit inventory (pre-change)

### Harborview / harborview string hits (57 files)

**Generators & operators**

- `scripts/generate_sample_loan_assets.py` — borrower constants, PDF filenames, emails, Employee Holdings LP, JSON fixture, workspace id  
- `scripts/generate_docgen_templates.py` — term-sheet markup, footers, `HARBORVIEW MARKUP` callouts  
- `scripts/demo_operator.py` — file bindings, Box folder `LOS-2026-Harborview`, metadata seeds  
- `scripts/populate-closed-loans.sh` — upload paths for executed agreements  
- `scripts/validate_los.py` — deterministic fixture path `json/harborview-los-records.json`  
- `tests/test_demo_operator.py` — file-binding assertion  

**Sample data & seed scripts**

- `los-salesforce-project/sample-data/los-sample-records.bcl`  
- `los-salesforce-project/scripts/seed-los-salesforce-sample-data.apex`  
- `los-salesforce-project/scripts/seed-los-loan-files.apex`  
- `los-salesforce-project/scripts/demo-email-intake.apex`  
- `sample-data/policies/README.md` — workspace folder name  

**Salesforce Apex / tests / field help**

- `LosBorrowerLoans.cls`, `LosBorrowerLoansTest.cls`, `LosApplyLoanTermsTest.cls`  
- `LosLoanListTest.cls`, `LosLoanListServiceTest.cls`, `LosLoanPackageTest.cls`  
- `LosExtractLoanTermsTest.cls`, `LosClassifyDocumentTest.cls`, `LosCreateApplicationTest.cls`  
- `LosBoxTokenServiceTest.cls`, `EmailIntakeHandlerTest.cls`, `BoxEmailAttachmentUploaderTest.cls`  
- `LOS_Loan__c/fields/Collateral_Value__c.field-meta.xml`  

**Static resources (binary + meta descriptions)**

- `Los_Sample_Loan_Application.resource` (+ meta) — copy of application PDF  
- `Los_Sample_Loan_2023_Executed.resource` (+ meta)  
- `Los_Sample_Loan_2025_Executed.resource` (+ meta)  
- `Los_Sample_Term_Sheet_2026_Markup.resource` (+ meta) — copy of markup DOCX  

**Borrower portal (React)**

- `uiBundles/losreactapp/src/config.ts` — workspace name  
- Tests: `portfolio.test.ts`, `box.test.ts`, `applications.test.ts`, `ApplicationForm.test.tsx`, `ProfileMenu.test.tsx`, `Workspace.test.tsx`  
- `e2e/app.spec.ts`  

**Config**

- `config/box/docgen-template-data.bcl`  
- `config/demo/screenshot-manifest.bcl`  
- `config/operator/operator-workflow.bcl`  

**Docs / presenter / skills / top-level**

- `DEMO-CLICKPATH.md`, `CLAUDE.md`, `DEPLOYMENT-COMPLETE.md`, `FIXES-2026-09-08.md`  
- `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`, `docs/SETUP.md`, `docs/DEMO-WORKFLOW.md`  
- `docs/DOCGEN-GUIDE.md`, `docs/METADATA-TEMPLATES.md`, `docs/MULTI-INSTANCE.md`  
- `docs/BOX-SIGN-TAGS.md`, `docs/PERFORMANCE-TEST.md`  
- `skills/loan-origination/SKILL.md`  
- `output/docgen/TEMPLATE-UPDATED.md`  
- `output/html/00-operator-setup-guide.html`, `01-box-salesforce-los-guide.html` (and combined edition rebuilt from sources)  

**Generated assets (filenames + embedded text)**

- `output/json/harborview-los-records.json` → rename to `dockwright-los-records.json`  
- `output/pdf/harborview-*.pdf` (10 files) → `dockwright-*.pdf`  
- `output/docgen/harborview-term-sheet-2026-markup.docx` → `dockwright-…`  

### Crestline

**No matches** in this repository. Bank brand is already **Acme Bank**. No change required beyond continuing to ban Crestline.

### Other brand notes (no rename in this PR)

- **Pinecrest Dental Group** — second/contrast borrower in seeds and portal tests. Not in the banned list; left as-is. Flag for a later Dreamforce name pass if legal expands the list.  
- **Acme Bank** — retained.  
- **Microsoft Contoso-family names** — none present; do not introduce.  
- **Express / Quaystone / Crateline / Velora** — none present.

## Replacement map

| From | To |
|---|---|
| Harborview Logistics Holdings LLC | Dockwright Logistics Holdings LLC |
| Harborview Employee Holdings LP | Dockwright Employee Holdings LP |
| Harborview Logistics | Dockwright Logistics |
| harborviewlogistics.example | dockwrightlogistics.example |
| HARBORVIEW MARKUP | DOCKWRIGHT MARKUP |
| LOS-2026-Harborview / LOS-{yyyy}-Harborview | LOS-2026-Dockwright / LOS-{yyyy}-Dockwright |
| 006-demo-harborview | 006-demo-dockwright |
| harborview-* filenames | dockwright-* |
| Harborview / harborview (remaining borrower short forms & identifiers) | Dockwright / dockwright |
| 1200 Harbor Way… | **unchanged** (street geography) |
| LN-2026-0042 (and other loan IDs) | **unchanged** |

## Live follow-ups (operator, not this PR)

After merge, on each demo environment:

1. Rename or recreate Box workspace `LOS-2026-Harborview` → `LOS-2026-Dockwright` (or re-bootstrap).  
2. Re-seed Salesforce Accounts/Contacts (`Dockwright Logistics`, website/email) and Opportunity names.  
3. Re-upload borrower PDFs/DOCX and refresh `losDocument` / Doc Gen seeds.  
4. Update any saved Claude Desktop / Agentforce prompt snippets that hardcode Harborview.  
5. Confirm borrower portal user (Dana Whitfield) still maps to the Dockwright Account.

## Verification checklist

- [x] Plan MD committed on the PR branch  
- [x] `rg -i 'harborview'` returns only intentional historical mentions in this plan (zero outside it)  
- [x] `rg -i 'crestline'` empty outside this plan’s ban note  
- [x] No Contoso / Fabrikam / Northwind / Tailspin / Adventure Works / Litware introduced  
- [x] Generators emit `dockwright-*` paths; `output/pdf`, `output/json`, `output/docgen` renamed and regenerated  
- [x] Static resources refreshed from regenerated assets; meta descriptions updated  
- [x] `validate_los.py` **generated fixtures** and **generated presenters** PASS (12 PDFs, Dockwright JSON, Doc Gen set; HTML guides rebuilt). Other matrix rows (secrets/hub IDs, Mermaid CLI, missing `sf`, SOQL guest field, React `node_modules`) are pre-existing env/repo issues, not rename regressions.  
- [x] React/Apex borrower-label strings updated in-repo; React npm suite not run here (`node_modules` absent)  
- [x] Loan IDs (`LN-2026-0042`, etc.) and `1200 Harbor Way` unchanged  
