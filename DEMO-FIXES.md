# Demo Issues and Fixes

## Issue 5: React UI Shows "Unclassified 6" / Status Not Updating

**Symptoms:**
- Review progress shows "0 of 6 approved"
- All documents show "Unclassified 6"
- All documents show "Draft" status (not updating to "Approved" after Beat 5)

**Root Cause:**
Documents don't have `losDocument` metadata applied. Box Extract either:
1. Hasn't run yet on these documents
2. Hasn't been configured to set `approvalStatus="Pending"`

**Fix:**
Two options:

### Option A: Re-upload documents (cleanest)
After configuring Box Extract with the Approval Status prompt, delete and re-upload all 7 documents. Box Extract will apply metadata on upload.

### Option B: Manually apply metadata via Box web UI
For each of the 6 documents in LN-2026-0002 folder:
1. Right-click file → More Actions → Apply Metadata
2. Select template "losDocument" (enterprise_1023254676.losDocument)
3. Set:
   - `documentType`: (e.g., "Financial Statement", "Tax Return", etc.)
   - `policyRisk`: "High" or "Medium" (term sheet should be "Critical")
   - `approvalStatus`: **"Pending"**
   - `borrowerEntity`: "Harborview Logistics"
   - `loanReference`: "LN-2026-0002"
4. Save

**Verification:**
After applying metadata, refresh the borrower portal. You should see:
- "0 of 6 approved" (with a number, not "Unclassified")
- Status pills showing "Pending" (orange)
- After Beat 5 runs, status pills change to "Approved" (green)

---

## Issue 6: Beat 6 Blocked - Loan Status Check

**Symptoms:**
```
Box Sign    Refused — loan status is Application, not Approved

Signature is blocked until Credit Committee approval is recorded on the record
```

**Root Cause:**
`prepareSignatureRequest` checks loan status and only allows signing for loans in "Approved" or "Commitment" status. New loans default to "Application" status.

**Fix:**
Before running Beat 6, manually update the loan status in Salesforce:

1. Open LN-2026-0002 record in Salesforce
2. Click Edit
3. Change **Status** from "Application" to **"Approved"**
4. Save

**Then Beat 6 will succeed:**
- Doc Gen: ✅ Creates commitment letter
- Box Sign: ✅ Creates sign request with embed URL

---

## Summary: Demo Prep Checklist

Before running the demo:

- [ ] Configure Box Extract with Approval Status prompt
- [ ] Upload 7 documents to LN-2026-0002 folder
- [ ] Verify documents have `losDocument` metadata with `approvalStatus="Pending"`
- [ ] Set loan status to "Approved" in Salesforce
- [ ] Run Beat 2-6 in sequence
- [ ] After Beat 5, verify UI shows "6 of 6 approved" with green status pills
- [ ] Beat 6 generates letter + creates sign request successfully
