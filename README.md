![AI-Assisted Loan Origination](assets/banner.svg)

# Loan Origination Demo

> **Presenting?** Open **[`DEMO-STORYBOARD.html`](DEMO-STORYBOARD.html)** — the six-beat Harborview storyboard:
> preflight checks, every prompt as copy-paste, and what each beat should return.

This repository is a commercial loan origination (LOS) demo built on **Box + Salesforce**: a governed loan file in Box, a structured `LOS_Loan__c` record in Salesforce, governed Apex actions between them, deterministic local fixtures, portable configuration, and self-contained presenter output.

**Provenance.** The implementation was ported from the Box + Salesforce contract lifecycle (CLM) demo, whose Box preview, Doc Gen, Sign preparation, MCP server and scoped external workspace were all proven against a live org. The loans port has since been deployed and smoke-tested live in one Box enterprise and one Salesforce org (2026-09-03): the CCG token endpoint, loan package, Box AI ask and extract, the refused unconfirmed write-back, the signature guard, portfolio search, Doc Gen template registration and the credit policy Hub all ran against real services. The Box App, Form and Automate intake surfaces remain browser tasks and are still specification-only; readiness labels below say which is which.

## Choose one path

| Goal | Start here |
|---|---|
| Configure, deploy, validate, or present the demo | [Operator guide](docs/operator/README.md) |
| Understand or tailor the LOS domain, controls, agents, and value story | [Use-case creator guide](docs/use-case-creator/README.md) |
| Change code, configuration, tests, generated assets, or release state | [Maintainer guide](docs/maintainers/README.md) |

The complete persona index is in [docs/README.md](docs/README.md). AI assistants must read this file and exactly one matching persona instruction before exploring further.

## Scenarios

| Scenario | Primary surface | Coordination model |
|---|---|---|
| [Box + Salesforce Loan Origination](docs/operator/scenarios/box-salesforce-los/README.md) | Salesforce Multi-Framework React | Governed Apex actions serve an internal agent surface and a scoped borrower portal while humans retain credit authority. |

The scenario uses the Harborview Logistics loan file and governance model. Box remains authoritative for loan-file content; Salesforce `LOS_Loan__c` remains authoritative for structured credit truth. Loan-file bytes never flow into Salesforce, and every generation, signature and record write is human-gated.

The borrower path: a borrower signs in to the Crestline Borrower Portal, starts an application, and uploads the documents the bank asks for (`config/los/required-documents.bcl`); Box AI classifies each upload against the `losDocument` template, so the lender's Copilot, the portfolio search and the borrower's own checklist read one classification, and the lender's record appears in Application status with its Box folder. Email and Box Automate intake remain an alternate path.

## Get started

Before running anything, complete operator prerequisites:

- Authenticate the CLIs used by demo setup:
  - `box login -d` (or your standard Box auth flow)
  - `sf org login web` (or org auth flow you already use)
- Confirm you are in the LOS repo root.

Run the onboarding smoke check first. It only probes CLI sessions and prints a safe, simulated install plan:

```bash
python3 scripts/setup_los_dev.py --smoke
```

Install dependencies and create the runtime config in one command:

```bash
python3 scripts/setup_los_dev.py
```

Useful variants:

- `--automated`: runs without prompts for CI or scripted setup.
- `--from-current-clis`: preloads Box/Salesforce IDs and login values from the authenticated CLIs into `config/runtime/demo-environment.json`.

```bash
python3 scripts/setup_los_dev.py --automated --from-current-clis
```

Run the full non-live validation gate (unit/lint/tests/build/schema checks, local presenter artifacts, and safety rules):

```bash
python3 scripts/validate_los.py
```

It checks secrets and runtime-ID isolation, JSON/BCL configs, Markdown links, Mermaid/SVG drift, Python and React tests, lint, build, Playwright, deterministic fixtures, presenter output, screenshot manifests, reset behavior, and idempotency rules. Repository mode intentionally skips live receipts.

For a live presenter-readiness decision, create the gitignored `config/runtime/validation-receipts.json` from its example and run:

```bash
python3 scripts/validate_los.py --presenter-ready
```

This fails closed unless Box and Salesforce have current secret-free passed receipts.

## Presenter output

Start with the [presenter library](output/html/index.html). It routes to every standalone chapter and to the [complete self-contained edition](output/html/06-complete-presenter-edition.html), which embeds all seven chapters and needs no sibling files or network access. The Markdown source remains authoritative; generated HTML is the portable sharing layer.

## Source map

| Path | Purpose |
|---|---|
| `config/` | Portable platform, scenario, operator, and runtime specifications |
| `docs/use-case-creator/` | LOS architecture, agents, controls, references, value, and marketecture |
| `docs/operator/` | Ordered environment setup, deployment, validation, and presentation path |
| `docs/maintainers/` | Source precedence, development workflow, validation, and release rules |
| `docs/diagrams/` | Mermaid sources and synchronized SVG renders |
| `sample-data/` | Synthetic LOS inputs and the governed credit policy Markdown |
| `scripts/` | Deterministic generators, operator automation, mocks, and validation |
| `tests/` | Repository, safety, fixture, presenter, and navigation checks |
| `los-salesforce-project/` | Salesforce metadata and Multi-Framework React UI Bundle |
| `output/` | Generated fixtures, traces, screenshots, and portable presenter deliverables |

Run commands from the repository root unless a guide explicitly changes directories. Use repository-relative paths in every durable file.

## Conventions

The shared **readiness vocabulary** (how maturity is claimed) and the **safety rules** (credential, approval, and reset rules) live in [docs/conventions.md](docs/conventions.md). Follow both in any documentation, configuration, or presenter claim.
