# LOS Demo Workflow - Complete Beat Sequence

This guide shows the complete demo workflow including status transitions.

## Demo Loan States

**LN-2026-0042** (Dockwright Distribution Facility)
- **Starting Status:** Underwriting
- **After Beat 5:** Approved (ready for signature)
- **Final Status:** Commitment (after signature sent)

## Complete Beat Sequence

### Beat 1: Document Discovery
**Status Required:** Any  
**Prompt:**
```
What documents do we have for LN-2026-0042?
```

**Expected Result:**
- Lists 6 documents from `02 - Borrower Documents` folder
- Shows Box file IDs

---

### Beat 2: Risk Search (Metadata Query)
**Status Required:** Any  
**Prompt:**
```
Which loan documents are flagged critical policy risk?
```

**Expected Tool Sequence:**
1. Box MCP → `query_metadata(template="losDocument", query="policyRisk='Critical'")`
2. Box MCP → `get_file_preview` for found file(s)

**Expected Result:**
- Returns 1 file: dockwright-term-sheet-2026-borrower-markup.pdf
- Shows inline preview
- **Uses metadata search** (precise, fast, indexed)
- **NOT** file listing + keyword filtering (imprecise)

---

### Beat 3: Extract & Validate
**Status Required:** Any  
**Prompt:**
```
Extract the loan terms from the marked-up term sheet and validate against policy.
```

**Expected Result:**
- Extracts: $4.8M, 6.85% rate, 120 months, 85% LTV, 1.10 DSCR
- Flags: LTV 85% > 80% exception max, DSCR 1.10 < 1.15 exception min
- Cites: LOS-LTV-001, LOS-LTV-002, LOS-DSCR-001, LOS-DSCR-002

**Apply Terms (Optional):**
```
Apply the amount, rate and term to the record, confirm
```
- Writes $4.8M, 6.85%, 120 months to Salesforce record
- Requires `confirmed=true` parameter

---

### Beat 4: Portfolio Search
**Status Required:** Any  
**Prompt:**
```
What closed loans does Dockwright Logistics have with us?
```

**Expected Result:**
- Returns LN-2023-0311 ($1.5M @ 7.25%, Closed)
- Returns LN-2025-0148 ($2.15M @ 6.95%, Closed)

---

### Beat 5: Generate Commitment Letter (Box MCP)
**Status Required:** Approved or higher  
**Prompt:**
```
Generate the commitment letter for this loan.
```

**Expected Tool Sequence:**
1. LOS → `getLoanPackage` (get folder ID)
2. LOS → `extractLoanTerms` (get terms + policy validation)
3. LOS → `listLoans` (get precedent loans)
4. Query Salesforce for template ID
5. Box MCP → `create_document_from_template` with ALL analysis from steps 2-3

**Expected Result:**
- Generates letter via Box MCP Doc Gen
- Places in loan's Box folder (workspace root or 04 - Credit Approval)
- Letter includes: requested terms, policy analysis, exceptions, precedent, proposed terms
- All placeholders filled (no `{{tags}}` remaining)

**⚠️ Status Transition Required:**

Before Beat 5, advance status from Underwriting → Approved:

```bash
./scripts/advance-loan-status.sh agentforce LN-2026-0042 Approved
```

Or manually in Salesforce UI:
1. Open LN-2026-0042 record
2. Edit Status field
3. Change to "Approved"
4. Save

**Critical:** Agent must provide complete analysis data:
- `requestedPosition` - from marked-up term sheet
- `approvedPosition` - from policy Hub (LOS-LTV-001, etc.)
- `exceptionPosition` - from policy Hub (LOS-LTV-002, etc.)
- `precedentSummary` - from prior closed loans
- `proposedTerms` - what bank will actually offer

**Don't:**
- ❌ Call Doc Gen without complete analysis data (creates empty placeholders)

---

### Beat 6: Send for Signature
**Status Required:** Approved  
**Prompt:**
```
Send the Dockwright commitment letter for signature.
```

**Expected Result:**
- Prepares Box Sign request
- **Returns for human review** (does not auto-send)
- Enforces status check (refuses if not Approved)

**If Status = Underwriting:**
- ✅ **Correct behavior:** Refuses with message that loan must be Approved first
- This demonstrates governance - agent cannot override business rules

**After Signature Sent:**
- Manually advance status to "Commitment":
  ```bash
  ./scripts/advance-loan-status.sh agentforce LN-2026-0042 Commitment
  ```

---

## Demo Reset Workflow

To reset for another demo run:

```bash
# 1. Reset loan status
./scripts/advance-loan-status.sh agentforce LN-2026-0042 Underwriting

# 2. Clear generated commitment letter (optional)
# Delete file from Box: 04 - Credit Approval/dockwright-commitment-letter-2026-DRAFT.pdf

# 3. Reset loan terms to original values (optional)
sf data update record --sobject LOS_Loan__c \
  --record-id a0Kfn000005gHXrEAM \
  --values "Status__c='Underwriting'"
```

---

## Status Progression Reference

```
Application
    ↓
Underwriting ← Start demo here
    ↓
Credit Review
    ↓
Approved ← Required for Beat 5 (Doc Gen) & Beat 6 (Signature)
    ↓
Commitment ← After signature sent
    ↓
Closed
```

**Alternate Path:**
```
Application/Underwriting/Credit Review
    ↓
Declined (rejection path)
```

---

## Governance Rules

| Action | Status Required | Confirmation Required | Can Override? |
|--------|----------------|----------------------|---------------|
| Document Discovery | Any | No | N/A |
| Extract Terms | Any | No | N/A |
| Apply Terms | Any | Yes (`confirmed=true`) | No |
| Generate Letter | Approved+ | No | No |
| Send for Signature | Approved+ | Human review | No |

**Key Point:** The agent **cannot** override status checks or skip confirmation. This is intentional - governed actions enforce business rules.

---

## Complete Demo Script

**Setup (once):**
```bash
# Ensure loan is in Underwriting
./scripts/advance-loan-status.sh agentforce LN-2026-0042 Underwriting
```

**Demo Flow:**

1. **Beat 1-4:** Run in any order (no status dependency)
2. **Advance Status:**
   ```bash
   ./scripts/advance-loan-status.sh agentforce LN-2026-0042 Approved
   ```
3. **Beat 5:** Generate commitment letter
4. **Beat 6:** Send for signature (shows governance refusal if needed)

**Optional - Show Governance:**
Before advancing to Approved, try Beat 5 or 6 to demonstrate the refusal message. Then advance status and retry to show it works.

---

## Timing Reference

Expected timing per beat (after optimizations):

| Beat | Time | Bottleneck |
|------|------|------------|
| Beat 1 | 2-3s | Salesforce API + Box Toolkit |
| Beat 2 | 3-4s | Box metadata query |
| Beat 3 | 5-7s | Box AI extract + policy Hub query |
| Beat 4 | 2-3s | Salesforce SOQL query |
| Beat 5 | 4-6s | Box Doc Gen API |
| Beat 6 | 2-3s | Status check (or refusal) |

**Total demo time:** ~20-30 seconds of tool execution + narration

---

## Troubleshooting

**"Box did not return the contents"**
- ✅ Fixed: `LosLoanPackage` now recurses into subfolders
- Should no longer occur

**"Loan must be in Approved status"**
- ✅ Expected behavior for governance demonstration
- Advance status with script above

**"Box returned 403" (Doc Gen)**
- Use Box MCP connector directly
- Check Box CCG app scopes include Doc Gen

**Slow performance**
- Use Box MCP for Beat 2 (not LOS wrapper)
- Ensure parallel tool calls when possible
- Check network latency to Salesforce/Box

