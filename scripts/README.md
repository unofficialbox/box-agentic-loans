# LOS Scripts

| Script | Purpose |
|--------|---------|
| `validate_los.py` | The offline verification matrix, or the fail-closed presenter-readiness gate with `--presenter-ready` |
| `demo_operator.py` | Check prerequisites, generate assets, create the Box foundation (`LOS-2026-Harborview`), deploy portable Salesforce metadata, and validate a new environment |
| `setup_los_dev.py` | Install repository dependencies and optionally sync Box/Salesforce context into `config/runtime/demo-environment.json` |
| `bcl.py` | Dependency-free reader for authored `.bcl` config artifacts; returns the config payload from the `locals.bcl` envelope |
| `generate_sample_loan_assets.py` | Create the twelve synthetic loan-file PDFs (application, borrower-marked term sheet, financials, appraisal, executed 2023 and 2025 loan agreements, and more) plus the two JSON fixtures |
| `generate_docgen_templates.py` | Create Box Doc Gen-ready Word templates for the credit memo, commitment letter, closing summary, and maturity notice, plus the borrower-marked term sheet in Word |

## Config formats: authored BCL, runtime JSON

Authored spec config under `config/` is `.bcl`; `scripts/bcl.py` parses the `locals { "bcl" = { … } }` envelope and returns the `resources[0].config` payload. `demo_operator.py` and `validate_los.py` load authored config through it (`load_config` dispatches `.bcl` → BCL, `.json` → JSON).

The `config/runtime/*` files stay JSON: they are per-operator, gitignored, and round-tripped by the tooling (`setup_los_dev.py` writes `demo-environment.json`, `demo_operator.py` writes `bootstrap-state.json`, and `resolve-config` emits resolved specs under `config/runtime/generated/`). Only the `*.example.json` templates are committed.

## Fresh environment

```bash
cp config/runtime/demo-environment.example.json config/runtime/demo-environment.json
python3 scripts/demo_operator.py doctor
python3 scripts/demo_operator.py bootstrap --scenario box-salesforce-los --dry-run
python3 scripts/demo_operator.py bootstrap --scenario box-salesforce-los --yes
python3 scripts/demo_operator.py status --scenario box-salesforce-los
```

`bootstrap` runs the phases below in order, checkpointing so a rerun skips what exists; run them one at a time when Box and Salesforce administration is split between people:

```bash
python3 scripts/demo_operator.py generate-assets
python3 scripts/demo_operator.py box-foundation --dry-run
python3 scripts/demo_operator.py box-foundation
python3 scripts/demo_operator.py seed-metadata --dry-run
python3 scripts/demo_operator.py seed-metadata
python3 scripts/demo_operator.py salesforce-deploy --dry-run
python3 scripts/demo_operator.py salesforce-deploy
python3 scripts/demo_operator.py resolve-config --allow-unresolved
# Complete the manual-task register and record published URLs.
python3 scripts/demo_operator.py resolve-config
python3 scripts/demo_operator.py validate --scenario box-salesforce-los
```

`provision` remains as a legacy alias for `bootstrap`. Use `--offline` with `doctor` or `validate` only for repository/CI checks; normal operator runs perform read-only verification against the configured Box enterprise and Salesforce org.

## Repository verification

```bash
python3 scripts/setup_los_dev.py --smoke     # probes CLI sessions and prints a plan; writes nothing
python3 scripts/setup_los_dev.py             # installs every dependency prerequisite
python3 scripts/validate_los.py
```

Use `--skip-react` only for a narrow Python/content diagnostic and `--skip-playwright` only when browser binaries are unavailable; report the omitted gate. For a live presenter-readiness decision, populate the gitignored receipt file from `config/runtime/validation-receipts.example.json` and run `python3 scripts/validate_los.py --presenter-ready`.

## Regenerating fixtures

```bash
python3 scripts/generate_sample_loan_assets.py   # output/pdf and output/json
python3 scripts/generate_docgen_templates.py     # output/docgen; merge data in config/box/docgen-template-data.bcl
```

`validate_los.py` regenerates both twice into a temporary directory and fails on any drift from the committed output, so commit the regenerated files with the generator change.
