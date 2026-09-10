# Document Upload Guide

**Required documents for demo beats to work.** Upload these files to Box and apply the specified metadata.

---

## Folder 1: LN-2026-0042 (Harborview Logistics - Current Loan)

**Box Folder ID:** `416352496139`  
**Direct Upload Link:** https://app.box.com/folder/416352496139

### Required Files:

#### 1. Term Sheet with Borrower Markup (CRITICAL)
**Filename:** `harborview-term-sheet-2026-borrower-markup.pdf` ✅ **EXISTS in /output/pdf**

**Content Requirements:**
- Bank's original offer clearly stated:
  - Loan Amount: $4,800,000
  - Interest Rate: 6.85% fixed
  - Term: 120 months (10 years)
  - Section 8.1 LTV: 75% maximum (bank standard)
  - Section 8.2 DSCR: 1.25x minimum (bank standard)
  
- Borrower's markup (must be clearly labeled as "HARBORVIEW MARKUP" in red):
  - Section 3.1: Requested Rate: 6.50% (vs. bank's 6.85%)
  - Section 6.1: Limited guaranty capped at $1M each (vs. unlimited)
  - Section 9.3: Annual testing and 1.10x DSCR (vs. quarterly 1.25x)
  - Schedule A: Include FF&E in collateral valuation
  
- Document dated: July 21, 2026
- Shows borrower asking for MORE AGGRESSIVE terms than their 70%/1.30x precedent

**Required Metadata Template:** `losDocument`
```json
{
  "documentType": "Term Sheet",
  "policyRisk": "Critical",
  "approvalStatus": "Pending",
  "borrowerEntity": "Harborview Logistics",
  "loanReference": "LN-2026-0042"
}
```

**How to Apply Metadata:**
1. Upload the file to Box folder 416352496139
2. Right-click file → More Actions → Apply Metadata
3. Select template "losDocument" (enterprise_1023254676.losDocument)
4. Fill in the fields exactly as shown above
5. Save

---

#### 2. FY2025 Financial Statements (OPTIONAL - for "High or above" search)
**Filename:** `harborview-fy2025-financials.pdf`

**Content:** Annual financial statements showing revenue, cash flow for DSCR calculation

**Required Metadata:**
```json
{
  "documentType": "Financial Statement",
  "policyRisk": "High",
  "approvalStatus": "Pending",
  "borrowerEntity": "Harborview Logistics",
  "loanReference": "LN-2026-0042"
}
```

---

#### 3. Property Appraisal (OPTIONAL - for "High or above" search)
**Filename:** `harborview-appraisal-2026.pdf`

**Content:** Commercial real estate appraisal showing $5.65M property value

**Required Metadata:**
```json
{
  "documentType": "Appraisal",
  "policyRisk": "High",
  "approvalStatus": "Pending",
  "borrowerEntity": "Harborview Logistics",
  "loanReference": "LN-2026-0042"
}
```

---

## Folder 2: LN-2023-0311 (Harborview Logistics - Closed Loan #1)

**Box Folder ID:** `416383268715`  
**Direct Upload Link:** https://app.box.com/folder/416383268715

### Required Files:

#### Executed Loan Agreement - 2023
**Filename:** `harborview-loan-agreement-2023-executed.pdf` ✅ **EXISTS in /output/pdf**

**Content Requirements:**
- Borrower: Harborview Logistics
- Loan Amount: $1,500,000
- Interest Rate: 7.25% (SOFR + 2.75%)
- Date: September 15, 2023
- **Must include Section 8 (Financial Covenants) with:**
  - Section 8.1 LTV: 70% maximum
  - Section 8.2 DSCR: 1.30x minimum
- **Must include Section 9.3 (Financial Reporting):**
  - Quarterly compliance certificates
  - DSCR tested quarterly on trailing twelve months
- **Must include Schedule 1 (Negotiated Covenants) with:**
  - Table showing standard form vs. as-executed terms
  - Shows 75%→70% LTV and 1.25x→1.30x DSCR negotiations
- **Must have signature page with:**
  - Borrower signature: Jordan Pike (CFO)
  - Lender signature: Priya Shah (Chief Credit Officer)
  - Date: September 15, 2023

**Required Metadata:**
```json
{
  "documentType": "Loan Agreement",
  "policyRisk": "Low",
  "approvalStatus": "Approved",
  "borrowerEntity": "Harborview Logistics",
  "loanReference": "LN-2023-0311"
}
```

---

## Folder 3: LN-2025-0148 (Harborview Logistics - Closed Loan #2)

**Box Folder ID:** `416381677501`  
**Direct Upload Link:** https://app.box.com/folder/416381677501

### Required Files:

#### Executed Loan Agreement - 2025
**Filename:** `harborview-loan-agreement-2025-executed.pdf` ✅ **EXISTS in /output/pdf**

**Content Requirements:**
- Borrower: Harborview Logistics
- Loan Amount: $2,150,000 (equipment term loan)
- Interest Rate: 6.95% fixed
- Date: May 20, 2025
- **Must include Section 8 (Financial Covenants) with:**
  - Section 8.1 LTV: 70% maximum (same as 2023)
  - Section 8.2 DSCR: 1.30x minimum (same as 2023)
- **Must include Section 9.3 (Financial Reporting):**
  - Quarterly compliance certificates
  - DSCR tested quarterly on trailing twelve months
- **Must include Schedule 1 (Negotiated Covenants)**
  - Table showing same 70% LTV / 1.30x DSCR as 2023 agreement
- **Must have signature page with:**
  - Borrower signature: Jordan Pike (CFO) - same as 2023
  - Lender signature: Priya Shah (Chief Credit Officer) - same as 2023
  - Date: May 20, 2025

**Required Metadata:**
```json
{
  "documentType": "Loan Agreement",
  "policyRisk": "Low",
  "approvalStatus": "Approved",
  "borrowerEntity": "Harborview Logistics",
  "loanReference": "LN-2025-0148"
}
```

---

## Beat-by-Beat Document Usage

| Beat | Required Files | What Gets Extracted |
|------|----------------|---------------------|
| Beat 2 | LN-2026-0042: Term sheet with policyRisk="Critical" | Metadata search finds the critical-risk document |
| Beat 3 | LN-2026-0042: Term sheet with borrower markup | Box AI extracts: $4.8M, 6.50% requested, 1.10x DSCR, compares to policy Hub |
| Beat 3a | (uses Beat 3 data) | Validates extracted terms against Salesforce record |
| Beat 3b | (uses Beat 3 data) | Applies amount/rate/term to record with confirmation |
| Beat 4 | LN-2023-0311 + LN-2025-0148: Executed agreements | Box AI multi-file QA compares covenants: **Both prior loans had 70% LTV, 1.30x DSCR quarterly** (consistent precedent). 2026 markup asks for 1.10x DSCR annual (more aggressive). Extracts Section 8/Schedule 1, identifies Pike/Shah signatures. |
| Beat 5 | (uses all prior data) | Generates commitment letter from beats 3+4 analysis |
| Beat 5b | Beat 5: Generated commitment letter | Creates Box Sign request with embedded signing |
| Beat 6 | Beat 5b: Sign request embed URL | Borrower signs in portal |

## Demo Story Arc

**Conservative Precedent vs. Aggressive Ask:**
- **2023 & 2025 loans:** Harborview agreed to conservative 70% LTV, 1.30x DSCR, quarterly testing
- **2026 markup:** Harborview now requesting 1.10x DSCR (lower/riskier), annual testing (less frequent monitoring)
- **Beat 4 reveal:** Box AI shows the borrower is pushing beyond their own established precedent

---

## Quick Setup Checklist

Upload to **LN-2026-0042** (416352496139):
- [ ] Term sheet with borrower markup ($4.8M, 6.50%, 1.10 DSCR)
- [ ] Metadata: documentType="Term Sheet", policyRisk="Critical"
- [ ] Optional: FY2025 financials (policyRisk="High")
- [ ] Optional: Appraisal (policyRisk="High")

Upload to **LN-2023-0311** (416383268715):
- [ ] ✅ `harborview-loan-agreement-2023-executed.pdf` from /output/pdf
- [ ] Loan: $1.5M @ 7.25%, 70% LTV, 1.30x DSCR quarterly (Section 8 & Schedule 1)
- [ ] Signatures: Pike (Borrower) / Shah (Bank) dated Sept 15, 2023
- [ ] Metadata: documentType="Loan Agreement", versionStatus="Executed"

Upload to **LN-2025-0148** (416381677501):
- [ ] ✅ `harborview-loan-agreement-2025-executed.pdf` from /output/pdf
- [ ] Loan: $2.15M @ 6.95%, 70% LTV, 1.30x DSCR quarterly (Section 8 & Schedule 1)
- [ ] Signatures: Pike (Borrower) / Shah (Bank) dated May 20, 2025
- [ ] Metadata: documentType="Loan Agreement", versionStatus="Executed"

---

## Verifying Metadata is Applied

**Via Box Web UI:**
1. Go to the file in Box
2. Right panel → Info tab → scroll to "Metadata"
3. Should see "losDocument" template with all fields filled

**Via Salesforce/Claude:**
```
Use Box connector → query_metadata with:
{
  "template": "losDocument",
  "query": "loanReference = :ref",
  "query_params": {"ref": "LN-2026-0042"}
}
```

Should return all documents for that loan with their metadata fields.

---

## Common Issues

**Beat 2 finds no critical documents:**
- Check metadata was actually applied (not just saved as draft)
- Verify policyRisk="Critical" (exact case)
- Verify template key is "losDocument" (not "LOS Document" or other variant)

**Beat 3 extracts bank's numbers instead of borrower's markup:**
- Term sheet must clearly label borrower's changes as "HARBORVIEW MARKUP" or similar
- Borrower's numbers must be visually distinct (strikethrough, margin notes, etc.)
- Box AI needs clear context about whose numbers are whose

**Beat 4 can't find covenant sections:**
- Prior loan agreements MUST have "Section 8" and "Schedule 1" headers
- Must explicitly state LTV/DSCR values and testing frequency
- Signatures must be clearly visible with names

**Beat 5b signature request fails:**
- LN-2026-0042 Status must be "Approved" (not Draft/Pending/Closed)
- Commitment letter must exist in folder (generated by Beat 5)
- Template must have Box Sign tags [[s:email:signer]] and [[d:email:signer]]

---

## Metadata Template Reference

The `losDocument` template (enterprise_1023254676.losDocument) has these fields:

| Field | Type | Possible Values | Required |
|-------|------|----------------|----------|
| documentType | enum | "Loan Application", "Term Sheet", "Financial Statement", "Tax Return", "Appraisal", "Insurance", "Loan Agreement" | Yes |
| policyRisk | enum | "Critical", "High", "Medium", "Low" | Yes |
| approvalStatus | enum | "Not Required", "Pending", "Approved", "Rejected" | Yes (use "Pending" for borrower-uploaded docs) |
| borrowerEntity | string | Borrower legal name | Yes |
| loanReference | string | Loan ID (e.g., "LN-2026-0042") | Yes |

All fields are case-sensitive. The UI displays `approvalStatus` in document status pills.

---

## Template Files Location

If you need example PDFs to modify, template documents are in:
```
/output/documents/
```

(Create sample PDFs with the required content and save there for reuse)
