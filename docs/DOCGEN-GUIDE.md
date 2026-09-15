# Box Doc Gen: commitment letters

The complete payload, template resolution, generation/signing flow, and troubleshooting instructions are maintained in the self-contained [loan-origination SKILL.md](../skills/loan-origination/SKILL.md#doc-gen-and-signature-handoff). No supporting files are required by the skill.

## Two commitment letter templates

| Template | Filled by | Tag source | Registered where |
|---|---|---|---|
| `output/docgen/los-commitment-letter-template.docx` | The presenter's assistant through `create_docgen_batch` with the nested `user_input` payload in the skill (`loan.*`, `terms.*`, `precedent.*`, `letter.*`) | Hand-built analysis payload | Box; file ID in `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` |
| `output/docgen/los-commitment-letter-salesforce-template.docx` | The Box for Salesforce managed package (Doc Gen button on the loan record, list-view batch, or the `generateDocGenForRecord` flow action) | `LOS_Loan__c` record, its lookups, `Borrower_Loans__r`, and `$User` | Salesforce **Box Doc Gen Templates** tab, object `LOS_Loan__c` |

Both carry the same Box Sign fields for recipient 1 (`[[s|1|id:borrower_signature]]`, `[[d|1|id:borrower_signed_date]]`), so a letter from either can go to `prepareSignatureRequest`. Both are produced by `scripts/generate_docgen_templates.py`; `validate_los.py` fails on drift.

## Salesforce managed package template

The managed package merges a template against the JSON that its template wizard exports for the chosen object. `sample-data/docgen/LOS_Loan__c_DocGen.json` is that export for `LOS_Loan__c` (the file the wizard names `LOS_Loan__cDocGen.json`). Its top-level keys are `LOS_Loan__c`, `$User` (the generating user) and `$Organization`; every tag in the Salesforce template is a path into it, and `tests/test_docgen_salesforce_template.py` resolves each one. Regenerate the export from the wizard after adding fields to `LOS_Loan__c`, replace the fixture, and rerun the tests.

Tag conventions follow Box's [Template Tags Reference](https://docs.box.com/en/box-doc-gen/box-doc-gen-templates/template-tags-reference-guide-and-examples): dot-notation paths, no spaces or hyphens inside a path, `:: optional` for fields that may be blank, `:: format("US-Number")` for currency, `{{ if <path> isPresent }} … {{ else }} … {{ endif }}` for conditional blocks, and `{{tablerow <alias> in <list path>}} … {{endtablerow}}` placed in the first and last cells of one table row for child relationships.

| Letter content | Tag |
|---|---|
| Loan ID, name, status, type, purpose, region | `{{LOS_Loan__c.Loan_ID__c}}`, `{{LOS_Loan__c.Name}}`, `{{LOS_Loan__c.Status__c}}`, `{{LOS_Loan__c.Loan_Type__c}}`, `{{LOS_Loan__c.Purpose__c}}`, `{{LOS_Loan__c.Region__c}}` |
| Borrower, entity, applicant | `{{LOS_Loan__c.Borrower__c}}`, `{{LOS_Loan__c.Borrower_Entity__c}}`, `{{LOS_Loan__c.Applicant_Name__c}}`, `{{LOS_Loan__c.Applicant_Email__c}}` |
| Credit terms | `{{LOS_Loan__c.Loan_Amount__c :: format("US-Number")}}`, `{{LOS_Loan__c.Interest_Rate__c}}`, `{{LOS_Loan__c.Term_Months__c}}`, `{{LOS_Loan__c.LTV__c}}`, `{{LOS_Loan__c.DSCR__c}}`, `{{LOS_Loan__c.Collateral_Type__c}}`, `{{LOS_Loan__c.Collateral_Value__c :: format("US-Number")}}`, `{{LOS_Loan__c.Target_Closing_Date__c}}`, `{{LOS_Loan__c.Maturity_Date__c}}`, `{{LOS_Loan__c.Risk_Rating__c :: optional}}` |
| Underwriting notes | `{{ if LOS_Loan__c.Underwriting_Notes__c isPresent }}{{LOS_Loan__c.Underwriting_Notes__c}}{{ else }}…{{ endif }}` |
| Borrower account (lookup) | `{{LOS_Loan__c.Borrower_Account__r.Name}}`, `.Industry :: optional`, `.BillingStreet`, `.BillingCity`, `.BillingState`, `.BillingPostalCode` |
| Opportunity (lookup) | `{{LOS_Loan__c.Opportunity__r.Name :: optional}}`, `{{LOS_Loan__c.Opportunity__r.StageName :: optional}}` |
| Loans on record for the borrower (child list) | `{{tablerow loan in LOS_Loan__c.Borrower_Account__r.Borrower_Loans__r}}` with `{{loan.Loan_ID__c}}`, `{{loan.Loan_Type__c}}`, `{{loan.Loan_Amount__c :: format("US-Number")}}`, `{{loan.Status__c}}{{endtablerow}}` |
| Loan officer (lookup to User) | `{{LOS_Loan__c.Loan_Officer_Name__c}}`, `{{LOS_Loan__c.Loan_Officer__r.Name}}`, `.Title :: optional`, `.Email`, `.Phone :: optional` |
| Generating user | `{{$User.Name}}`, `{{$User.Email}}` |
| Footer | `Acme Bank | {{LOS_Loan__c.Loan_ID__c}}` |

### Registering it in Salesforce

Prerequisites and steps are in the Box Support article *Setting up Box Doc Gen in Salesforce* (Box Doc Gen section of support.box.com). In short:

1. Box Doc Gen is enabled in the Box Admin Console (Enterprise Settings, Content & Sharing, Box Doc Gen). After enabling it, reconnect both the Box Service Account and the Box User in **Box Settings** so the new Doc Gen scopes are granted.
2. In **Box Settings**, Assign Permissions: give the template maintainer **Box Doc Gen Template Manager** and presenters **Box Doc Gen Users**.
3. **Box Doc Gen Templates** tab, **New**: template name `LOS Commitment Letter`, generated file name `Commitment Letter {{LOS_Loan__c.Loan_ID__c}}`, object `LOS_Loan__c`. **Download JSON File** (compare it with `sample-data/docgen/LOS_Loan__c_DocGen.json`; a different field set means the template and fixture need updating). Upload `los-commitment-letter-salesforce-template.docx`. On **Preview**, pick `LN-2026-0042` and confirm every tag renders; a tag printed literally is a path that is not in the export. On **Settings**, tick **Available for Box Sign** and choose PDF output.
4. Object Manager, `Loan` (`LOS_Loan__c`), Buttons, Links, and Actions, **New Action**: type Lightning Component, component `box:dgRecordPage`, label `Generate Commitment Letter`; add it to the loan page layout's Mobile and Lightning Actions. For list-view batches, add a List Button whose formula is `/flow/box/Generate_Box_Documents?retURL=<LOS_Loan__c key prefix>/o` (Lightning runtime for flows must be enabled).
5. Generated letters land in the record's Box for Salesforce folder as the Box User. The loan-status guard in `prepareSignatureRequest` still applies to them.

The Word add-in (Box Doc Gen Template Creator, **Start with your data**, upload the JSON, **Generate tags**) produces the same tag paths as the table above; use it when editing the template by hand and keep `scripts/generate_docgen_templates.py` as the source of truth afterwards.

## Distributing the Claude skill

Upload `skills/loan-origination/SKILL.md` directly to clients that accept Markdown skills. For archive import, a ZIP containing only `loan-origination/SKILL.md` is sufficient. There is no script dependency at runtime. Repository maintainers may optionally build that archive with:

```bash
python3 scripts/package_loan_skill.py --output /tmp/loan-origination.skill
```

The archive contains only `loan-origination/SKILL.md`. Reload the updated skill in the intended conversation; repository edits do not update an already loaded client skill.

## Distributing the Amazon Quick skill

Amazon Quick on desktop loads skills by description match and makes a skill's referenced tools available only when it activates. Import [skills/loan-origination-quick/SKILL.md](../skills/loan-origination-quick/SKILL.md) under Customize, Skills, Create, From file (or From folder), then in the skill editor reference the tools of both the LOS Loan Tools and Box connectors, and publish. Without both connectors referenced, Quick runs the beats on whichever connector's auto-generated skill matches first and never loads the other. Build the archive with:

```bash
python3 scripts/package_loan_skill.py --skill loan-origination-quick --output /tmp/loan-origination-quick.skill
```
