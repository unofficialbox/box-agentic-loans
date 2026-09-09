# Claude Desktop - LOS Demo Connector Strategy

When both **LOS Loan Tools** and **Box** MCP connectors are loaded, use this strategy:

## Search Strategy: Metadata First

**ALWAYS prefer metadata queries over keyword/filename searches.**

Metadata searches are:
- **More precise** - structured fields vs fuzzy text matching
- **Faster** - indexed attributes vs full folder scans
- **Governed** - only returns documents with proper classification

### Available Metadata Templates

1. **`losDocument`** - Document classification
   - `documentType`: "Loan Application", "Term Sheet", "Financial Statement", "Tax Return", "Appraisal", "Insurance", etc.
   - `policyRisk`: "Critical", "High", "Medium", "Low"
   - `reviewStatus`: "Pending", "Approved", "Rejected"
   - `borrowerEntity`: Borrower name
   - `loanReference`: Loan ID (e.g., "LN-2026-0042")

2. **`losLoan`** - Loan folder metadata
   - Applied to workspace folders
   - Contains loan-level attributes

3. **`losPolicy`** - Credit policy documents
   - Used in Box Hubs for policy library

### Metadata Query Examples

**Find critical risk documents:**
```
Box connector → query_metadata(template="losDocument", query="policyRisk='Critical'")
```

**Find all term sheets for a loan:**
```
Box connector → query_metadata(template="losDocument", query="documentType='Term Sheet' AND loanReference='LN-2026-0042'")
```

**Find pending review documents:**
```
Box connector → query_metadata(template="losDocument", query="reviewStatus='Pending'")
```

**Find all documents for a borrower:**
```
Box connector → query_metadata(template="losDocument", query="borrowerEntity='Harborview Logistics'")
```

### When NOT to Use Metadata

Only fall back to keyword/listing when:
- User asks for ALL documents (not filtered by type/risk/status)
- Document hasn't been classified yet
- Search is by file content, not attributes

## Connector Selection Guide

### Use Box MCP Directly (Faster & More Capable)

**For Beat 2 - Risk Search:**
```
Which loan documents are flagged critical policy risk?
```
→ Use Box connector's `query_metadata` to search `losDocument` template for `policyRisk=Critical`

**For Box AI Operations:**
- Document QA → Box connector's `box_ai_ask`
- Term extraction → Box connector's `box_ai_extract`
- Hub/policy search → Box connector's Hub QA tools

**For Box Doc Gen:**
- Commitment letter generation → Box connector's `create_document_from_template`
- Template ID: Get from `LOS_Box_Config__c.Commitment_Letter_Template_ID__c`
- Destination folder: Get from `getLoanPackage` output

**For File Operations:**
- File listing → Box connector
- File preview → Box connector's `get_file_preview` (ALWAYS show after citing)
- Metadata operations → Box connector

### Use LOS Loan Tools Connector

**For Beat 4 - Portfolio Search:**
```
What closed loans does Harborview Logistics have with us?
```
→ Use LOS connector's `listLoans` with borrower filter

**For Governed Actions:**
- `extractLoanTerms` - Extract + validate against Salesforce record + credit policy
- `applyLoanTerms` - Write to Salesforce (requires confirmation)
- `prepareSignatureRequest` - Box Sign + Salesforce status enforcement

**For Loan Record Operations:**
- CRUD on `LOS_Loan__c` records
- Cross-system queries that need both Box + Salesforce data

## File Preview Rule

**ALWAYS show document previews after citing:**

❌ **Wrong:**
```
Source: harborview-term-sheet-2026-borrower-markup.pdf
```

✅ **Correct:**
```
Source: harborview-term-sheet-2026-borrower-markup.pdf
[calls Box connector's get_file_preview with file ID]
```

After answering with information from a Box document, immediately call `get_file_preview` to show the document inline. Never stop at just a filename or link.

## Example: Beat 2 (Risk Search) - Metadata First

**Prompt:** Which loan documents are flagged critical policy risk?

**✅ CORRECT Tool Sequence (Metadata):**
1. Box connector → `query_metadata` 
   - Template: `losDocument`
   - Query: `policyRisk = "Critical"`
   - Scope: enterprise (searches all folders)
2. Box connector → `get_file_preview` for found file(s)

**Why:** Metadata search is precise, fast, and returns only classified documents.

**❌ DON'T:**
- Box connector → `search_files` with keyword "critical" (fuzzy, returns unrelated files)
- LOS connector → `getLoanPackage` + filter in prompt (inefficient, searches one loan at a time)

**More Metadata Search Examples:**

**"Show me all term sheets"**
```
query_metadata(template="losDocument", query="documentType='Term Sheet'")
```

**"Find documents pending review"**
```
query_metadata(template="losDocument", query="reviewStatus='Pending'")
```

**"What documents do we have for Harborview Logistics?"**
```
query_metadata(template="losDocument", query="borrowerEntity='Harborview Logistics'")
```

## Example: Beat 3 (Extract & Validate)

**Prompt:** Extract loan terms from the marked-up term sheet and validate against policy.

**Tool Sequence:**
1. ✅ LOS connector → `getLoanPackage` (gets file IDs + Salesforce record)
2. ✅ LOS connector → `extractLoanTerms` (extracts + validates in one call)
3. ✅ Box connector → `get_file_preview` of term sheet

**Why LOS connector here:** Needs cross-validation against Salesforce record + credit policy Hub. Box AI alone can't compare to the record.

## Example: Beat 4 (Portfolio Search)

**Prompt:** What closed loans does Harborview Logistics have with us?

**Tool Sequence:**
1. ✅ LOS connector → `listLoans` with borrower="Harborview Logistics", status="Closed"

**Why LOS connector here:** Salesforce records, not Box files.

---

## Example: Beat 5 (Generate Commitment Letter) - Box MCP

**Prompt:** Generate the commitment letter for this loan.

**✅ CORRECT Tool Sequence (Box MCP):**
1. LOS connector → `getLoanPackage('LN-2026-0042')` - get folder ID
2. LOS connector → `extractLoanTerms` - get extracted terms & policy validation
3. LOS connector → `listLoans(borrower='Harborview Logistics', status='Closed')` - get precedent
4. Query Salesforce for template ID:
   ```sql
   SELECT Commitment_Letter_Template_ID__c FROM LOS_Box_Config__c
   ```
5. Box connector → `create_document_from_template` with:
   ```javascript
   {
     template_id: "2454763922014",  // From step 4
     destination_folder_id: "416352496139",  // From step 1
     output_name: "commitment-letter-LN-2026-0042",
     fields: {
       loan: {
         id: "LN-2026-0042",
         borrower: "Harborview Logistics",
         loanAmount: "4800000",
         status: "Approved",
         termSheetReference: "Term Sheet v3 dated 2026-08-15"
       },
       terms: {
         policyAtIssue: "LTV and DSCR covenants per LOS-LTV-001, LOS-LTV-002, LOS-DSCR-001, LOS-DSCR-002",
         requestedPosition: "Borrower requested: $4.8M at 6.85% for 120 months, 85% LTV, 1.10 DSCR",
         approvedPosition: "Standard policy: 80% LTV maximum (LOS-LTV-001), 1.25 DSCR minimum (LOS-DSCR-001)",
         exceptionPosition: "Exception approved: Up to 85% LTV for collateral values exceeding $5M (LOS-LTV-002), DSCR as low as 1.15 with compensating factors (LOS-DSCR-002)",
         owner: "Credit Risk Committee",
         risk: "High",  // From loan record
         proposedTerms: "$4.8M at 6.85% for 120 months, subject to 82% LTV, 1.15 DSCR minimum, enhanced monitoring"
       },
       precedent: {
         summary: "Prior executed loans: LN-2023-0311 ($1.5M @ 7.25%, 75% LTV, 1.35 DSCR) and LN-2025-0148 ($2.15M @ 6.95%, 78% LTV, 1.28 DSCR). Both within standard policy limits."
       },
       letter: {
         preparedOn: "8 September 2026",
         preparedBy: "Loan Copilot (draft)"
       }
     }
   }
   ```

**Why Box MCP here:** 
- Direct API access (MCP-first strategy)
- Faster than going through Salesforce
- Consistent with metadata-first approach

**Critical:** All `fields` values must come from prior analysis (steps 2-3), NOT placeholder text. Empty fields result in unfilled `{{placeholders}}` in the PDF.

**❌ DON'T:**
- Call Doc Gen without complete analysis data (results in empty placeholders)

## Performance Tips

1. **Metadata First:** Use `query_metadata` instead of file listing + filtering
   ```
   ✅ Fast: query_metadata(template="losDocument", query="policyRisk='Critical'")
   ❌ Slow: getLoanPackage for each loan → filter by risk in prompt
   ```

2. **Parallel Tool Calls:** When operations are independent, call tools in parallel
   ```
   [getLoanPackage for LN-2026-0042] + [getLoanPackage for LN-2023-0311]
   ```

3. **Direct over Wrapped:** Box MCP direct calls are ~2-3x faster than going through Salesforce
   ```
   ✅ Fast: Box connector → query_metadata (direct API)
   ❌ Slow: Salesforce → Box (extra round trip)
   ```

4. **Avoid Redundant Lookups:** Cache loan package data within a turn

5. **Batch Box Operations:** Use Box AI multi-file QA when asking about multiple documents

6. **Scope Metadata Queries:** Use folder scope when loan is known, enterprise scope when searching portfolio-wide
   ```
   # Searching one loan's folder - faster
   query_metadata(template="losDocument", folder_id="416352496139", query="policyRisk='Critical'")
   
   # Searching entire portfolio
   query_metadata(template="losDocument", query="policyRisk='Critical'")
   ```

## Troubleshooting

**If `getLoanPackage` returns empty:**
- ✅ FIXED: Now recurses into "02 - Borrower Documents" subfolder
- Documents should be found automatically

**If `extractLoanTerms` refuses file:**
- Ensure file ID came from `getLoanPackage` output
- File must be in the loan's governed folder

**If Doc Gen has empty placeholders:**
- Must provide ALL analysis fields from prior steps
- `requestedPosition` from extractLoanTerms
- `approvedPosition` from policy Hub validation
- `exceptionPosition` from policy Hub
- `precedentSummary` from portfolio research
- `proposedTerms` from your analysis
- See `docs/DOCGEN-GUIDE.md` for complete workflow

**For Doc Gen:**
- ✅ Use Box MCP `create_document_from_template` (direct API, MCP-first)
- Must provide complete analysis data to fill all placeholders

## Summary

### Search Decision Tree

```
Need to find documents?
  ├─ Can filter by type/risk/status/borrower? → Box metadata query
  ├─ Need ALL docs for a specific loan? → LOS getLoanPackage
  ├─ Need loan records (not files)? → LOS listLoans
  └─ Searching policy library? → Box Hub QA
```

### Operation Reference

| Operation | Connector | Method | Why |
|-----------|-----------|--------|-----|
| **Document Search** | Box | `query_metadata` | Precise, fast, indexed |
| Find by risk level | Box | `query_metadata(policyRisk=...)` | Structured field |
| Find by document type | Box | `query_metadata(documentType=...)` | Structured field |
| Find by loan reference | Box | `query_metadata(loanReference=...)` | Structured field |
| Get loan's docs | LOS | `getLoanPackage` | Returns governed set |
| **Box AI** | Box | `box_ai_ask`, `box_ai_extract` | Direct, faster |
| **File Operations** | Box | `get_file_preview`, etc. | Native Box operations |
| **Hub/Policy Search** | Box | Hub QA tools | Box Hubs, not Salesforce |
| **Doc Gen** | Box | `create_document_from_template` | Direct API, MCP-first |
| **Loan Records** | LOS | `listLoans` | Salesforce SOQL |
| **Governed Actions** | LOS | `extract/apply/sign` | Business rules + validation |

**Default Priority:**
1. **Metadata query** - if searching by attributes
2. **Box MCP direct** - for Box-native operations  
3. **LOS connector** - when Salesforce data or governance needed
