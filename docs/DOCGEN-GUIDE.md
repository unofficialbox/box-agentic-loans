# Box Doc Gen - Commitment Letter Generation

## Issue: Empty Placeholders

If the generated commitment letter shows placeholders like `{{terms.requestedPosition}}` instead of actual values, it means the action was called without the required analysis data.

## Root Cause

The `generateCommitmentLetter` action splits responsibilities:
- **Loan record** provides facts (ID, borrower, amount, status)
- **Caller** provides analysis (policy citations, exceptions, precedents)

The analysis fields are NOT in the loan record - the agent must provide them based on:
1. Extracted loan terms from marked-up term sheet
2. Credit policy Hub validation results
3. Prior executed loan agreements research

## Required Fields

### Minimal (Will generate, but with dashes for missing fields)
```
loanReference: "LN-2026-0042"
policyAtIssue: "LTV and DSCR covenants"
```

### Complete (Fills all placeholders)
```
loanReference: "LN-2026-0042"
policyAtIssue: "LTV and DSCR covenants per LOS-LTV-001, LOS-LTV-002, LOS-DSCR-001, LOS-DSCR-002"

requestedPosition: "Borrower requested: $4.8M at 6.85% for 120 months, 85% LTV, 1.10 DSCR"

approvedPosition: "Standard policy: 80% LTV maximum (LOS-LTV-001), 1.25 DSCR minimum (LOS-DSCR-001)"

exceptionPosition: "Exception approved: Up to 85% LTV for collateral values exceeding $5M (LOS-LTV-002), DSCR as low as 1.15 with compensating factors (LOS-DSCR-002)"

owner: "Credit Risk Committee"

precedentSummary: "Prior executed loans: LN-2023-0311 ($1.5M @ 7.25%, 75% LTV, 1.35 DSCR) and LN-2025-0148 ($2.15M @ 6.95%, 78% LTV, 1.28 DSCR). Both within standard policy limits."

proposedTerms: "$4.8M at 6.85% for 120 months, subject to 82% LTV (not the requested 85%), 1.15 DSCR minimum, and enhanced collateral monitoring."

termSheetReference: "Term Sheet v3 dated 2026-08-15 with borrower markup"
```

## Workflow to Get Complete Data

**Step 1: Extract Terms**
```
Extract the loan terms from the marked-up term sheet for LN-2026-0042
```
→ Returns: $4.8M, 6.85%, 120mo, 85% LTV, 1.10 DSCR

**Step 2: Validate Against Policy**
```
Validate these terms against our credit policy
```
→ Returns: LTV exceeds 80% standard, DSCR below 1.25 minimum, cites LOS-LTV-001/002, LOS-DSCR-001/002

**Step 3: Research Precedent**
```
What closed loans does Harborview Logistics have with us?
```
→ Returns: LN-2023-0311 and LN-2025-0148 with their terms

**Step 4: Generate Letter**
```
Generate commitment letter with all this analysis
```
→ Agent must pass ALL fields from steps 1-3 to the action

## Solution: Use Box MCP

Per MCP-first strategy, use the Box MCP connector's Doc Gen capability:

```javascript
// Box MCP has the right scopes
box_create_document_from_template({
  template_id: "2454763922014",  // From LOS_Box_Config__c
  destination_folder_id: "416352496139",
  output_name: "commitment-letter-LN-2026-0042",
  fields: {
    loan: {
      id: "LN-2026-0042",
      borrower: "Harborview Logistics",
      loanAmount: "4800000",
      status: "Approved"
    },
    terms: {
      requestedPosition: "...",
      approvedPosition: "...",
      exceptionPosition: "...",
      owner: "Credit Risk Committee",
      risk: "High",
      proposedTerms: "..."
    },
    precedent: {
      summary: "..."
    },
    letter: {
      preparedOn: "8 September 2026",
      preparedBy: "Loan Copilot (draft)"
    }
  }
})
```

## Template Tag Reference

The Box Doc Gen template uses these placeholders:

| Template Tag | Data Source | Example Value |
|--------------|-------------|---------------|
| `{{loan.id}}` | Salesforce record | "LN-2026-0042" |
| `{{loan.borrower}}` | Salesforce record | "Harborview Logistics" |
| `{{loan.loanAmount}}` | Salesforce record | "4800000" |
| `{{loan.status}}` | Salesforce record | "Approved" |
| `{{loan.termSheetReference}}` | Caller analysis | "Term Sheet v3 dated 2026-08-15" |
| `{{letter.preparedOn}}` | Auto-generated | "8 September 2026" |
| `{{letter.preparedBy}}` | Auto-generated | "Loan Copilot (draft)" |
| `{{terms.policyAtIssue}}` | Caller analysis | "LTV and DSCR covenants per LOS-LTV-001..." |
| `{{terms.requestedPosition}}` | Caller analysis (from term sheet) | "Borrower requested: $4.8M at 6.85%..." |
| `{{terms.approvedPosition}}` | Caller analysis (from policy Hub) | "Standard policy: 80% LTV maximum..." |
| `{{terms.exceptionPosition}}` | Caller analysis (from policy Hub) | "Exception approved: Up to 85% LTV..." |
| `{{terms.owner}}` | Caller analysis | "Credit Risk Committee" |
| `{{terms.risk}}` | Salesforce record | "High" |
| `{{terms.proposedTerms}}` | Caller analysis | "$4.8M at 6.85% for 120 months..." |
| `{{precedent.summary}}` | Caller analysis (from prior loans) | "Prior executed loans: LN-2023-0311..." |

**Key Point:** The template expects ANALYSIS, not just data extraction. The agent must:
1. Extract terms from documents
2. Cite specific policies
3. Explain exceptions
4. Research precedents
5. Propose final terms

Simply calling `generateCommitmentLetter("LN-2026-0042", "some policy")` will generate a letter with mostly dashes.


## Agent Instructions

Add to Copilot/agent instructions:

```
When generating a commitment letter:
1. Extract loan terms from the marked-up term sheet
2. Validate against credit policy Hub - cite specific policy IDs
3. Research prior loans with this borrower
4. Draft proposed terms (may differ from requested)
5. Use Box MCP create_document_from_template
6. Pass ALL analysis fields - not just loan ID and generic policy

Do not call Doc Gen with incomplete data.
The letter quality depends on the complete analysis you provide.
```

## Testing

**Box MCP approach** - Test via Claude Desktop with both connectors loaded.

**Internal validation** - The LOS connector also works (for technical verification only):
```bash
sf apex run --file /tmp/test-docgen-call.apex --target-org agentforce
```

**Verify generated file:** Check Box folder 416352496139 for `commitment-letter-LN-2026-0042.pdf`

**Verify placeholders filled:** Open PDF, search for `{{` - should find none if data was provided correctly.

**If empty placeholders found:** Agent didn't provide complete analysis fields. Review workflow steps 1-4 above.

