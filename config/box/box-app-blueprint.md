# Box App Blueprint: Loan Origination

This is a portable layout specification. Bind it to the folders, files, metadata templates, and Hub created in the target environment. Do not record target-environment App, page, folder, or file identifiers here; keep those in runtime state or audit receipts.

**Structure:** carried over from the CLM predecessor's live-verified App layout, with loan vocabulary. The loans App has not yet been built in any environment.

The App uses two pages. Page order and block order below match the predecessor's verified layout.

## Page 1 - Home

### 1. Quick Actions & Portfolio

Section header: `Quick Actions & Portfolio`. Place the action row above the charts.

| Order | Block | Type | Subtitle | Source |
|---:|---|---|---|---|
| 1 | Start a New Application | Folder action | Upload an application package to the intake folder and apply LOS loan metadata to begin the governed intake workflow | Generated `01 - Application Intake` folder |
| 2 | Credit Policy Hub | Link | Lending standards, approved exceptions, owners, and review cadence | Target environment's published Credit Policy Hub |
| 3 | Executed Loans | Link | Closed loans, covenants, and maturity-ready records | Generated `06 - Executed Loan Documents` folder |
| 4 | Document Approval Status | Donut | - | `losDocument.approvalStatus` |
| 5 | Document Risk Profile | Donut | - | `losDocument.policyRisk` |
| 6 | Documents by Type | Bar | - | `losDocument.documentType` |
| 7 | Loan File Status | Bar | - | `losDocument.versionStatus` |

Use three action cards in one row, then two equal chart columns. Do not add a second intake action block.

The action block is named `Credit Policy Hub`. The Credit Policy Library page uses the longer `Open Credit Policy Hub` for the equivalent link.

### 2. Harborview Deal Room

Section header: `Harborview Deal Room`. One full-width card list, in this order:

1. Generated loan workspace folder
2. Loan application PDF
3. Borrower-marked-up term sheet PDF
4. Appraisal PDF
5. FY2025 financial statements PDF
6. Generated covenants folder

### 3. Intake and Actions

Section header: `Intake and Actions`.

| Block | Type | Filter |
|---|---|---|
| Pending High-Risk Reviews | Table | `losDocument.approvalStatus = Pending` and `losDocument.policyRisk in (High, Critical)` |

Columns: Name, Document Type, Version Status, Policy Risk, AI Summary Status, Approval Status, Signature Status, Location, Content Modified, Updated.

This is one combined table. Earlier revisions of the predecessor blueprint specified a separate pending-approvals table and critical-risk view; the live App merged both into this single block. Keep the merged form unless the owner asks to split it.

With the deterministic seeds this table lists the term-sheet markup (Critical) and the financial statements (High); the appraisal is High but Approved, so it is excluded.

### 4. Executed Loans and Maturities

Section header: `Executed Loans and Maturities`.

| Block | Type | Source |
|---|---|---|
| Executed loan documents folder card | Card | Generated `06 - Executed Loan Documents` folder |
| Open Covenants | Table | `losCovenant.status = Open` |

Columns: Name, Covenant Type, Owner, Due Date, Source Section, Status, Reminder Window Days, Location, Content Modified, Updated.

No maturity-calendar block exists in the predecessor App. Add one sorted by `maturityDate` only on owner request; do not treat its absence as a defect.

## Page 2 - Credit Policy Library

Section header: `Credit Policy Library`

Description: `Governed lending standards and approved exceptions, ownership, review cadence, and usage signals for deal teams.`

| Order | Block | Type | Subtitle | Source |
|---:|---|---|---|---|
| 1 | Approved Standards | Metric card | Approved policy positions with current owners and review dates. | Approved `losPolicy` standard positions |
| 2 | Policy Source Files | Folder card | Standards, approved exceptions, and governance notes in governed Box folders. | Generated `Credit Policies` folder |
| 3 | Open Credit Policy Hub | Link | Published standards, approved exceptions, owners, and review cadence | Target environment's Hub |
| 4 | Standard vs Exception | Donut | - | `losPolicy.position` |
| 5 | Policies by Family | Donut | - | `losPolicy.policyFamily` |
| 6 | Policy Approval Status | Donut | - | `losPolicy.approvalStatus` |

Three action cards in one row, then two equal chart columns. `Approved Standards` displays the approved policy count as its metric.

## Chart consistency invariants

These must hold in any bound environment. They are structural, not fixture-specific.

- Every Home document chart resolves to the same document total: `Document Approval Status`, `Document Risk Profile`, `Documents by Type`, and `Loan File Status`.
- `Pending High-Risk Reviews` row count equals the High plus Critical slices of `Document Risk Profile` that are also Pending.
- Every Credit Policy Library chart resolves to the same policy total: `Standard vs Exception`, `Policies by Family`, and `Policy Approval Status`.

## Known presentation risks

Observed in the predecessor's live App. None are layout errors; all affect presenter quality, and the loan seeds were chosen to avoid the first two.

| Risk | Detail | Suggested fix |
|---|---|---|
| App name carries build scaffolding | The builder appends a `-<timestamp>` suffix to the title | Rename to `Loan Origination` before presenting |
| Single-category donut | `Policy Approval Status` renders 100 percent Approved as a solid ring | Seed one non-approved policy, or drop the block |
| Flat bar chart | `Documents by Type` renders every type at 1 when every seeded document has a different type | The six loan seeds use six types; add a second Financial Statement or drop the block if it reads flat |
| Truncated labels | `Documents by Type` may clip `Financial S...` and `Term Sh...`; action card subtitles and the executed-loans card title may clip at desktop width | Shorten labels or widen the blocks |
| Covenant naming | `Open Covenants` shows the folder name in its Name column rather than a covenant title | Give covenant records a descriptive name (`DSCR Test - Q1 2027`) |

## Tone and boundary

Make the App feel operational: representative metadata, clear ownership, visible work, useful charts, and convenient actions. Box Apps construction remains browser-only; obtain approval immediately before publishing.

## Build and validation

1. Create **Loan Origination** from the generated workspace. Do not leave a build timestamp in the App name.
2. Put the three quick actions first and keep them visible without scrolling.
3. Use two equal chart columns; drag and resize blocks instead of building a long single column.
4. Set the description to `Operational LOS cockpit for governed application intake, document risk, credit approvals, credit policy, closing, and covenant readiness.`
5. Preview at desktop width, save, and obtain owner approval immediately before publishing.
6. Verify exactly one intake action (the `01 - Application Intake` folder card), working Hub and folder links, non-empty charts, generated deal-room items, filtered pending work, and all Credit Policy Library blocks.
7. Verify the chart consistency invariants above and confirm no chart renders a single category or all-equal bars.
8. Confirm the deal-room and review tables reference the intended term-sheet sample file version.
