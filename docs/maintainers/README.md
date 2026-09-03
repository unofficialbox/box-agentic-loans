# Repository Maintainer

Use this path when changing code, configuration, tests, documentation structure, generated artifacts, or release state.

## Source-of-truth order

1. `AGENTS.md` and the selected assistant persona
2. `README.md` and `docs/README.md`
3. Machine-readable specifications under `config/`
4. Source Markdown under `docs/` and `sample-data/`
5. Generators under `scripts/`
6. Tests under `tests/`

Files under `output/` and rendered `docs/diagrams/*.svg` are derived evidence. Update their source and regenerate them instead of editing them directly.

## Maintainer workflow

1. Confirm the Git root, branch, remote, and working-tree state.
2. Read only the source specification, nearest documentation, generator, and tests relevant to the change.
3. Update configuration and Markdown sources before derived output.
4. Preserve Box loan-file content authority, Salesforce `LOS_Loan__c` structured credit authority, citations, human credit decision gates, external-ID idempotency, dry-run/apply separation, target confirmation, partial-failure reconciliation, and owned-resource reset evidence.
5. Run the narrowest relevant tests first.
6. Regenerate affected fixtures, diagrams, screenshot indexes, or presenter HTML.
7. Run `python3 scripts/validate_los.py` without skip flags.
8. Review the diff for secrets, live IDs, absolute local paths, stale readiness claims, and unexplained generated drift.
9. Commit one coherent change and open a pull request.

## Testing the live Box workspace locally

The Box token endpoint is Apex, so it does not exist off-platform: by default a local run
can only ever exercise the failure path, where the workspace reports that it could not
mint a token. `--mode live` closes that gap by serving a **real** downscoped token at the
Apex path, minted through the Salesforce CLI as the current user and held in memory only.

```bash
cd los-salesforce-project/force-app/main/default/uiBundles/losreactapp
export LOS_BOX_FOLDER_ID=<box-folder-id>   # required
export LOS_ORG_ALIAS=agentforce            # optional, this is the default
npm run preview:live
```

Add the localhost origin (for example `http://localhost:4173`) to the Box application's
**CORS Domains**. The browser calls `api.box.com` directly, so Box rejects the folder
listing without it, and the workspace reports the rejection with Box's own
`cors_origin_not_whitelisted` in the message.

**Use `preview:live`, not `dev:live`, for anything involving Box UI Elements.**
`preview:live` builds and serves the production bundle; `dev:live` runs the Vite dev
server, where a box-ui-elements dependency throws `Dynamic require of "react" is not
supported` from esbuild's CJS interop and the elements never mount. The two also diverge
in ways that matter: in the CLM predecessor a broken vendored Content Preview reproduced
only in the production bundle. `dev:live` remains useful for the rest of the app, where hot
reload is worth more.

This exists because the Box paths cannot be exercised at all without a real token, and a
deploy cycle per attempt is slow. The workspace does not hide a failure -- a CORS
rejection, a dead token endpoint and a refused folder each name themselves on screen --
but seeing them locally still beats reading them out of a deployed org. Check the message
on the page and the browser console before assuming the demo simply has no content.

## Release readiness

Repository release evidence requires:

- all persona entry points and local links resolve;
- configuration and schemas validate;
- Mermaid sources match their SVG renders;
- deterministic fixtures and presenter HTML regenerate cleanly;
- the screenshot manifest describes only current real-product evidence (it is allowed to be empty until MT-072 captures real loan screens);
- React tests, lint, build, and Playwright pass;
- Python tests pass;
- no secret, live environment identifier, or machine-specific absolute path is committed.

`python3 scripts/validate_los.py --presenter-ready` is a separate live gate requiring current secret-free receipts for Box and Salesforce. Repository tests never substitute for those receipts.

## Current maturity boundary

The repository provides **Portable specification** and **Local deterministic fixture** evidence for the scenario. Nothing in the loans port has yet been run against a live Box enterprise or Salesforce org; the CLM predecessor proved the same code paths live, but that evidence does not carry over. A capability is a **Deployed integration** only when current receipts prove the named target. The scenario is **Presenter-ready live** only when all platform receipts, screenshots, reset evidence, and presenter rehearsal are current.

## Historical decisions retained

- LOS is a mature vertical implementation ported from the CLM demo, not the reusable neutral template.
- The internal agent surface and the borrower portal share governed loan-file assets without sharing runtime claims.
- Box owns governed loan-file content; Salesforce `LOS_Loan__c` owns structured credit truth.
- Standard Salesforce external-ID upsert and lookup is the default intake path. Custom Apex is reserved for genuinely custom multi-record, authorization, routing, lifecycle-event, extraction, write-back, or downscoped-token behavior.
- The one governed write (`LosApplyLoanTerms`) is explicit, allow-listed, and human-confirmed; nothing else writes to the loan record from an agent.
- Portable Markdown remains authoritative; self-contained HTML remains a derived sharing layer.

## Forward priority

Run the Box + Salesforce Loan Origination path in confirmed target environments, capture the loan screens (MT-072), and populate `config/runtime/validation-receipts.json`. That is the remaining evidence boundary for full presenter readiness.
