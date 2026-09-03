# Conventions

Shared vocabulary and safety rules for everyone working in this repository. The root
[README](../README.md) covers what the project is and how to get running; this file holds
the governance conventions those workflows depend on.

## Readiness vocabulary

Use these exact terms in documentation, configuration, and presenter claims:

| State | Meaning |
|---|---|
| **Portable specification** | Secret-free architecture, specifications, manifests, prompts, and setup instructions exist. |
| **Local deterministic fixture** | Repeatable local data, traces, documents, UI tests, or presenter output demonstrate the specification without claiming a live integration. |
| **Deployed integration** | The capability has passed current tests in the named target environment with secret-free evidence. |
| **Presenter-ready live** | The complete scenario has current receipts, screenshots, reset evidence, and a rehearsed human-operated path. |

Never promote a capability based only on configuration files or local fixtures. As of the
loans port nothing in this repository is beyond **Local deterministic fixture**; the CLM
predecessor's live evidence does not transfer.

## Safety rules

- Keep credentials and target-environment identifiers in ignored runtime files.
- Use external IDs (`Loan_ID__c`) for duplicate-safe Salesforce and Box operations.
- Separate dry-run planning from explicit apply operations.
- Confirm the exact enterprise, org, folder, and record before external writes.
- Require human approval for credit decisions and policy exceptions, document generation, signature, publishing, sharing, and destructive reset actions. Writing extracted loan terms onto the record is a human-confirmed action, never an automatic one.
- Preserve citations for material underwriting findings.
- Record partial failures and reconcile before retrying.
- Reset only resources owned by the current demo run and retain evidence.
