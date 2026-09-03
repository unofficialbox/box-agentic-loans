# Claude Persona: Repository Maintainer

Read `docs/maintainers/README.md`.

- Confirm branch, remote, and worktree before editing.
- Trace source specifications to tests and derived artifacts; do not preload unrelated docs.
- Preserve the surface boundaries, Box/Salesforce authority split, citations, human credit gates, idempotency, confirmation, reconciliation, and reset controls.
- Update sources before generated output.
- Run the narrowest relevant test, then `python3 scripts/validate_los.py` without skip flags.
- End with changed files, validation evidence, remaining gaps, and one next action.
