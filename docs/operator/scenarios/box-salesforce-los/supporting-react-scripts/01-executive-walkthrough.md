# Executive Demo: Reading the Borrower's Paper Against Credit Policy

## Demo card

| Item | Value |
|---|---:|
| Duration | 5-6 minutes |
| Audience | Chief credit officer, head of commercial lending, CIO, credit and lending leadership |
| Scenario | Harborview Logistics returns Crestline's term sheet **marked up on their numbers**; Crestline must decide what is outside policy and what to push back on |
| Internal surface | Claude Desktop over the Salesforce (`LOSLoanTools`) and Box MCP servers |
| External surface | Experience Cloud site, scoped to one borrower |
| Core message | The exposure is not in the section labelled Financial Covenants. Only reading the document against a governed credit policy library finds it, and only Extract puts it on the record with a citation. |

## The problem this opens on

Commercial loans close on negotiated paper. Every marked-up term sheet comes back with
different collateral definitions, coverage tests, reporting cadences and pricing -- and that
information drives the credit decision, the covenant calendar and the maturity motion. It
exists only inside a document, sitting outside the systems and the permissions your agents
draw from.

## Why this scenario

The 2026 Harborview term sheet does **not** touch the section titled "Financial Covenants".
The DSCR test is weakened in **Section 9.3 "Financial Reporting"** (moved from quarterly to
annual and restated to 1.10x), and the LTV is inflated through **Schedule A "Collateral"**
(adding furniture, fixtures and equipment at book value). The appraisal came in at
$5,650,000 rather than the $6,000,000 the borrower stated, so LTV on $4.8M is 85%, and
FY2025 NOI covers debt service only 1.12x. A keyword search for "loan-to-value" finds
nothing. That is the demo: a CRM record and a full-text search cannot answer this, and a
governed credit policy library can.

## Scope of this telling

Extract, generation and signature are all real actions here, with two deliberate limits.
`LosExtractLoanTerms` reads and compares; writing the accepted values onto `LOS_Loan__c`
is a separate action (`LosApplyLoanTerms`) that refuses without a person's explicit
confirmation. Box Doc Gen writes the commitment letter into the loan's own folder. Box Sign
**prepares** a signature request and returns a URL -- it sends nothing, and it refuses
outright on a loan that is not Approved or Commitment.

**Nothing in this script has been run against a live org.** Every expected answer comes
from the deterministic fixtures; the CLM predecessor proved the same code path live.

## Pre-demo state

| Check | How |
|---|---|
| Three Harborview loans exist: `LN-2023-0311`, `LN-2025-0148` (both Closed) and `LN-2026-0042` (Underwriting) | Beat 4 needs the two closed ones |
| The Harborview loan folder has a **direct** collaboration for the configured Box user | `GET /2.0/folders/<id>/collaborations` -- inherited access does not downscope |
| `losDocument` metadata applied to the six Harborview documents | Otherwise beat 2's query returns nothing |
| `LOS_Box_Config__c.Credit_Policy_Hub_Id__c` is populated and the Hub holds the `LOS-LTV-*` and `LOS-DSCR-*` policies | Beat 3 depends on it entirely |
| `LOS_Box_Config__c.Loans_Root_Folder_Id__c` names the loans root | Beat 2's query is enterprise-wide without it |
| Claude Desktop connected to the `LOSLoanTools` MCP server, eight tools listed | `listLoans`, `findDocumentsByRisk`, `getLoanPackage`, `askLoanDocument`, `extractLoanTerms`, `applyLoanTerms`, `generateCommitmentLetter`, `prepareSignatureRequest` |
| Borrower user can sign in to the site | See **Known constraints** -- Login As is unavailable for this licence |
| `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` names a registered Box Doc Gen template | Beat 5 refuses without it |
| The demo loan is in **Underwriting** | Beat 5's refusal depends on it |

Open two windows before you start: Claude Desktop on the internal side, a private browser
window for the borrower. Do not switch accounts on stage.

## Script

### Beat 1 — Their paper arrives (45 seconds)

**Say**

> Harborview sent our term sheet back marked up. Their CFO does not sign our numbers, so
> this is the document we are underwriting.

**Show**

- The loan's Box folder and `harborview-term-sheet-2026-borrower-markup.pdf` in the workspace preview.
- Scroll the markup: the section titled **Financial Covenants is untouched**. The red lines are in 9.3 and in Schedule A.

**Land**

One folder per loan, provisioned and governed by Box. The credit record lives in
Salesforce; the document never leaves Box.

### Beat 2 — The portfolio already knows what is risky (45 seconds)

**Say**

> Before anyone reads a page, the content itself has been classified.

**Show**

- One `search_files_metadata` query against the `losDocument` template, `policyRisk = Critical`,
  **scoped by `ancestor_folder_id` to the loans root folder**.
- The marked-up term sheet comes back Critical. Ask for High or above and the financial
  statements and the appraisal join it -- the three documents beat 3 is about to read together.

**Scope the query or it is wrong on stage.** Box metadata is enterprise-wide, so an unscoped
search also returns documents from earlier demo environments -- folders like
`LOS-2026-Harborview1` that are not governed loan folders at all. Those carry the same file
names as the current copies but different file IDs, which reads to an audience as the wrong
borrower appearing. `ancestor_folder_id` is what makes the query mean "across the governed
portfolio" rather than "across everything anyone ever uploaded".

**Land**

Box metadata is the retrieval index. This is one query, not a folder listing and six reads.
`documentType` makes "find the appraisal" deterministic instead of a filename guess.

**Presenter honesty:** this tagging was applied by hand. A metadata cascade policy on the
loan folder is what makes it survive the next loan, and that is not built yet.

### Beat 3 — Extract the terms, then read them against policy (90 seconds)

This is the beat the demo exists for. Run it in Claude Desktop.

**Prompt**

> Extract the loan terms from the Harborview application package and validate them against
> the record, then tell me where we are outside credit policy and cite the policy library.

**Expected response**

- Extracted with a citation per field: $4,800,000 requested, 6.85%, 120 months, collateral
  value **$5,650,000** (the appraisal, not the borrower's $6,000,000), **LTV 85%**, **DSCR
  1.12x**. Validation flags LTV and DSCR against the record.
- Exposure in **Section 9.3 Financial Reporting** -- the DSCR test moved from quarterly to
  annual and restated to 1.10x.
- Exposure in **Schedule A Collateral** -- FF&E added to the collateral pool at book value,
  which is how the borrower reached $6,000,000.
- Policy **LOS-LTV-001**: max 75% on a bank-ordered appraisal, FF&E excluded; approved
  exception **LOS-LTV-002**: 80% with a 12-month interest reserve and an additional guaranty.
- Policy **LOS-DSCR-001**: min 1.25x tested quarterly; approved exception **LOS-DSCR-002**:
  1.15x with six months' debt service in a cash reserve.
- 85% / 1.12x is **outside even the approved exceptions**; the deviation is owned by
  **Credit Risk** (Priya Shah, Chief Credit Officer).

**Land**

> A CRM record cannot find this -- the borrower's number is what was typed into it. A
> keyword search for "loan-to-value" returns nothing, because the markup never uses the
> phrase. The document had to be read against a governed library of what we have already
> approved, and the answer came back with the policy id and the owner attached.

**Then say what it costs.** A markup like this is what holds up the credit committee and
pushes closing out of the forecasted quarter. The point is not that the agent found it -- it
is that the loan officer now has the approved exception and the named owner in the same
answer, which is what removes a week of back-and-forth.

**Then accept the terms.** Say "apply those values to the record" and confirm when asked.
`applyLoanTerms` refuses without `confirmed = true`; with it, the allow-listed fields update
and nothing else does. That confirmation is the only write in the demo.

### Beat 4 — What they agreed the last two times (45 seconds)

The policy library says the position is off-policy. This says something better.

**Prompt**

> Compare the LTV and DSCR covenants across the two Harborview loans we have already closed
> and this 2026 term sheet. What did Harborview actually agree before?

**Expected response**

- **2023** (revolving line of credit) and **2025** (equipment term loan) both carry a
  negotiated **70% LTV** and a **1.30x DSCR covenant tested quarterly**, recorded in
  **Schedule 1** of each executed loan agreement.
- Both were signed by Priya Shah for Crestline and Jordan Pike for Harborview.
- The **2026** markup regresses both: annual testing at 1.10x, and a collateral definition
  the 2023 and 2025 agreements expressly excluded.

**Land**

> Harborview is not asking for something new. Their markup walks back two positions their
> own CFO agreed, in writing, twice. That is not a policy argument any more -- it is a
> course-of-dealing argument, and it is the one that actually moves a credit conversation.

### Beat 5 — Put the terms on paper, and stop there (60 seconds)

**Prompt**

> Draft the commitment letter for this Harborview loan at the approved terms, using the
> policy exception and the precedent from the closed loans.

**Show**

- `commitment-letter-LN-2026-0042.pdf` appearing in the loan's own Box folder.
- The letter: borrower and borrowing entity, amount, rate, term, collateral, the covenants
  at issue (9.3 and Schedule A), `LOS-LTV-002` and `LOS-DSCR-002` as the approved
  exceptions, **Credit Risk** as the owner, the precedent, the proposed terms -- and on its
  face, that it is a draft pending Credit Committee approval.

**Land**

> Nothing on that page was typed. The approved position came from the policy library, the
> precedent from the executed loan agreements, the loan facts from the Salesforce record.
> The letter is generated into the folder it belongs to, and it says on its face that it is
> a draft and approves nothing.

**Then show the boundary.** Ask for it to be sent for signature:

> Loan LN-2026-0042 is Underwriting, not Approved or Commitment. Signature is blocked until
> Credit Committee approves the terms; I cannot move it forward myself.

That refusal is a state check in Apex, not a prompt instruction. Once the loan *is*
approved, the action still only *prepares* the request and hands back a URL -- a person
opens it, sees the signer, and presses send.

### Beat 6 — The same platform, scoped to the other side (60 seconds)

**Say**

> The borrower gets a view of the same governed loan file, bounded to what is theirs.

**Show**

- The Experience Cloud site signed in as Dana Whitfield, Harborview Logistics.
- Her three Harborview loans. No Pinecrest, no Crestline-internal record.

**Land**

> Same content, same page, a different person -- and a different result. Nobody configured a
> view for them. Record access is enforced by a Salesforce sharing set on
> `Borrower_Account__c`, the query runs `with sharing`, and the Box token is downscoped
> to one folder. The analysis from beat 3 -- our policy, our exceptions, our owner, our
> risk rating -- never crosses to this side.

**There is no agent on this page, and that is the point to make.** Everything a borrower
would ask one -- is the commitment signed, what did we agree, what do you need from me --
is already on the screen. What an agent could reach that they cannot -- the internal
markup analysis, the credit policy library, our exception positions -- is the reason it is
not here.

## Close

> Salesforce holds the credit record. Box governs the loan file and the approved policy.
> The internal team works headlessly through MCP, the borrower works through the portal,
> and the boundary between them is enforced by the platforms, not by the prompt.

## Pass criteria

1. The marked-up term sheet renders from live Box, and the audience sees the Financial Covenants section untouched.
2. One metadata query returns the Critical document scoped to the loans root.
3. Extract returns the seven fields with citations and flags LTV and DSCR; Apply refuses until confirmed.
4. The policy answer names 9.3, Schedule A, `LOS-LTV-001`, `LOS-LTV-002`, `LOS-DSCR-001`, `LOS-DSCR-002`, and Credit Risk.
5. The precedent answer names 70% and 1.30x in both closed agreements and the regression in the 2026 markup.
6. The commitment letter is generated into the loan's own folder with no unresolved template tags.
7. The signature request is refused while the loan is in Underwriting.
8. The borrower view shows only Harborview's loans, with Internal documents withheld.

## Known constraints

Read these before presenting. Each is a real limitation, not a setup error.

- **The borrower portal carries no agent, and that was a decision.** A Service Agent
  (`ExternalCopilot` / `EinsteinServiceAgent`) runs as its assigned agent user rather than
  as the person signed in, and takes the loan it answers about from the conversation. None
  of the page's scoping would reach it: it could read an Internal document the page
  withholds, and the policy library holding Crestline's exception positions.

  This is a property of the agent type, not of Agentforce. An **Employee Agent** inherits the
  permissions of the logged-in user and takes no agent user, which is the surface on which a
  conversational beat is worth building -- and the surface the storyboard's flow 6 assumes.
- **Login As is unavailable for the borrower user.** The Customer Community licence does
  not offer it. Set the user's password by reset and sign in to the site in a private
  window instead.
- **Loan folders need a direct Box collaboration.** A freshly provisioned folder inherits
  access, which is not enough to downscope a token; the workspace reports an
  `invalid_resource` error that reads like a scope problem. `LosBoxFolderService` grants it
  on provisioning -- verify it for any folder created another way.
- **The `losLoan` template is applied to the workspace folder, not to every loan folder**,
  so loan-level facts are searchable for the demo workspace only.

## Where this story goes next

The write-back exists (`LosApplyLoanTerms`) and has never been run live. Once it has, the
remaining gap is the tail of flow 5: Extract on the *executed* commitment letter setting
maturity, first-payment and covenant-review dates and creating the covenant task. That is
specified in `config/box/automate-workflows.bcl` and not built.

## References

- [Box + Salesforce Loan Origination scenario](../README.md)
- [Salesforce loan record](../../../../use-case-creator/salesforce-loan-record.md)
- [Operator setup and activation](../../../start-here.md)
- [Supporting React scripts](README.md)
