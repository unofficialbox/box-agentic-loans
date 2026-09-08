# Demo Operator

Configure, deploy, validate, rehearse, or reset the LOS loan origination demo in a confirmed target environment.

## Run order

See [`scripts/README.md`](../../scripts/README.md) for the operator scripts and validation commands.

1. Confirm the repository, selected scenario, exact Box enterprise, Salesforce org, and ignored runtime file.
2. Run `python3 scripts/demo_operator.py status`.
3. Run `python3 scripts/demo_operator.py doctor --offline --platform box`.
4. For a one-shot idempotent operator path, run:

   ```bash
   python3 scripts/demo_operator.py bootstrap --scenario <scenario> --dry-run
   ```

5. Follow [Start Here](start-here.md).
6. Complete [Browser Configuration](browser-configuration.md).
7. Complete [Box Preview Setup](box-preview-setup.md) to bring up governed Box content; until it is done the workspace reports that it cannot be opened.
8. Run the [Smoke Test](smoke-test.md).
9. Rehearse the [scenario guide](scenarios/box-salesforce-los/README.md), then the [Rehearsal Clickpath](rehearsal-clickpath.md) for the Loan Copilot and the loan officer's list view.
10. Build [Presenter Deliverables](presenter-deliverables.md) and finish the [Manual-Task Register](manual-task-register.md).
11. Complete [Finalization](final-phase.md) before declaring presenter readiness.

[Inbound Email Intake Service](email-intake-service.md): Salesforce email service that captures a borrower's emailed application package onto the matching Opportunity and stages the attachment for Box intake.

Box Private-API Labs (box-capture repository): isolated research on Apps, Automate, and Hub composition. Every executor requires an already-authenticated Box web-app tab on the exact configured hostname.

## Live claim boundary

Use the four readiness terms in `docs/conventions.md`. Do not describe a **Portable specification** or **Local deterministic fixture** as a **Deployed integration**. Do not describe a scenario as **Presenter-ready live** until `python3 scripts/validate_los.py --presenter-ready` passes with current receipts. As of the loans port no step in this run order has been executed against a live environment; the CLM predecessor proved the code path, not this repository.

## Box surface authoring tooling

This repository is a **golden copy** of the finished LOS scenario. The tooling that authors Box surfaces without a supported API — guarded Forms, Apps, and Automate executors, their lab specifications, and the Automate graph inspector — lives in a separate repository:

    unofficialbox/box-capture

Nothing here depends on it at runtime. Use it to rebuild a Box surface in a new environment or capture a live workflow definition, not to run or present the demo.
