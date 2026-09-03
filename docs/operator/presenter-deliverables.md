# Presenter Deliverables

Complete this after the smoke test and before rehearsal.

## Build

```bash
python3 scripts/build_scenario_guides.py
python3 scripts/build_los_experience_gallery.py
python3 scripts/build_executive_marketecture.py
python3 scripts/build_customer_datasheet.py
python3 scripts/build_loan_lifecycle_readiness_marketecture.py
python3 scripts/build_presenter_portal.py
```

`python3 scripts/validate_los.py` rebuilds and compares every self-contained HTML file in temporary directories, so it remains the final deterministic check.

## Screenshot requirements

No real loan screens have been captured yet (MT-072). Until they are, the gallery and marketecture render a "Screen capture pending" placeholder in place of each image; they never fabricate one. When capturing:

- Capture the real Box, Salesforce, or React page viewport.
- Exclude browser tabs, address bars, desktop content, notifications, and unrelated records.
- Use the target scenario directory under `output/screenshots/`.
- Update `config/demo/screenshot-manifest.bcl` with source, capture date, crop rule, scenario, and readiness state.
- Rebuild affected HTML after replacing a screenshot.

## Rehearsal package

1. Open `output/html/00-operator-setup-guide.html` and verify offline navigation.
2. Select the scenario in [Scenario Guides](scenarios/box-salesforce-los/README.md).
3. Review its complete guide before using the shorter visual gallery.
4. Verify every claim against the current readiness state; nothing in this port is live-verified yet.
5. Complete every relevant item in the [Manual-Task Register](manual-task-register.md).
6. Record reset ownership and the post-demo reconciliation path.

The Markdown source remains authoritative. HTML is a portable, self-contained sharing layer.
