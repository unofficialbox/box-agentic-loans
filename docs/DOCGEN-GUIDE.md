# Box Doc Gen: commitment letters

The complete payload, template resolution, generation/signing flow, and troubleshooting instructions are maintained in the self-contained [loan-origination SKILL.md](../skills/loan-origination/SKILL.md#doc-gen-and-signature-handoff). No supporting files are required by the skill.

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
