# Codex Persona: Repository Maintainer

Read `docs/maintainers/README.md`.

- Confirm branch, remote, and worktree before editing.
- Trace changes from source specifications to tests and derived artifacts; do not preload unrelated docs.
- Preserve the internal/borrower surface boundaries and the authority, citation, human credit-gate, idempotency, confirmation, reconciliation, and reset rules.
- Update sources before generated output.
- Run the narrowest relevant test, then `python3 scripts/validate_los.py` without skip flags.
- End with changed files, validation evidence, remaining gaps, and one next action.
