# Box Metadata Templates - LOS Demo

## Overview

This demo uses Box metadata templates to enable precise, structured searches across the loan portfolio. **Always prefer metadata queries over keyword/filename searches.**

---

## Template: `losDocument`

Applied to individual document files.

### Fields

| Field | Type | Values | Purpose |
|-------|------|--------|---------|
| `documentType` | enum | "Loan Application", "Term Sheet", "Financial Statement", "Tax Return", "Appraisal", "Insurance", "Title Report", "Environmental Report", "Legal Opinion", "Commitment Letter", "Loan Agreement" | Document classification |
| `policyRisk` | enum | "Critical", "High", "Medium", "Low" | Risk flag from policy review |
| `reviewStatus` | enum | "Pending", "Approved", "Rejected" | Approval workflow state |
| `borrowerEntity` | string | e.g., "Dockwright Logistics" | Borrower name for cross-loan search |
| `loanReference` | string | e.g., "LN-2026-0042" | Links document to loan |

### Query Examples

**Find critical risk documents across all loans:**
```
query_metadata(
  template="losDocument",
  query="policyRisk='Critical'"
)
```

**Find all term sheets:**
```
query_metadata(
  template="losDocument",
  query="documentType='Term Sheet'"
)
```

**Find documents pending review:**
```
query_metadata(
  template="losDocument",
  query="reviewStatus='Pending'"
)
```

**Find all documents for a borrower:**
```
query_metadata(
  template="losDocument",
  query="borrowerEntity='Dockwright Logistics'"
)
```

**Find term sheet for specific loan:**
```
query_metadata(
  template="losDocument",
  query="documentType='Term Sheet' AND loanReference='LN-2026-0042'"
)
```

**Find high/critical risk documents for a loan:**
```
query_metadata(
  template="losDocument",
  query="loanReference='LN-2026-0042' AND (policyRisk='Critical' OR policyRisk='High')"
)
```

---

## Template: `losLoan`

Applied to loan workspace folders.

### Fields

| Field | Type | Values | Purpose |
|-------|------|--------|---------|
| `loanId` | string | e.g., "LN-2026-0042" | Primary loan identifier |
| `borrower` | string | e.g., "Dockwright Logistics" | Borrower name |
| `status` | enum | "Application", "Underwriting", "Credit Review", "Approved", "Commitment", "Closed", "Declined" | Current loan status |
| `loanType` | enum | "Commercial Real Estate", "Equipment Finance", "Working Capital", "Construction" | Loan product type |

### Query Examples

**Find all active loan folders:**
```
query_metadata(
  template="losLoan",
  query="status='Underwriting' OR status='Credit Review'"
)
```

**Find folders for a borrower:**
```
query_metadata(
  template="losLoan",
  query="borrower='Dockwright Logistics'"
)
```

---

## Template: `losPolicy`

Applied to credit policy documents in Box Hubs.

### Fields

| Field | Type | Values | Purpose |
|-------|------|--------|---------|
| `policyId` | string | e.g., "LOS-LTV-001" | Policy identifier |
| `category` | enum | "LTV", "DSCR", "Credit Score", "Collateral", "Documentation", "Industry" | Policy domain |
| `status` | enum | "Active", "Superseded", "Draft" | Policy version state |

### Use

Primarily queried via Box Hub QA tools, not direct metadata search.

---

## Template: `losCovenant`

Applied to covenant tracking documents.

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| `covenantType` | enum | Type of covenant (Financial, Operational, etc.) |
| `dueDate` | date | Compliance deadline |
| `complianceStatus` | enum | "Compliant", "Non-Compliant", "Pending Review" |

---

## Template: `losUnderwritingReview`

Applied to underwriting memo documents.

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| `reviewer` | string | Underwriter name |
| `reviewDate` | date | Review completion date |
| `recommendation` | enum | "Approve", "Decline", "Request More Info" |

---

## Search Strategy

### When to Use Metadata Queries

✅ **Use metadata when:**
- Searching by document type (term sheets, appraisals, etc.)
- Filtering by risk level
- Finding documents by borrower across multiple loans
- Checking review status
- Cross-loan portfolio queries

❌ **DON'T use metadata when:**
- Need ALL documents for a specific loan → Use `getLoanPackage`
- Document hasn't been classified yet
- Searching by document content → Use Box AI QA

### Performance

**Metadata queries are:**
- **Indexed** - fast even across thousands of files
- **Precise** - structured fields vs fuzzy keyword matching
- **Governed** - only returns properly classified documents

**Comparison:**
```
Metadata query:        ~500ms  (enterprise-wide)
File listing + filter: ~2-3s   (per folder, must iterate)
Keyword search:        ~1-2s   (returns false positives)
```

### Scope Optimization

**Folder-scoped (faster):**
```
# When you know the folder ID
query_metadata(
  template="losDocument",
  folder_id="<CONFIGURED_ID>",
  query="policyRisk='Critical'"
)
```

**Enterprise-scoped (portfolio-wide):**
```
# Searches all folders
query_metadata(
  template="losDocument",
  query="policyRisk='Critical'"
)
```

---

## Demo Data

### LN-2026-0042 Documents

All 6 documents have `losDocument` metadata:

| File | documentType | policyRisk | reviewStatus |
|------|--------------|------------|--------------|
| dockwright-loan-application-2026.pdf | Loan Application | Medium | Approved |
| dockwright-term-sheet-2026-borrower-markup.pdf | Term Sheet | **Critical** | Pending |
| dockwright-financial-statements-fy2025.pdf | Financial Statement | High | Approved |
| dockwright-tax-return-summary-2025.pdf | Tax Return | Low | Approved |
| dockwright-appraisal-2026.pdf | Appraisal | High | Approved |
| dockwright-insurance-certificate.pdf | Insurance | Low | Approved |

**Beat 2 Query:**
```
query_metadata(template="losDocument", query="policyRisk='Critical'")
→ Returns term sheet (1 file)
```

---

## Creating Metadata via MCP

The LOS connector includes `classifyDocument` action that:
1. Calls Box AI to analyze uploaded document
2. Suggests `losDocument` metadata values
3. Applies metadata to the file

**Not yet exposed to Claude Desktop** - currently Salesforce-only.

---

## Reference

- **Box Metadata API:** https://developer.box.com/guides/metadata/
- **Metadata Query Syntax:** https://developer.box.com/guides/metadata/queries/syntax/
- **Template Definitions:** See `config/box-metadata-templates/` for JSON schemas
