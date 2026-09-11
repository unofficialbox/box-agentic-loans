# Box Doc Gen: commitment letters

The complete payload, template resolution, generation/signing flow, and troubleshooting instructions are maintained in the self-contained [loan-origination SKILL.md](../skills/loan-origination/SKILL.md#doc-gen-and-signature-handoff). No supporting files are required by the skill.

## Distributing the Claude skill

Upload `skills/loan-origination/SKILL.md` directly to clients that accept Markdown skills. For archive import, a ZIP containing only `loan-origination/SKILL.md` is sufficient. There is no script dependency at runtime. Repository maintainers may optionally build that archive with:

```bash
python3 scripts/package_loan_skill.py --output /tmp/loan-origination.skill
```

The archive contains only `loan-origination/SKILL.md`. Reload the updated skill in the intended conversation; repository edits do not update an already loaded client skill.
