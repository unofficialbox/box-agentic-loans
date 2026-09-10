# Claude Desktop - LOS Demo Connector Strategy

When both **LOS Loan Tools** and **Box** MCP connectors are loaded, use this strategy:

## Search Strategy: Metadata First

**ALWAYS prefer metadata queries over keyword/filename searches.**

Metadata searches are:
- **More precise** - structured fields vs fuzzy text matching
- **Faster** - indexed attributes vs full folder scans
- **Governed** - only returns documents with proper classification

### Static IDs (Never List)

**CRITICAL: These IDs are STATIC. NEVER call list tools - they return hundreds of results and swamp the session.**

- **Metadata template:** `losDocument` (NEVER call `list_metadata_templates`)
- **Doc Gen template ID:** Get from `LOS_Box_Config__c.Commitment_Letter_Template_ID__c` (NEVER call `list_docgen_templates`)
- **Credit Policy Hub ID:** `1488378748` "Acme Credit Policy Library" (NEVER call `list_hubs`)

### Loan Identification

**LOS tools accept EITHER loan ID or Salesforce record ID:**

All LOS connector tools (`getLoanPackage`, `extractLoanTerms`, `applyLoanTerms`, `prepareSignatureRequest`, etc.) accept:
- **Loan ID**: `"LN-2026-0042"` - human-readable identifier
- **Salesforce Record ID**: `"a0bxx000000XXXXX"` - 15 or 18 character Salesforce ID

**When to use which:**
- **Demo/hardcoded scenarios**: Use loan ID (`LN-2026-0042`)
- **Borrower portal (React app)**: Use `recordId` from URL params - the app passes this dynamically
- **Dynamic workflows**: Use `recordId` from Salesforce context, NOT hardcoded loan IDs

**Example - Borrower portal flow:**
```javascript
// React app URL: ?recordId=a0bxx000000ABC123
// Tool call should use the recordId, NOT hardcoded LN-2026-0042:
getLoanPackage({ inputLoan: "a0bxx000000ABC123" })  // ✅ Dynamic
getLoanPackage({ inputLoan: "LN-2026-0042" })       // ❌ Hardcoded demo loan
```

**How to get recordId in borrower portal:**
- React app: Available in URL params (`?recordId=...`) and passed via `salesforceRecordId` in context
- Agentforce: Available in conversation context from the Salesforce record the user is viewing
- The recordId is the Salesforce object ID for the `LOS_Loan__c` record

This ensures Doc Gen, Sign, and all operations work on the loan the borrower is actually viewing, not a hardcoded demo loan.

### Available Metadata Templates

1. **`losDocument`** - Document classification (THE ONLY TEMPLATE YOU NEED)
   - `documentType`: "Loan Application", "Term Sheet", "Financial Statement", "Tax Return", "Appraisal", "Insurance", etc.
   - `policyRisk`: "Critical", "High", "Medium", "Low"
   - `reviewStatus`: "Pending", "Approved", "Rejected"
   - `borrowerEntity`: Borrower name
   - `loanReference`: Loan ID (e.g., "LN-2026-0042")

2. **`losLoan`** - Loan folder metadata (rarely used)
   - Applied to workspace folders
   - Contains loan-level attributes

3. **`losPolicy`** - Credit policy documents (rarely used)
   - Used in Box Hubs for policy library

### Metadata Query Examples

**Template key is STATIC: Always use `template="losDocument"` - never list templates.**

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

**NEVER DO THIS:**
```
❌ Box connector → list_metadata_templates  // Returns thousands of templates, kills session
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
- Hub/policy search → Box connector's `ai_qa_hub` with hub_id `1488378748`

**NEVER:**
- Get source file contents for analysis (use Box AI on IDs). Exception: inspect the exact Doc Gen output to verify merge completion before signing.
- List hubs (Hub ID is static: `1488378748`)
- List templates (metadata template is `losDocument`, Doc Gen template from Salesforce)

**For Box Doc Gen:**
- Commitment letter generation → Box connector's `create_docgen_batch`
- Template ID: Get from `LOS_Box_Config__c.Commitment_Letter_Template_ID__c`
- Destination folder: Get from `getLoanPackage` output

**For File Operations:**
- Finding files → Box connector's `query_metadata` (NEVER list folder contents)
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
   - Template: `losDocument` (STATIC - hardcode this, never list templates)
   - Query: `policyRisk = "Critical"`
   - Scope: enterprise (searches all folders)
2. Box connector → `get_file_preview` for found file(s)

**Why:** Metadata search is precise, fast, and returns only classified documents.

**❌ DON'T:**
- ❌ `list_metadata_templates` - returns thousands of enterprise templates, kills session
- ❌ `search_files` with keyword "critical" (fuzzy, returns unrelated files)
- ❌ `getLoanPackage` + filter in prompt (inefficient, searches one loan at a time)

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

## Example: Beat 5 (Generate Commitment Letter)

Follow [the canonical Doc Gen contract](docs/DOCGEN-GUIDE.md) for `create_docgen_batch`. Resolve the template from Salesforce and the destination from the current loan package. Pass all 15 merge paths under `document_generation_data[].user_input`.

A batch acceptance is not success. Read the matching job, require `completed`, and inspect its exact `output_file.id` for unresolved tags and correct loan terms before previewing or sending. Do not select a generated file by name or metadata search; earlier failed outputs can have nearly identical names. A successful retry does not update an existing Box Sign request.

## Performance Tips

1. **Metadata First:** Use `query_metadata` instead of file listing + filtering
   ```
   ✅ Fast: query_metadata(template="losDocument", query="policyRisk='Critical'")
   ❌ Slow: getLoanPackage for each loan → filter by risk in prompt
   ❌ Slow: list_folder_content → filter in prompt
   ```
   **NEVER list folder contents.** Always use metadata queries with folder scope to find files.

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
- Follow [Doc Gen diagnosis and retry](docs/DOCGEN-GUIDE.md#diagnosis-and-retry).
- Read the exact job's warnings and output file. Do not conclude that typed tags are invalid or blame the template without checking Box's recognized tags.

**For Doc Gen:**
- ✅ Use Box MCP `create_docgen_batch` (direct API, MCP-first)
- ✅ Get template ID from `LOS_Box_Config__c.Commitment_Letter_Template_ID__c`
- ❌ NEVER call `list_docgen_templates` - template ID is static
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
| **File Preview** | Box | `get_file_preview` | Show documents inline |
| **Hub/Policy Search** | Box | Hub QA tools | Box Hubs, not Salesforce |
| **Doc Gen** | Box | `create_docgen_batch` | Direct API, MCP-first |
| **Loan Records** | LOS | `listLoans` | Salesforce SOQL |
| **Governed Actions** | LOS | `extract/apply/sign` | Business rules + validation |

**Default Priority:**
1. **Metadata query** - if searching by attributes
2. **Box MCP direct** - for Box-native operations  
3. **LOS connector** - when Salesforce data or governance needed
